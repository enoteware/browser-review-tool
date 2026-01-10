# Playwright Cloud Infrastructure Plan

## Executive Summary

This document outlines the infrastructure for running Playwright browser automation on a Mac Mini server, exposed via Cloudflare Tunnel, with artifacts served via Vercel Blob. The Mac Mini runs an HTTP server that receives review requests directly from your Vercel app.

## Architecture Overview

```
┌─────────────────┐                              ┌──────────────────────┐
│                 │   POST /review               │                      │
│   Vercel App    │─────────────────────────────▶│  Cloudflare Tunnel   │
│   (Frontend +   │                              │  (review.domain.com) │
│   API)          │◀─────────────────────────────│                      │
│                 │   { reportUrl, artifacts }   └──────────┬───────────┘
└────────▲────────┘                                         │
         │                                                  │
         │ serves artifacts                                 ▼
         │                                       ┌──────────────────────┐
┌────────┴────────┐                              │                      │
│                 │   uploads via @vercel/blob   │   Mac Mini Server    │
│   Vercel Blob   │◀─────────────────────────────│   (Express +         │
│   (Storage)     │                              │    Playwright)       │
│                 │                              │                      │
└─────────────────┘                              └──────────────────────┘
                                                           │
                                                           ▼
                                                 ┌──────────────────────┐
                                                 │                      │
                                                 │   Neon PostgreSQL    │
                                                 │   (Job History)      │
                                                 │                      │
                                                 └──────────────────────┘
```

## Request Flow

```
You click "Generate Review"
         │
         ▼
Vercel API (api/review/generate.ts)
         │
         │  POST https://review.yourdomain.com/review
         │  { title, url, steps, viewports }
         ▼
Cloudflare Tunnel → Mac Mini Express Server
         │
         ├── Runs Playwright (screenshots, video)
         ├── Generates HTML report
         ├── Uploads to Vercel Blob
         ├── Saves job record to Neon
         │
         ▼
Returns { reportUrl, artifacts[] }
         │
         ▼
You see the report
```

## Components

### 1. Vercel Application (Frontend + API)

**Role**: User interface and API gateway

**Responsibilities**:
- Serve web interface for review configuration
- Proxy review requests to Mac Mini
- Return report URLs to user

**API Routes**:
```
api/
├── review/
│   ├── generate.ts   # Proxy to Mac Mini → returns report URL
│   └── history.ts    # List past reviews from Neon
└── health.ts         # Health check
```

### 2. Mac Mini Server (via Cloudflare Tunnel)

**Role**: Execute Playwright reviews

**Setup**:
- Express server on port 3001
- Cloudflare Tunnel exposes as `https://review.yourdomain.com`
- Full Playwright with all browsers
- Uploads directly to Vercel Blob

**Endpoints**:
```
POST /review     - Run a review, return report URL
GET  /health     - Health check
```

### 3. Cloudflare Tunnel

**Role**: Secure exposure of Mac Mini to internet

**Benefits**:
- No port forwarding needed
- No static IP needed
- Automatic HTTPS
- DDoS protection
- Free

### 4. Vercel Blob (Storage)

**Role**: Artifact storage with CDN

**Stores**:
- Screenshots (PNG)
- Videos (WebM)
- HTML reports

### 5. Neon PostgreSQL

**Role**: Job history linked to existing tasks

**New table** (links to your existing `tasks` table):

```sql
-- Task Reviews table (links to existing tasks.id)
CREATE TABLE task_reviews (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,  -- Optional link
  title VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  report_url TEXT NOT NULL,           -- Vercel Blob URL
  artifacts JSONB,                     -- [{type, name, url, viewport}]
  status VARCHAR(50) DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for finding reviews by task
CREATE INDEX idx_task_reviews_task_id ON task_reviews(task_id);
CREATE INDEX idx_task_reviews_created ON task_reviews(created_at DESC);
```

