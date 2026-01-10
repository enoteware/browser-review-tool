# Playwright Cloud Infrastructure Plan

## Executive Summary

This document outlines the cloud infrastructure architecture for running Playwright browser automation in the cloud, enabling browser review tool execution without requiring local browser installation.

## Current State

### Local Execution (Current)
- Playwright runs locally via `chromium.launch()`
- Requires `npx playwright install` on user machine
- Screenshots and recordings saved to local `review-reports/` directory
- Reports deployed manually via Vercel CLI

### Limitations
- Requires Node.js and Playwright installation
- Browser binaries are ~500MB+
- Not suitable for serverless/web-based execution
- Can't run in CI/CD without browser setup

## Proposed Architecture

### Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│                 │     │                      │     │                 │
│   Vercel App    │────▶│  Cloudflare Workers  │────▶│  Cloudflare R2  │
│   (Frontend +   │     │  (Browser Rendering) │     │  (Artifact      │
│   API Routes)   │     │                      │     │   Storage)      │
│                 │     │                      │     │                 │
└────────┬────────┘     └──────────────────────┘     └─────────────────┘
         │                                                    │
         │              ┌──────────────────────┐              │
         │              │                      │              │
         └─────────────▶│   Neon PostgreSQL    │◀─────────────┘
                        │   (Job Queue +       │
                        │    Metadata)         │
                        │                      │
                        └──────────────────────┘
```

### Components

#### 1. Vercel Application (Frontend + API)
- **Role**: User interface and API gateway
- **Responsibilities**:
  - Serve web interface for review configuration
  - Accept review job submissions via API
  - Return job status and results
  - Serve generated reports from R2

#### 2. Cloudflare Workers (Browser Rendering)
- **Role**: Headless browser execution
- **Technology**: Cloudflare Browser Rendering with `@cloudflare/puppeteer`
- **Responsibilities**:
  - Execute Playwright/Puppeteer scripts
  - Capture screenshots and video frames
  - Create slideshow recordings
  - Upload artifacts to R2
- **Constraints**:
  - 30-second CPU time limit per request
  - Must use Cloudflare's Puppeteer fork (not standard Playwright)
  - One browser session per Worker invocation

#### 3. Cloudflare R2 (Storage)
- **Role**: Artifact storage
- **Responsibilities**:
  - Store screenshots (PNG)
  - Store recordings (WebM slideshows)
  - Store generated HTML reports
  - Serve static assets with CDN
- **Benefits**:
  - No egress fees
  - S3-compatible API
  - Global CDN distribution

#### 4. Neon PostgreSQL (Database)
- **Role**: Job queue and metadata storage
- **Responsibilities**:
  - Store review job configurations
  - Track job status (pending, running, completed, failed)
  - Store artifact metadata and URLs
  - Enable job history and auditing

## Implementation Phases

### Phase 1: Cloudflare Worker Setup

#### 1.1 Create Worker Project

```bash
# Initialize Cloudflare Worker
npm create cloudflare@latest browser-review-worker
cd browser-review-worker
```

#### 1.2 Configure wrangler.toml

```toml
name = "browser-review-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# Enable Browser Rendering
browser = { binding = "BROWSER" }

# R2 bucket binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "browser-review-artifacts"

# Environment variables
[vars]
ENVIRONMENT = "production"
```

#### 1.3 Worker Implementation

```typescript
// src/index.ts
import puppeteer from "@cloudflare/puppeteer";

interface ReviewConfig {
  url: string;
  title: string;
  viewport?: { width: number; height: number };
  actions?: Action[];
}

interface Action {
  type: "screenshot" | "click" | "type" | "wait" | "scroll";
  selector?: string;
  text?: string;
  ms?: number;
  x?: number;
  y?: number;
  name?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const config: ReviewConfig = await request.json();
    const browser = await puppeteer.launch(env.BROWSER);

    try {
      const page = await browser.newPage();
      await page.setViewport(config.viewport || { width: 1920, height: 1080 });
      await page.goto(config.url, { waitUntil: "networkidle0" });

      const artifacts: string[] = [];

      // Execute actions and capture screenshots
      for (const action of config.actions || []) {
        if (action.type === "screenshot") {
          const screenshot = await page.screenshot({ fullPage: true });
          const key = `${Date.now()}-${action.name || "screenshot"}.png`;
          await env.BUCKET.put(key, screenshot);
          artifacts.push(key);
        }
        // ... handle other action types
      }

      return Response.json({ success: true, artifacts });
    } finally {
      await browser.close();
    }
  }
};
```

### Phase 2: Vercel API Integration

#### 2.1 API Route Structure

```
api/
├── review/
│   ├── submit.ts      # Submit new review job
│   ├── status/[id].ts # Check job status
│   └── result/[id].ts # Get job result/report
├── webhook/
│   └── cloudflare.ts  # Receive Worker completion callbacks
└── health.ts          # Health check
```

#### 2.2 Submit Review Endpoint

```typescript
// api/review/submit.ts
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  const { title, url, steps, viewports } = req.body;

  // Create job in database
  const [job] = await sql`
    INSERT INTO review_jobs (title, url, config, status)
    VALUES (${title}, ${url}, ${JSON.stringify({ steps, viewports })}, 'pending')
    RETURNING id
  `;

  // Trigger Cloudflare Worker
  const workerResponse = await fetch(process.env.CLOUDFLARE_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
    },
    body: JSON.stringify({
      jobId: job.id,
      callbackUrl: `${process.env.VERCEL_URL}/api/webhook/cloudflare`,
      config: { title, url, steps, viewports }
    })
  });

  return res.json({ jobId: job.id, status: "pending" });
}
```

### Phase 3: Database Schema

#### 3.1 Neon PostgreSQL Schema

```sql
-- Review Jobs table
CREATE TABLE review_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  config JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT
);

