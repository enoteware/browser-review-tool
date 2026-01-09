# Setup Guide

## Quick Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Install ffmpeg (optional, for GIF conversion):**
   ```bash
   # macOS
   brew install ffmpeg
   
   # Linux
   sudo apt-get install ffmpeg
   
   # Windows (using Chocolatey)
   choco install ffmpeg
   ```

## Usage

### Basic Usage

```bash
node src/index.mjs --title "My Review" --url http://localhost:3000
```

### With Config File

```bash
node src/index.mjs --config examples/review-config.json
```

## Project Structure

```
browser-review-tool/
├── src/
│   └── index.mjs          # Main script
├── examples/
│   └── review-config.json  # Example configuration
├── package.json
├── README.md
├── SETUP.md
├── LICENSE
└── .gitignore
```

## Output

All reports are generated in the `review-reports/` directory (created automatically).

## Next Steps

1. Create your own config files in the `examples/` directory
2. Run reviews and share the generated HTML reports
3. Deploy reports to Vercel or any static hosting service
