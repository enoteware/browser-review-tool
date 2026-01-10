# Playwright Cloud Infrastructure Plan

## Executive Summary

This document outlines the infrastructure for running Playwright browser automation on a Mac Mini server, with job queue and metadata stored in Neon PostgreSQL, and artifacts served via Vercel Blob. This approach provides full Playwright capabilities without serverless limitations.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────────┐
│                 │         │                      │
│   Vercel App    │────────▶│   Neon PostgreSQL    │
│   (Frontend +   │         │   (Job Queue +       │
│   API + Blob)   │         │    Metadata)         │
│                 │         │                      │
└────────▲────────┘         └──────────┬───────────┘
         │                             │
         │ uploads artifacts           │ polls for jobs
         │                             ▼
         │                  ┌──────────────────────┐
         │                  │                      │
         └──────────────────│   Mac Mini Server    │
                            │   (Playwright +      │
                            │    Job Runner)       │
                            │                      │
                            └──────────────────────┘
```

## Why Mac Mini Over Serverless?

| Feature | Mac Mini | Cloudflare Workers |
|---------|----------|-------------------|
| Full Playwright | ✅ Yes | ❌ Puppeteer only |
| Video recording | ✅ Native WebM/GIF | ❌ Screenshots only |
| CPU time limit | ✅ Unlimited | ❌ 30 seconds |
| Memory | ✅ 8-16GB+ | ❌ 128MB |
| Browser choice | ✅ Chrome/Firefox/Safari | ❌ Managed Chromium |
| Cost | ✅ Already owned | 💰 ~$20/mo for rendering |
| Complexity | ✅ Simple Node.js | ❌ Worker limitations |

## Components

### 1. Vercel Application (Frontend + API)

**Role**: User interface and job submission

**Responsibilities**:
- Serve web interface for review configuration
- Submit jobs to Neon database
- Return job status and results
- Proxy artifact URLs from R2

**API Routes**:
```
api/
├── review/
│   ├── submit.ts      # Submit new review job → INSERT into Neon
│   ├── status/[id].ts # Check job status → SELECT from Neon
│   └── result/[id].ts # Get job result/artifacts
└── health.ts          # Health check
```

### 2. Neon PostgreSQL (Job Queue)

**Role**: Central job queue and metadata storage

**Why Neon**:
- Serverless PostgreSQL (scales to zero)
- Already in your stack
- No need for Redis/SQS complexity
- Simple polling from Mac Mini

### 3. Mac Mini Server (Job Runner)

**Role**: Execute Playwright reviews

**Setup**:
- Node.js + existing `browser-review-tool` code
- Long-running process that polls Neon for jobs
- Full Playwright with all browsers
- Real video recording capability

**Process Flow**:
1. Poll Neon every 5 seconds for `status = 'pending'` jobs
2. Claim job (set `status = 'running'`)
3. Execute Playwright review using existing `src/index.mjs`
4. Upload artifacts to Vercel Blob
5. Update job with results (set `status = 'completed'`)

### 4. Vercel Blob (Storage)

**Role**: Artifact storage with CDN

**Benefits**:
- Simple `put()` API from `@vercel/blob`
- Automatic CDN via Vercel Edge Network
- Already part of Vercel ecosystem (no extra accounts)
- Returns public URLs directly

## Implementation

### Phase 1: Database Schema

```sql
-- Review Jobs table
CREATE TABLE review_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  config JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  -- pending → running → completed | failed
  worker_id VARCHAR(100),        -- Mac Mini identifier
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Artifacts table
CREATE TABLE review_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES review_jobs(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,     -- 'screenshot', 'video', 'slideshow', 'report'
  name VARCHAR(255),
  blob_url TEXT NOT NULL,        -- Vercel Blob public URL
  viewport VARCHAR(50),          -- 'desktop', 'mobile'
  step_index INTEGER,
  file_size INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for polling
CREATE INDEX idx_jobs_pending ON review_jobs(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_status ON review_jobs(status);
CREATE INDEX idx_artifacts_job ON review_artifacts(job_id);
```

### Phase 2: Vercel API - Submit Job

```typescript
// api/review/submit.ts
import { neon } from "@neondatabase/serverless";

export async function POST(request: Request) {
  const sql = neon(process.env.DATABASE_URL!);
  const body = await request.json();

  const { title, url, baseUrl, steps, viewports, useAI, clientRequest } = body;

  // Validate required fields
  if (!title || !url) {
    return Response.json({ error: "title and url required" }, { status: 400 });
  }

  // Insert job
  const [job] = await sql`
    INSERT INTO review_jobs (title, url, config, status)
    VALUES (
      ${title},
      ${url},
      ${JSON.stringify({ baseUrl, steps, viewports, useAI, clientRequest })},
      'pending'
    )
    RETURNING id, created_at
  `;

  return Response.json({
    jobId: job.id,
    status: "pending",
    createdAt: job.created_at
  });
}
```

### Phase 3: Mac Mini Job Runner

```javascript
// runner/job-runner.mjs
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { runReview } from "../src/index.mjs";
import fs from "fs/promises";
import path from "path";

const WORKER_ID = process.env.WORKER_ID || `mac-mini-${Date.now()}`;
const POLL_INTERVAL = 5000; // 5 seconds

async function claimJob(sql) {
  // Atomically claim oldest pending job
  const [job] = await sql`
    UPDATE review_jobs
    SET status = 'running',
        worker_id = ${WORKER_ID},
        started_at = NOW()
    WHERE id = (
      SELECT id FROM review_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return job;
}

async function uploadToBlob(pathname, content, contentType) {
  const blob = await put(pathname, content, {
    access: "public",
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

async function processJob(sql, job) {
  const config = {
    title: job.title,
    url: job.url,
    outputDir: `/tmp/reviews/${job.id}`,
    ...job.config
  };

  try {
    // Run the review using existing code
    await runReview(config);

    // Upload artifacts to Vercel Blob
    const artifactsDir = path.join(config.outputDir, "artifacts");
    const files = await fs.readdir(artifactsDir);

    for (const file of files) {
      const filePath = path.join(artifactsDir, file);
      const content = await fs.readFile(filePath);
      const blobUrl = await uploadToBlob(
        `reviews/${job.id}/${file}`,
        content,
        getMimeType(file)
      );

      // Record artifact in database
      await sql`
        INSERT INTO review_artifacts (job_id, type, name, blob_url)
        VALUES (${job.id}, ${getArtifactType(file)}, ${file}, ${blobUrl})
      `;
    }

    // Upload HTML report
    const reportPath = path.join(config.outputDir, "index.html");
    const reportContent = await fs.readFile(reportPath);
    const reportUrl = await uploadToBlob(
      `reviews/${job.id}/index.html`,
      reportContent,
      "text/html"
    );

    await sql`
      INSERT INTO review_artifacts (job_id, type, name, blob_url)
      VALUES (${job.id}, 'report', 'index.html', ${reportUrl})
    `;

    // Mark job complete
    await sql`
      UPDATE review_jobs
      SET status = 'completed', completed_at = NOW()
      WHERE id = ${job.id}
    `;

    console.log(`✅ Job ${job.id} completed`);
    console.log(`📄 Report: ${reportUrl}`);

    // Cleanup temp files
    await fs.rm(config.outputDir, { recursive: true, force: true });

  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error.message);

    await sql`
      UPDATE review_jobs
      SET status = 'failed',
          error_message = ${error.message},
          completed_at = NOW()
      WHERE id = ${job.id}
    `;
  }
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webm": "video/webm",
    ".gif": "image/gif",
    ".html": "text/html",
  };
  return types[ext] || "application/octet-stream";
}

function getArtifactType(filename) {
  if (filename.endsWith(".png") || filename.endsWith(".jpg")) return "screenshot";
  if (filename.endsWith(".webm")) return "video";
  if (filename.endsWith(".gif")) return "gif";
  return "other";
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  console.log(`🚀 Job runner started (worker: ${WORKER_ID})`);
  console.log(`📡 Polling every ${POLL_INTERVAL / 1000}s...`);

  while (true) {
    try {
      const job = await claimJob(sql);

      if (job) {
        console.log(`📋 Processing job ${job.id}: ${job.title}`);
        await processJob(sql, job);
      }
    } catch (error) {
      console.error("Poll error:", error.message);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

main();
```

### Phase 4: Mac Mini Setup

```bash
# On Mac Mini

# 1. Clone repository
git clone https://github.com/enoteware/browser-review-tool.git
cd browser-review-tool

# 2. Install dependencies
npm install
npx playwright install

# 3. Create .env for runner
cat > .env.runner << EOF
DATABASE_URL=postgres://...@...neon.tech/reviews
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...  # From Vercel Dashboard
WORKER_ID=mac-mini-1
OPENAI_API_KEY=sk-...  # For AI descriptions
EOF

# 4. Run with PM2 for process management
npm install -g pm2
pm2 start runner/job-runner.mjs --name browser-review-runner
pm2 save
pm2 startup  # Enable auto-start on boot
```

## Environment Variables

### Vercel

```bash
DATABASE_URL=postgres://...@...neon.tech/reviews
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...  # Auto-created when you add Blob storage
```

### Mac Mini Runner

```bash
DATABASE_URL=postgres://...@...neon.tech/reviews
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...  # Same token, get from Vercel Dashboard
WORKER_ID=mac-mini-1
OPENAI_API_KEY=sk-...
```

## Cost Estimation

| Component | Cost |
|-----------|------|
| Mac Mini | $0 (already owned) |
| Neon PostgreSQL | $0 (free tier: 0.5GB) |
| Vercel Blob | Included with Pro ($20/mo includes 1GB, then $0.15/GB) |
| Vercel | $0 (hobby) or $20/mo (pro) |
| **Total** | **$0-20/mo** |

Note: Vercel Hobby includes limited Blob storage. Pro plan recommended for production.

## Scaling Considerations

### Single Mac Mini (Current)
- ~100-500 reviews/day capacity
- Sequential processing
- Simple to manage

### Multiple Workers (Future)
- Add more Mac Minis or cloud VMs
- Each polls same Neon queue
- `FOR UPDATE SKIP LOCKED` prevents duplicate processing
- Horizontal scaling as needed

### Optimization Options
1. **Browser pooling**: Keep browser instances warm
2. **Parallel viewports**: Run desktop/mobile simultaneously
3. **Priority queue**: Add `priority` column for urgent jobs
4. **Scheduled jobs**: Add `scheduled_for` timestamp

## Security

1. **Database**: Neon connection requires SSL
2. **Blob token**: Keep `BLOB_READ_WRITE_TOKEN` secret, never commit
3. **Job validation**: Sanitize URLs, limit domains
4. **Runner isolation**: Each job in temp directory, cleaned after
5. **Secrets**: Use `.env` files, add to `.gitignore`

## Monitoring

```javascript
// Simple health check endpoint
// api/health.ts
export async function GET() {
  const sql = neon(process.env.DATABASE_URL);

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'running') as running,
      COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour') as completed_1h,
      COUNT(*) FILTER (WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '1 hour') as failed_1h
    FROM review_jobs
  `;

  return Response.json({
    queue: stats,
    timestamp: new Date().toISOString()
  });
}
```

## Next Steps

### Immediate
1. [ ] Create Neon database and run schema migration
2. [ ] Enable Vercel Blob storage in project settings
3. [ ] Create `runner/` directory with job runner code
4. [ ] Test job runner locally before deploying to Mac Mini

### Short-term
5. [ ] Add Vercel API routes for job submission
6. [ ] Update web interface to submit jobs via API
7. [ ] Deploy job runner to Mac Mini with PM2
8. [ ] Add job status polling to web interface

### Medium-term
9. [ ] Add retry logic for failed jobs
10. [ ] Implement job cancellation
11. [ ] Add webhook notifications on completion
12. [ ] Build job history/management UI

## References

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Neon Serverless Driver](https://neon.tech/docs/serverless/serverless-driver)
- [PM2 Process Manager](https://pm2.keymetrics.io/)
- [Playwright Documentation](https://playwright.dev/)
