# Sharing Browser Review Reports

## Video Hosting

The browser review tool generates self-contained HTML reports with embedded videos and screenshots. **All assets use relative paths**, which means:

✅ **The entire `review-reports/` directory must be hosted together**
- HTML file: `review-reports/index.html`
- Videos: `review-reports/artifacts/*.webm` or `*.gif`
- Screenshots: `review-reports/artifacts/*.png`

## Quick Deploy Options

### Option 1: Vercel (Easiest)

```bash
# After generating a report
npm run share:report

# Or manually:
cd review-reports
vercel --prod
```

This will:
1. Deploy the entire `review-reports/` directory to Vercel
2. Give you a shareable URL (e.g., `https://your-project.vercel.app`)
3. Videos and screenshots will work automatically

### Option 2: GitHub Pages

1. Create a new branch: `git checkout -b review-report`
2. Copy `review-reports/` contents to a `docs/` folder
3. Push and enable GitHub Pages in repo settings
4. Share the GitHub Pages URL

### Option 3: Any Static Host

Upload the entire `review-reports/` directory to:
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront
- Any static hosting service

**Important**: Keep the directory structure intact (artifacts folder must be at the same level as index.html)

## File Structure

```
review-reports/
├── index.html          # Main report (references artifacts with relative paths)
└── artifacts/          # All media files
    ├── video1.webm
    ├── video2.webm
    ├── screenshot1.png
    └── ...
```

## Notes

- Videos are embedded as `<video>` tags with relative `src` paths
- GIFs are embedded as `<img>` tags with relative `src` paths
- All paths are relative, so the directory structure must be preserved
- Reports are self-contained - no external dependencies needed

## Cleanup

After sharing, you can:
- Delete the Vercel deployment: `vercel remove`
- Delete local files: `rm -rf review-reports/`
- Or keep for your records