**Usage**:
- `task_id` is **optional** - pass it to link review to a task, or omit for standalone
- Query task reviews: `SELECT * FROM task_reviews WHERE task_id = 123`
- Query all reviews: `SELECT * FROM task_reviews ORDER BY created_at DESC`

## Implementation

### Phase 1: Mac Mini Server

```javascript
// runner/server.mjs
import express from "express";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json());

const API_SECRET = process.env.API_SECRET;
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

// Auth middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Health check (no auth)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main review endpoint
app.post("/review", authenticate, async (req, res) => {
  const jobId = randomUUID();
  const {
    title,
    url,
    baseUrl,
    viewports,
    taskId,      // Optional: link to existing task
  } = req.body;

  console.log(`📋 Starting job ${jobId}: ${title}`);
  if (taskId) console.log(`   Linked to task: ${taskId}`);

  try {
    const outputDir = `/tmp/reviews/${jobId}`;
    const artifactsDir = path.join(outputDir, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const artifacts = [];

    // Process each viewport
    for (const viewport of viewports || [{ name: "desktop", width: 1920, height: 1080 }]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }
      });
      const page = await context.newPage();

      // Navigate to URL
      const targetUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
      await page.goto(targetUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);

      // Take screenshot
      const screenshotName = `${viewport.name}-screenshot.png`;
      const screenshotPath = path.join(artifactsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Upload to Blob
      const screenshotBuffer = await fs.readFile(screenshotPath);
      const blob = await put(`reviews/${jobId}/${screenshotName}`, screenshotBuffer, {
        access: "public",
        contentType: "image/png",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      artifacts.push({
        type: "screenshot",
        name: screenshotName,
        viewport: viewport.name,
        url: blob.url,
      });

      await context.close();
    }

    await browser.close();

    // Generate and upload HTML report
    const targetUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const reportHtml = generateReport(title, targetUrl, artifacts);
    const reportBlob = await put(`reviews/${jobId}/index.html`, reportHtml, {
      access: "public",
      contentType: "text/html",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Save to Neon if configured (taskId is optional)
    if (sql) {
      await sql`
        INSERT INTO task_reviews (task_id, title, target_url, report_url, artifacts)
        VALUES (
          ${taskId || null},
          ${title},
          ${targetUrl},
          ${reportBlob.url},
          ${JSON.stringify(artifacts)}
        )
      `;
      console.log(`   💾 Saved to database`);
    }

    console.log(`✅ Job ${jobId} completed`);

    // Cleanup temp files
    await fs.rm(outputDir, { recursive: true, force: true });

    // Return result
    res.json({
      success: true,
      jobId,
      reportUrl: reportBlob.url,
      artifacts,
      taskId: taskId || null,
    });

  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error.message);
    res.status(500).json({
      success: false,
      jobId,
      error: error.message,
    });
  }
});

function generateReport(title, url, artifacts) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: system-ui; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .artifact { margin: 20px 0; }
    .artifact img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>URL: ${url}</p>
  <p>Generated: ${new Date().toISOString()}</p>
  ${artifacts.map(a => `
    <div class="artifact">
      <h3>${a.name} (${a.viewport})</h3>
      <img src="${a.url}" alt="${a.name}" />
    </div>
  `).join("")}
</body>
</html>`;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Review server running on port ${PORT}`);
  console.log(`📦 Neon: ${sql ? 'connected' : 'not configured (standalone mode)'}`);
});
```

**Request Examples**:

```bash
# With task link (saves to Neon, links to task)
curl -X POST https://review.yourdomain.com/review \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix: Button", "url": "https://example.com", "taskId": 123}'

# Standalone (saves to Neon, no task link)
curl -X POST https://review.yourdomain.com/review \
  -H "Authorization: Bearer $API_SECRET" \
  -d '{"title": "Quick Review", "url": "https://example.com"}'

# No Neon at all (just returns URL, nothing saved)
# Just don't set DATABASE_URL env var
```

### Phase 2: Cloudflare Tunnel Setup

