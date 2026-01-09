---
name: Add AI-Generated Descriptions with Vercel AI and Invoy Branding
overview: Use Vercel's AI infrastructure to automatically generate descriptions for reports, and ensure the UI matches Invoy/ClientFlow branding. The tool will integrate with ClientFlow project management and use Invoy's design system.
todos:
  - id: review-invoy-branding
    content: Review Invoy repository to extract color palette, typography, spacing, and component styles
    status: pending
  - id: add-vercel-ai-dependencies
    content: Add ai (Vercel AI SDK) and dotenv npm packages to dependencies
    status: pending
  - id: create-ai-description-function
    content: Create generateAIDescription() function using Vercel AI SDK with AI Gateway to analyze screenshots and generate descriptions
    status: pending
    dependencies:
      - add-vercel-ai-dependencies
  - id: add-api-key-detection
    content: Add AI Gateway API key detection (AI_GATEWAY_API_KEY) with fallback to OPENAI_API_KEY for local dev
    status: pending
    dependencies:
      - add-vercel-ai-dependencies
  - id: extend-config-schema
    content: Add description, clientRequest, clientflowTaskUrl, useAI, aiProvider, and aiModel fields to config
    status: pending
  - id: add-cli-flags
    content: Add --description, --client-request, --clientflow-url, --no-ai, --ai-provider, and --ai-model CLI flags
    status: pending
    dependencies:
      - extend-config-schema
  - id: update-html-template-branding
    content: Update HTML template CSS to match Invoy branding (colors, typography, spacing, components)
    status: pending
    dependencies:
      - review-invoy-branding
  - id: integrate-ai-generation
    content: Integrate AI description generation into report creation flow using Vercel AI SDK
    status: pending
    dependencies:
      - create-ai-description-function
      - extend-config-schema
  - id: add-description-sections
    content: Add description sections to HTML report (overall, client request, step descriptions) with Invoy styling
    status: pending
    dependencies:
      - extend-config-schema
      - update-html-template-branding
  - id: add-error-handling
    content: Add graceful error handling for missing API key, rate limits, and API failures
    status: pending
    dependencies:
      - create-ai-description-function
  - id: add-env-example
    content: Create .env.example file with AI_GATEWAY_API_KEY documentation
    status: pending
    dependencies:
      - add-api-key-detection
  - id: update-example-config
    content: Add example with AI fields to examples/review-config.json
    status: pending
    dependencies:
      - extend-config-schema
  - id: update-documentation
    content: Update README.md with Vercel AI features, AI Gateway setup, Invoy branding info, and usage examples
    status: pending
    dependencies:
      - add-cli-flags
      - add-description-sections
      - add-env-example
---

# Add AI-Generated Descriptions with Vercel AI and Invoy Branding

## Overview

Use Vercel's AI infrastructure (AI Gateway and AI SDK) to automatically generate descriptions for browser review reports. The AI will analyze screenshots, videos, and client requests to create friendly explanations. Additionally, ensure the HTML reports match Invoy/ClientFlow branding and design system.

## Use Case

- ClientFlow project management: Clients create requests/tasks
- Developer completes work and runs browser review
- AI analyzes screenshots/videos using Vercel AI Gateway
- Generates descriptions explaining what was shown and how it proves completion
- Report explains: "Client asked for X, here's proof we delivered Y" (AI-generated)
- Link back to ClientFlow task for context
- Reports match Invoy branding for consistent client experience

## Implementation Steps

### 1. Review Invoy Branding

