# 🚀 Deployment Guide

This guide explains how to deploy the Browser Review Tool to various platforms.

## 🌐 Web Interface Deployment

The tool includes a beautiful web interface that can be deployed anywhere static files are served.

### Vercel (Recommended)

**One-click deployment:**
1. Fork this repository on GitHub
2. Connect your GitHub account to [Vercel](https://vercel.com)
3. Import your forked repository
4. Vercel will automatically detect the configuration and deploy

**Manual deployment:**
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
npm run deploy:web

# Or for production
vercel --prod
```

**Routes after deployment:**
- `https://your-app.vercel.app/` - Main web interface
- `https://your-app.vercel.app/browser-review` - Browser review docs
- `https://your-app.vercel.app/init-project` - Project initialization

### Netlify

1. Connect your GitHub repository to [Netlify](https://netlify.com)
2. Set build command: `echo "Static deployment - no build needed"`
3. Set publish directory: `web/`
4. Add redirect rules in `netlify.toml`:

```toml
[[redirects]]
  from = "/browser-review"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/init-project"
  to = "/index.html"
  status = 200
```

### GitHub Pages

1. Enable GitHub Pages in repository settings
2. Set source to "Deploy from a branch"
3. Create a `docs/` folder and copy `web/` contents there
4. Or use GitHub Actions for automated deployment

### Other Static Hosts

The web interface works on any static hosting service:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- Firebase Hosting

Just upload the contents of the `web/` directory.

## 🖥️ CLI Tool Deployment

### npm Package

The tool is published as an npm package:

```bash
# Install globally
npm install -g browser-review-tool

# Use anywhere
browser-review --title "My Review" --url http://example.com
```

### Docker Container

For containerized deployments with full browser automation:

```dockerfile
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    curl \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install --with-deps

# Copy app source
COPY . .

# Create non-root user
RUN useradd -r -u 1001 browseruser
USER browseruser

EXPOSE 3000

CMD ["node", "src/index.mjs"]
```

## 🔧 API Deployment

The included API routes can be deployed to serverless platforms:

### Vercel Functions

The `api/browser-review.js` file is automatically deployed as a serverless function.

**Usage:**
```bash
curl -X POST https://your-app.vercel.app/api/browser-review \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API Review",
    "url": "http://example.com",
    "baseUrl": "http://example.com"
  }'
```

**Response:**
```json
{
  "message": "Browser review command prepared",
  "command": "node src/index.mjs --title \"API Review\" --url \"http://example.com\" --base-url \"http://example.com\"",
  "note": "This is a demo API. For actual execution, run the command locally or in a containerized environment.",
  "localExecution": {
    "install": "npm install && npx playwright install",
    "run": "node src/index.mjs --title \"API Review\" --url \"http://example.com\" --base-url \"http://example.com\"",
    "output": "review-reports/index.html"
  }
}
```

### Other Serverless Platforms

The API can be deployed to:
- AWS Lambda + API Gateway
- Google Cloud Functions
- Azure Functions
- Netlify Functions

## 🌟 Demo Deployment

A live demo is available at: [https://browser-review-tool.vercel.app](https://browser-review-tool.vercel.app)

## 📋 Environment Variables

For production deployments, consider these environment variables:

```bash
# Vercel environment variables
NODE_ENV=production
BASE_URL=https://your-domain.com

# Custom configuration
DEFAULT_VIEWPORT_WIDTH=1920
DEFAULT_VIEWPORT_HEIGHT=1080
DEFAULT_VIDEO_FORMAT=gif
```

## 🔒 Security Considerations

- The web interface is client-side only - no sensitive data is processed server-side
- API routes include basic validation but should be enhanced for production use
- Browser automation requires careful resource management in serverless environments
- Consider rate limiting for public deployments

## 📞 Support

For deployment issues, check:
1. Vercel deployment logs
2. Browser console for client-side errors
3. Serverless function logs for API issues
4. Ensure all dependencies are properly installed