-- Artifacts table
CREATE TABLE review_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES review_jobs(id),
  type VARCHAR(50) NOT NULL, -- 'screenshot', 'video', 'slideshow'
  name VARCHAR(255),
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  viewport VARCHAR(50),
  step_index INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reports table
CREATE TABLE review_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES review_jobs(id) UNIQUE,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  public_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_status ON review_jobs(status);
CREATE INDEX idx_jobs_created ON review_jobs(created_at);
CREATE INDEX idx_artifacts_job ON review_artifacts(job_id);
```

### Phase 4: R2 Storage Setup

#### 4.1 Create R2 Bucket

```bash
# Using Wrangler CLI
wrangler r2 bucket create browser-review-artifacts
```

#### 4.2 Configure CORS for Public Access

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

#### 4.3 R2 Upload Utility

```typescript
// lib/r2-client.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadToR2(key: string, data: Buffer, contentType: string) {
  const client = createR2Client();
  await client.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return `https://${process.env.CLOUDFLARE_R2_BUCKET}.${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}
```

## Environment Variables

### Vercel Environment Variables

```bash
# Cloudflare
CLOUDFLARE_API_TOKEN=           # Workers API token
CLOUDFLARE_ACCOUNT_ID=          # Account ID
CLOUDFLARE_WORKER_URL=          # Deployed Worker URL
CLOUDFLARE_R2_ACCESS_KEY_ID=    # R2 S3-compatible key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=# R2 S3-compatible secret
CLOUDFLARE_R2_BUCKET=           # R2 bucket name

# Neon
DATABASE_URL=                   # Neon PostgreSQL connection string

# Existing
SITE_PASSWORD=                  # Web interface password
OPENAI_API_KEY=                 # For AI descriptions
```

### Cloudflare Worker Environment

```bash
# Set via wrangler secret
wrangler secret put DATABASE_URL
wrangler secret put CALLBACK_SECRET
```

## Cloudflare Browser Rendering Limitations

### Important Constraints

1. **CPU Time Limit**: 30 seconds max CPU time per request
2. **Memory**: 128MB limit
3. **Browser Version**: Uses Cloudflare's managed Chromium (not user-selectable)
4. **No Playwright**: Must use `@cloudflare/puppeteer` (Puppeteer fork)
5. **One Session Per Request**: Cannot maintain browser pools
6. **No Video Recording**: Must use screenshot-based slideshows

### Workarounds

| Limitation | Workaround |
|------------|------------|
| No video recording | Capture screenshots, combine into slideshow WebM |
| 30s CPU limit | Break long reviews into multiple Worker invocations |
| No Playwright | Port Playwright actions to Puppeteer equivalents |
| Memory limits | Process one viewport at a time |

## Migration Path

### From Local to Cloud Execution

1. **Phase 1**: Keep local execution, add cloud as option
   - `--cloud` flag triggers cloud execution
   - Local remains default for development

2. **Phase 2**: Web interface uses cloud by default
   - CLI still supports local execution
   - Web submissions always use cloud

3. **Phase 3**: Full cloud migration
   - Local execution for development only
   - All production reviews via cloud

## Cost Estimation

### Cloudflare (Pay-as-you-go)

| Service | Free Tier | Beyond Free |
|---------|-----------|-------------|
| Workers | 100K requests/day | $0.50/million |
| Browser Rendering | Included with Workers Paid | ~$0.02/session |
| R2 Storage | 10GB/month | $0.015/GB/month |
| R2 Egress | Unlimited | $0 (no egress fees!) |

### Neon PostgreSQL

| Tier | Included | Cost |
|------|----------|------|
| Free | 0.5GB storage, 1 project | $0 |
| Launch | 10GB storage | $19/month |

### Estimated Monthly Cost

For ~1000 reviews/month:
- Workers: ~$0.50
- Browser Rendering: ~$20
- R2 Storage: ~$0.15 (10GB)
- Neon: $0 (free tier)
- **Total: ~$21/month**

## Security Considerations

1. **API Authentication**: All Worker endpoints require Bearer token
2. **URL Validation**: Sanitize and validate review URLs
3. **Rate Limiting**: Implement per-IP and per-user limits
4. **Content Security**: Scan screenshots for sensitive content
5. **Secrets Management**: Use Cloudflare Secrets and Vercel env vars

## Next Steps

### Immediate Actions

1. [ ] Create Cloudflare API token with required permissions
2. [ ] Create R2 bucket and API tokens
3. [ ] Set up Neon database and run migrations
4. [ ] Initialize Cloudflare Worker project
5. [ ] Implement basic screenshot capture in Worker

### Short-term (1-2 weeks)

6. [ ] Implement full action execution in Worker
7. [ ] Add slideshow creation in Worker
8. [ ] Create Vercel API routes
9. [ ] Integrate web interface with cloud execution
10. [ ] Add job status polling

### Medium-term (2-4 weeks)

11. [ ] Multi-viewport support
12. [ ] AI description generation in cloud
13. [ ] Report generation and hosting
14. [ ] Job history and management UI
15. [ ] Performance optimization

## References

- [Cloudflare Browser Rendering Docs](https://developers.cloudflare.com/browser-rendering/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Neon Serverless Driver](https://neon.tech/docs/serverless/serverless-driver)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
