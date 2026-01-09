# Browser Review Tool

A standalone tool for creating shareable HTML review reports with screenshots and GIF/video recordings to confirm client fixes.

## Features

- ✅ **Screenshots**: Full-page or viewport screenshots at any point
- 🎬 **Screen Recordings**: Record GIFs or WebM videos of interactions
- 📄 **HTML Reports**: Beautiful, self-contained HTML reports with Invoy/ClientFlow branding
- 🤖 **AI-Generated Descriptions**: Automatically generate descriptions using Vercel AI SDK
- 🎥 **Video Frame Extraction**: Extract key frames from videos for AI analysis
- 🚀 **Vercel Ready**: Reports can be pushed to Vercel for easy sharing
- ⚙️ **Configurable**: JSON config files for complex review workflows
- 💾 **Description Caching**: Cache AI descriptions to avoid re-generation
- 🔗 **ClientFlow Integration**: Link reports back to ClientFlow tasks

## Installation

```bash
npm install
npx playwright install
```

### AI Setup (Optional)

To enable AI-generated descriptions, set up an API key:

1. **For Vercel deployments**: Use `AI_GATEWAY_API_KEY` from Vercel AI Gateway
2. **For local development**: Use `OPENAI_API_KEY` directly

Create a `.env` file in the project root:

```bash
# For Vercel deployments
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key_here

# OR for local dev
OPENAI_API_KEY=your_openai_api_key_here
```

The tool will automatically detect and use the appropriate key. If no key is found, it will work in manual mode (descriptions must be provided manually).

### Web Interface & Deployment

This project includes a web interface that can be deployed to Vercel or any static hosting service.

#### 🌐 **Web Interface**
Access the tool through a beautiful web UI at:
- **Local:** `http://localhost:3000` (when running `npm run dev:web`)
- **Deployed:** Your Vercel URL or custom domain

**Features:**
- **Quick Review Form:** Simple URL-based reviews
- **Config File Editor:** JSON configuration with syntax highlighting
- **Examples Gallery:** Pre-built configurations for common scenarios
- **Command Generator:** Copy-paste ready CLI commands

#### 🚀 **Deploy to Vercel**

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
npm run deploy:web

# Or for development
npm run dev:web
```

**Routes available:**
- `/` - Main web interface
- `/browser-review` - Direct link to browser review docs
- `/init-project` - Direct link to project initialization

#### 📱 **Cursor Slash Commands**

Local Cursor integration:

#### `/browser-review`
Launch browser automation from within Cursor:
- Type `/browser-review` to see documentation and usage examples
- Access the tool directly from Cursor's chat interface

#### `/init-project`
Initialize new projects with proper ignore files:
- Type `/init-project` to set up `.gitignore`, `.cursorignore`, and `.cursorrules`

See [`.cursor/README.md`](.cursor/README.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for complete documentation.

## Development

### Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Optional: Install ffmpeg for GIF conversion
brew install ffmpeg  # macOS
# or
sudo apt-get install ffmpeg  # Linux
```

### Available Scripts

```bash
# Start the tool
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check code formatting
npm run format:check

# Run full build (lint + format check + tests)
npm run build
```

### Development Workflow

1. Make changes to code in `src/`
2. Run tests: `npm test`
3. Check linting: `npm run lint`
4. Format code: `npm run format`
5. Run full build check: `npm run build`

### Code Quality

This project uses:
- **ESLint** for code linting with Node.js ES module rules
- **Prettier** for consistent code formatting
- **Vitest** for testing
- **GitHub Actions** for CI/CD

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `npm run build` to ensure quality checks pass
6. Submit a pull request

## Quick Start

### Simple Review (Single URL)
```bash
node src/index.mjs --title "Fix: Button Styling" --url http://localhost:7777/homepage
```

### Advanced Review (Config File)
```bash
node src/index.mjs --config examples/review-config.json
```

## Usage

### Command Line Options

```bash
node src/index.mjs [options]

Options:
  --title <title>        Review title (required)
  --url <url>            URL to review (required, or use --config)
  --config <file>        JSON config file with review steps
  --base-url <url>       Base URL (default: http://localhost:7777)
  --output <dir>         Output directory (default: review-reports/)
  --format <gif|webm>    Video format (default: gif)
  --description <text>    Manual overall description (overrides AI)
  --client-request <text> Original client request (used by AI)
  --clientflow-url <url> ClientFlow task URL
  --no-ai                Disable AI generation
  --ai-provider <name>   AI provider (default: openai)
  --ai-model <name>      AI model (default: gpt-4o)
  --force-ai             Force AI regeneration (ignore cache)
  --help                 Show help
```

### Config File Format

