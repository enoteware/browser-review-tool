# Browser Review Tool - Package Summary

This is a standalone, ready-to-use package for creating browser review reports with screenshots and GIF/video recordings.

## What's Included

- ✅ **Main Script** (`src/index.mjs`) - Complete browser review tool
- ✅ **Package Configuration** (`package.json`) - All dependencies defined
- ✅ **Documentation** (`README.md`, `SETUP.md`) - Complete usage guide
- ✅ **Example Config** (`examples/review-config.json`) - Ready-to-use example
- ✅ **License** (MIT)
- ✅ **Gitignore** - Proper exclusions for generated files

## Quick Start

1. **Copy the entire `browser-review-tool/` directory to your new repo**

2. **Install dependencies:**
   ```bash
   npm install
   npx playwright install
   ```

3. **Run your first review:**
   ```bash
   node src/index.mjs --title "My Review" --url http://localhost:3000
   ```

## Features

- 📸 Screenshots (full-page or viewport)
- 🎬 Screen recordings (GIF or WebM)
- 📄 Beautiful HTML reports
- ⚙️ JSON configuration files
- 🚀 Vercel-ready output

## Dependencies

- `@playwright/test` - Browser automation
- Node.js 20+ - Runtime
- ffmpeg (optional) - For GIF conversion

## Output

All reports are generated in `review-reports/` directory with:
- `index.html` - Main report
- `artifacts/` - Screenshots and recordings

## Ready to Deploy

This package is completely self-contained and ready to:
1. Push to a new GitHub repository
2. Install and use immediately
3. Share with your team
4. Deploy reports to Vercel or any static host

No additional configuration needed!