```bash
# On Mac Mini

# 1. Install cloudflared
brew install cloudflared

# 2. Login to Cloudflare
cloudflared tunnel login

# 3. Create tunnel
cloudflared tunnel create browser-review

# 4. Configure tunnel (creates ~/.cloudflared/config.yml)
cat > ~/.cloudflared/config.yml << EOF
tunnel: browser-review
credentials-file: /Users/YOU/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: review.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
EOF

# 5. Add DNS record (run once)
cloudflared tunnel route dns browser-review review.yourdomain.com

# 6. Run tunnel (use PM2 for production)
cloudflared tunnel run browser-review
```

### Phase 3: Vercel API Route

```typescript
// api/review/generate.ts
export async function POST(request: Request) {
  const body = await request.json();

  // Call Mac Mini via Cloudflare Tunnel
  const response = await fetch(process.env.MAC_MINI_URL + "/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MAC_MINI_SECRET}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({
    reportUrl: result.reportUrl,
    artifacts: result.artifacts,
  });
}
```

### Phase 4: Mac Mini Setup (Complete)

```bash
# On Mac Mini

# 1. Clone repository
git clone https://github.com/enoteware/browser-review-tool.git
cd browser-review-tool

# 2. Install dependencies
npm install
npm install express
npx playwright install

# 3. Create .env
cat > .env << EOF
PORT=3001
API_SECRET=your-secret-token-here
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
DATABASE_URL=postgresql://...@...neon.tech/neondb  # Optional: for task linking
OPENAI_API_KEY=sk-...
EOF

# 4. Set up PM2 for server
npm install -g pm2
pm2 start runner/server.mjs --name review-server
pm2 save

# 5. Set up PM2 for Cloudflare Tunnel
pm2 start cloudflared --name cf-tunnel -- tunnel run browser-review
pm2 save

# 6. Enable auto-start on boot
pm2 startup
```

## Environment Variables

### Vercel

```bash
MAC_MINI_URL=https://review.yourdomain.com
MAC_MINI_SECRET=your-secret-token-here
```

### Mac Mini

```bash
PORT=3001
API_SECRET=your-secret-token-here
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
DATABASE_URL=postgresql://...@...neon.tech/neondb  # Optional
OPENAI_API_KEY=sk-...
```

## Cost Estimation

| Component | Cost |
|-----------|------|
| Mac Mini | $0 (already owned) |
| Cloudflare Tunnel | $0 (free) |
| Vercel Blob | Included with Pro |
| Vercel | $0-20/mo |
| Neon (optional) | $0 (free tier) |
| **Total** | **$0-20/mo** |

## Security

1. **API Secret**: Shared secret between Vercel and Mac Mini
2. **Cloudflare Tunnel**: Encrypted connection, no exposed ports
3. **URL Validation**: Sanitize and validate target URLs
4. **Rate Limiting**: Add express-rate-limit if needed
5. **Secrets**: Use `.env` files, add to `.gitignore`

## Testing

```bash
# Test Mac Mini server directly
curl -X POST http://localhost:3001/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{
    "title": "Test Review",
    "url": "https://example.com",
    "viewports": [{"name": "desktop", "width": 1920, "height": 1080}]
  }'

# Test via Cloudflare Tunnel
curl -X POST https://review.yourdomain.com/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{"title": "Test", "url": "https://example.com"}'
```

## Next Steps

### Immediate
1. [ ] Install Express and update runner/server.mjs
2. [ ] Set up Cloudflare Tunnel on Mac Mini
3. [ ] Configure DNS for review.yourdomain.com
4. [ ] Test end-to-end flow

### Short-term
5. [ ] Add Vercel API route to proxy requests
6. [ ] Add multi-step review support
7. [ ] Add video/slideshow recording
8. [ ] Integrate existing HTML report template

### Medium-term
9. [ ] Add Neon for job history
10. [ ] Add AI descriptions
11. [ ] Build review history UI
12. [ ] Add webhook notifications

## References

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Playwright Documentation](https://playwright.dev/)
- [PM2 Process Manager](https://pm2.keymetrics.io/)