```json
{
  "title": "Review Title",
  "baseUrl": "http://localhost:7777",
  "videoFormat": "gif",
  "gifQuality": "medium",
  "useAI": true,
  "aiModel": "gpt-4o",
  "maxScreenshotsPerStep": 10,
  "clientRequest": "What the client originally asked for",
  "clientflowTaskUrl": "https://clientflow.example.com/tasks/123",
  "description": "Overall description (optional, AI-generated if not provided)",
  "steps": [
    {
      "name": "Step Name",
      "url": "/page-path",
      "description": "Step description (optional, AI-generated if not provided)",
      "record": true,
      "actions": [
        {
          "type": "screenshot",
          "name": "screenshot-name",
          "fullPage": true
        },
        {
          "type": "click",
          "selector": "button.submit",
          "waitAfter": 1000
        },
        {
          "type": "type",
          "selector": "input[name='email']",
          "text": "test@example.com",
          "waitAfter": 500
        },
        {
          "type": "wait",
          "ms": 2000
        },
        {
          "type": "navigate",
          "url": "/next-page"
        }
      ]
    }
  ]
}
```

### Action Types

- **screenshot**: Take a screenshot
  - `name`: Filename for the screenshot
  - `fullPage`: Boolean, default true

- **click**: Click an element
  - `selector`: CSS selector
  - `waitAfter`: Milliseconds to wait after click

- **type**: Type text into an input
  - `selector`: CSS selector
  - `text`: Text to type
  - `waitAfter`: Milliseconds to wait after typing

- **wait**: Wait for a duration
  - `ms`: Milliseconds to wait

- **navigate**: Navigate to a URL
  - `url`: URL to navigate to

## Output

Reports are generated in `review-reports/` directory:

```
review-reports/
├── index.html          # Main HTML report
└── artifacts/          # Screenshots and recordings
    ├── screenshot1.png
    ├── recording1.gif
    └── ...
```

## Sharing Reports

### Option 1: Vercel (Recommended)

1. Push the `review-reports/` directory to a branch
2. Deploy to Vercel (or use Vercel CLI)
3. Share the URL with your client
4. Delete the deployment when done

```bash
# Quick Vercel deploy
cd review-reports
vercel --prod
```

### Option 2: Static Hosting

Upload the entire `review-reports/` directory to any static hosting service.

### Option 3: Local File

Open `review-reports/index.html` directly in a browser (all assets are relative paths).

## AI Features

### Automatic Description Generation

The tool can automatically generate descriptions for your reports using AI:

- **Screenshot Analysis**: AI analyzes screenshots to understand what's shown
- **Video Frame Extraction**: Extracts key frames from videos/GIFs for analysis
- **Context-Aware**: Uses client requests and step context to generate relevant descriptions
- **Cost Controls**: Limits screenshots analyzed per step (default: 10)
- **Caching**: Descriptions are cached to avoid re-generation

### How It Works

1. After capturing screenshots/videos, the tool extracts key frames from videos
2. If `useAI` is true (default) and descriptions are missing:
   - For each step: Analyzes up to `maxScreenshotsPerStep` screenshots + video frames
   - Generates step descriptions explaining what was shown
   - Generates overall description from all steps
3. Descriptions are saved to `review-reports/config.json` for caching
4. Use `--force-ai` to regenerate descriptions even if cached

### Video Frame Extraction

Videos and GIFs are analyzed by extracting key frames:
- **3 frames per video**: Start, middle, and end
- **Automatic cleanup**: Extracted frames are removed after analysis
- **Requires ffmpeg**: Frame extraction uses ffmpeg (same as GIF conversion)

## Requirements

- **Node.js** 20+
- **Playwright** (installed via npm)
- **ffmpeg** (optional, for GIF conversion and video frame extraction)
  - Install: `brew install ffmpeg` (macOS) or `apt-get install ffmpeg` (Linux)

If ffmpeg is not installed:
- Videos will be saved as WebM instead of GIFs
- Video frame extraction for AI analysis will be skipped

## Invoy/ClientFlow Branding

Reports are styled to match Invoy/ClientFlow branding for a consistent client experience. The HTML templates use:
- Invoy color palette and typography
- ClientFlow task links prominently displayed
- Professional, clean design matching the ClientFlow app

## Examples

See the `examples/` directory for example configuration files.

## Tips

1. **Use GIFs for short interactions**: GIFs are great for showing quick interactions but can be large for long recordings
2. **Use WebM for longer recordings**: Set `"videoFormat": "webm"` for longer interactions
3. **Adjust GIF quality**: Use `"gifQuality": "low"` for faster conversion and smaller files
4. **Full page screenshots**: Set `"fullPage": true` to capture entire scrollable pages
5. **Wait times**: Add `waitAfter` to actions to ensure animations complete before next action

## Troubleshooting

**ffmpeg not found**: Install ffmpeg or use `"videoFormat": "webm"` instead of GIF

**Screenshots are blank**: Make sure the page has loaded - add `"wait"` actions before screenshots

**Recordings are too large**: Use lower GIF quality or WebM format, or record shorter interactions

**Selector not found**: Use browser DevTools to verify CSS selectors before running the review

## License

MIT