- Check Invoy repository (https://github.com/enoteware/invoi) for:
- Color palette (primary, secondary, accent colors)
- Typography (font families, sizes, weights)
- Spacing system (margins, padding, gaps)
- Component styles (buttons, cards, badges)
- Logo/branding assets
- Extract CSS variables or design tokens if available
- Document branding guidelines

### 2. Add Vercel AI SDK

- Install `ai` npm package (Vercel AI SDK)
- Install `dotenv` for environment variables
- Add Vercel AI Gateway API key configuration
- Create function to call AI Gateway with vision capabilities

### 3. AI Description Generation

Create `generateAIDescription()` function that:

- Uses Vercel AI SDK with `streamText` or `generateText`
- Takes screenshots/videos, client request, and step context
- Uses AI Gateway to route to OpenAI (or other providers)
- Generates descriptions explaining:
- What the screenshot/video shows
- How it relates to the client request
- What was accomplished
- Returns generated description text

### 4. Config Schema Updates

Add new optional fields:

- `description` (string) - Overall description (auto-generated if not provided)
- `clientRequest` (string) - What the client originally asked for
- `clientflowTaskUrl` (string) - Link to ClientFlow task/request
- `steps[].description` (string) - Description for each step (auto-generated if not provided)
- `useAI` (boolean, default: true) - Enable/disable AI generation
- `aiProvider` (string, default: "openai") - AI provider via Vercel Gateway
- `aiModel` (string, default: "gpt-4o") - Model to use

### 5. CLI Arguments

Add flags:

- `--description "Text"` - Manual overall description (overrides AI)
- `--client-request "Text"` - Original client request (used by AI)
- `--clientflow-url "URL"` - ClientFlow task URL
- `--no-ai` - Disable AI generation (use manual descriptions only)
- `--ai-provider "provider"` - Specify AI provider (openai, anthropic, etc.)
- `--ai-model "model-name"` - Specify model

### 6. Update HTML Template with Invoy Branding

Replace current styling with Invoy design system:

- Update color palette to match Invoy
- Update typography to match Invoy fonts
- Update spacing/sizing to match Invoy system
- Add Invoy logo/branding if available
- Update button/link styles to match Invoy components
- Ensure consistent look with ClientFlow app

### 7. API Key Setup

- Use `AI_GATEWAY_API_KEY` environment variable (Vercel standard)
- Or get from Vercel dashboard: AI Gateway > API keys
- Fallback to `OPENAI_API_KEY` if AI Gateway key not found (for local dev)
- Document setup in README

### 8. AI Generation Flow

During report generation:

1. After capturing screenshots/videos
2. If `useAI` is true and descriptions are missing:

- For each step with screenshots/videos:
- Send images to AI Gateway (using AI SDK)
- Include client request context
- Generate step description
- Generate overall description from all steps

3. Store generated descriptions in artifacts/config
4. Use in HTML report

### 9. HTML Report Updates

Add sections with Invoy styling:

- **Description section** - AI-generated or manual explanation
- **Client Request section** - What was originally asked for
- **ClientFlow Link** - Button styled to match Invoy/ClientFlow
- **Step descriptions** - AI-generated explanations above artifacts
- **Branding header** - Invoy logo/branding if available

### 10. Error Handling

- Handle missing API key gracefully (fallback to manual descriptions)
- Handle AI Gateway rate limits
- Handle API errors (show warning, continue without AI)
- Support local development with direct OpenAI key

## Files to Modify

- `package.json` - Add `ai` and `dotenv` dependencies
- `src/index.mjs` - Add Vercel AI SDK integration, description generation, update HTML template with Invoy branding
- `examples/review-config.json` - Add example with AI fields
- `README.md` - Document Vercel AI features, API key setup, and Invoy branding
- `.env.example` - Add AI_GATEWAY_API_KEY example

## Success Criteria

- AI generates descriptions automatically using Vercel AI Gateway
- Descriptions explain what screenshots/videos show
- Descriptions connect client requests to demonstrated work
- Manual descriptions can override AI
- Works without API key (manual mode)
- Works seamlessly with Vercel deployments
- ClientFlow links are prominently displayed
- HTML reports match Invoy/ClientFlow branding exactly
- Consistent visual experience with ClientFlow app
- Can switch AI providers via Vercel Gateway without code changes