# Browser Review Tool

Launch browser automation for taking screenshots and screen recordings of web pages.

## What it does

- Opens a browser and navigates to specified URLs
- Takes screenshots and/or records screen interactions
- Generates beautiful HTML reports with all artifacts
- Supports both simple URL reviews and complex multi-step workflows

## Usage Examples

### Quick Screenshot
Take a screenshot of a single page:

```bash
node src/index.mjs --title "Homepage Review" --url http://localhost:3000
```

### Interactive Recording
Run a multi-step review with user interactions:

```bash
node src/index.mjs --config examples/review-config.json
```

### Custom Base URL
Use a different base URL for relative paths:

```bash
node src/index.mjs --title "Form Test" --url /contact --base-url http://localhost:3000
```

## Options

- `--title <title>`: Review title (required)
- `--url <url>`: Single URL to review
- `--config <file>`: JSON config file with review steps
- `--base-url <url>`: Base URL (default: http://localhost:7777)
- `--output <dir>`: Output directory (default: review-reports/)
- `--format <gif|webm>`: Video format (default: gif)
- `--help`: Show help

## Output

Creates a `review-reports/` directory with:
- `index.html`: Beautiful HTML report
- `artifacts/`: All screenshots and recordings

The HTML report can be opened directly in any browser or deployed to Vercel for sharing.

## Quick Commands

### Screenshot Current Page
```bash
node src/index.mjs --title "Current Page Screenshot" --url http://localhost:3000
```

### Form Interaction Test
```bash
node src/index.mjs --config examples/review-config.json
```