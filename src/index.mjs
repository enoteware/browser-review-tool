#!/usr/bin/env node

/**
 * Browser Review Tool
 *
 * Takes screenshots and records GIFs/videos of browser interactions
 * to create shareable HTML review reports for client fixes.
 *
 * Usage:
 *   browser-review --title "Fix: Button Styling" --url http://localhost:7777/fix-page
 *   browser-review --config review-config.json
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get API key for AI Gateway or OpenAI
function getAPIKey() {
  // For local development, prefer OpenAI key (easier to use)
  // For Vercel deployments, AI Gateway key will be used automatically
  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, type: 'direct' };
  }
  // Fallback to AI Gateway key (for Vercel deployments)
  if (process.env.AI_GATEWAY_API_KEY) {
    // Note: Vercel AI Gateway keys need special configuration
    // For local dev, use OPENAI_API_KEY instead
    console.warn(
      '⚠️  Using AI_GATEWAY_API_KEY. For local development, OPENAI_API_KEY is recommended.',
    );
    return { key: process.env.AI_GATEWAY_API_KEY, type: 'gateway' };
  }
  return null;
}

// Get OpenAI model configured for AI Gateway or direct
function getOpenAIModel(modelName = 'gpt-4o') {
  const apiKeyInfo = getAPIKey();
  if (!apiKeyInfo) {
    return null;
  }

  // Create OpenAI provider and get model
  const provider = createOpenAI({
    apiKey: apiKeyInfo.key,
    // For Vercel AI Gateway, the baseURL would be set via environment or gateway config
    // For now, we'll use direct OpenAI - gateway routing happens at deployment
  });

  return provider(modelName);
}

// Configuration
const DEFAULT_CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:7777',
  outputDir: path.join(process.cwd(), 'review-reports'),
  viewport: { width: 1920, height: 1080 },
  videoFormat: 'slideshow', // 'slideshow' (default, lightweight), 'webm' (full video), 'gif'
  slideshowFps: 2, // frames per second for slideshow
  gifQuality: 'medium', // 'low', 'medium', 'high'
  screenshotFormat: 'png',
  useAI: true,
  aiProvider: 'openai',
  aiModel: 'gpt-4o',
  maxScreenshotsPerStep: 10,
};

// Parse command line arguments
async function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--title':
        if (i + 1 >= args.length) {
          throw new Error('--title requires a value');
        }
        config.title = args[++i];
        if (!config.title.trim()) {
          throw new Error('--title cannot be empty');
        }
        break;
      case '--url':
        if (i + 1 >= args.length) {
          throw new Error('--url requires a value');
        }
        config.url = args[++i];
        try {
          new URL(config.url);
        } catch {
          throw new Error(`--url must be a valid URL: ${config.url}`);
        }
        break;
      case '--config': {
        if (i + 1 >= args.length) {
          throw new Error('--config requires a file path');
        }
        const configFile = args[++i];
        try {
          const configData = JSON.parse(await fs.readFile(configFile, 'utf-8'));
          Object.assign(config, configData);
        } catch (error) {
          if (error.code === 'ENOENT') {
            throw new Error(`Config file not found: ${configFile}`);
          }
          throw new Error(`Invalid JSON in config file ${configFile}: ${error.message}`);
        }
        break;
      }
      case '--base-url':
        if (i + 1 >= args.length) {
          throw new Error('--base-url requires a value');
        }
        config.baseUrl = args[++i];
        try {
          new URL(config.baseUrl);
        } catch {
          throw new Error(`--base-url must be a valid URL: ${config.baseUrl}`);
        }
        break;
      case '--output':
        if (i + 1 >= args.length) {
          throw new Error('--output requires a directory path');
        }
        config.outputDir = args[++i];
        break;
      case '--format':
        if (i + 1 >= args.length) {
          throw new Error('--format requires a value');
        }
        config.videoFormat = args[++i];
        if (!['slideshow', 'webm', 'gif'].includes(config.videoFormat)) {
          throw new Error('--format must be "slideshow", "webm", or "gif"');
        }
        break;
      case '--description':
        if (i + 1 >= args.length) {
          throw new Error('--description requires a value');
        }
        config.description = args[++i];
        break;
      case '--client-request':
        if (i + 1 >= args.length) {
          throw new Error('--client-request requires a value');
        }
        config.clientRequest = args[++i];
        break;
      case '--clientflow-url':
        if (i + 1 >= args.length) {
          throw new Error('--clientflow-url requires a value');
        }
        config.clientflowTaskUrl = args[++i];
        try {
          new URL(config.clientflowTaskUrl);
        } catch {
          throw new Error(`--clientflow-url must be a valid URL: ${config.clientflowTaskUrl}`);
        }
        break;
      case '--no-ai':
        config.useAI = false;
        break;
      case '--ai-provider':
        if (i + 1 >= args.length) {
          throw new Error('--ai-provider requires a value');
        }
        config.aiProvider = args[++i];
        break;
      case '--ai-model':
        if (i + 1 >= args.length) {
          throw new Error('--ai-model requires a value');
        }
        config.aiModel = args[++i];
        break;
      case '--force-ai':
        config.forceAI = true;
        break;
      case '--help':
        console.log(`
Browser Review Tool

Usage:
  browser-review [options]

Options:
  --title <title>        Review title (required)
  --url <url>            URL to review (required, or use --config)
  --config <file>        JSON config file with review steps
  --base-url <url>       Base URL (default: http://localhost:7777)
  --output <dir>         Output directory (default: review-reports/)
  --format <gif|webm>    Video format (default: gif)
  --description <text>   Manual overall description (overrides AI)
  --client-request <text> Original client request (used by AI)
  --clientflow-url <url> ClientFlow task URL
  --no-ai                Disable AI generation
  --ai-provider <name>   AI provider (default: openai)
  --ai-model <name>      AI model (default: gpt-4o)
  --force-ai             Force AI regeneration (ignore cache)
  --help                 Show this help

Config File Format:
  {
    "title": "Review Title",
    "baseUrl": "http://localhost:7777",
    "steps": [
      {
        "name": "Step 1: Homepage",
        "url": "/",
        "actions": [
          { "type": "screenshot", "name": "homepage-before" },
          { "type": "click", "selector": "button.submit" },
          { "type": "wait", "ms": 1000 },
          { "type": "screenshot", "name": "homepage-after" }
        ],
        "record": true
      }
    ]
  }
`);
        process.exit(0);
        break;
      default: {
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
      }
    }
  }

  return config;
}

// Ensure directory exists
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Check if ffmpeg is available
function checkFFmpeg() {
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Convert video to GIF using ffmpeg
async function convertVideoToGif(videoPath, gifPath, quality = 'medium') {
  const hasFFmpeg = checkFFmpeg();
  if (!hasFFmpeg) {
    console.warn('⚠️  ffmpeg not found. Skipping GIF conversion. Install ffmpeg for GIF support.');
    return false;
  }

  const qualitySettings = {
    low: { palettegen: 'dither=bayer:bayer_scale=5', paletteuse: 'dither=bayer' },
    medium: { palettegen: 'dither=bayer:bayer_scale=3', paletteuse: 'dither=bayer' },
    high: { palettegen: 'stats_mode=single', paletteuse: 'dither=floyd_steinberg' },
  };

  const settings = qualitySettings[quality] || qualitySettings.medium;

  try {
    // Generate palette
    const palettePath = gifPath.replace('.gif', '-palette.png');
    execSync(`ffmpeg -i "${videoPath}" -vf "${settings.palettegen}" -y "${palettePath}"`, {
      stdio: 'ignore',
    });

    // Convert to GIF
    const ffmpegCmd =
      `ffmpeg -i "${videoPath}" -i "${palettePath}" ` +
      `-lavfi "${settings.paletteuse}" -y "${gifPath}"`;
    execSync(ffmpegCmd, { stdio: 'ignore' });

    // Clean up palette
    await fs.unlink(palettePath).catch(() => {});

    return true;
  } catch (error) {
    console.error('Error converting video to GIF:', error.message);
    return false;
  }
}

// Extract key frames from video for AI analysis
async function extractVideoFrames(videoPath, outputDir, maxFrames = 3) {
  const hasFFmpeg = checkFFmpeg();
  if (!hasFFmpeg) {
    console.warn('⚠️  ffmpeg not found. Skipping video frame extraction.');
    return [];
  }

  try {
    // Get video duration
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration ` +
        `-of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf-8' },
    );
    const duration = parseFloat(durationOutput.trim());
    if (!duration || duration <= 0) {
      console.warn(`⚠️  Could not determine video duration for ${videoPath}`);
      return [];
    }

    const frames = [];
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const frameTimes = [];

    // Extract frames at start, middle, and end (or evenly spaced if duration is short)
    if (duration <= 3) {
      // For short videos, extract evenly spaced frames
      for (let i = 0; i < maxFrames; i++) {
        frameTimes.push((duration / (maxFrames + 1)) * (i + 1));
      }
    } else {
      // For longer videos, extract at start, middle, end
      frameTimes.push(0.5); // Start (slightly offset from 0)
      frameTimes.push(duration / 2); // Middle
      frameTimes.push(Math.max(0.5, duration - 1)); // End (1s before end)
    }

    for (let i = 0; i < Math.min(frameTimes.length, maxFrames); i++) {
      const time = frameTimes[i];
      const framePath = path.join(outputDir, `${baseName}-frame-${i + 1}.png`);
      try {
        execSync(`ffmpeg -i "${videoPath}" -ss ${time} -vframes 1 -y "${framePath}"`, {
          stdio: 'ignore',
        });
        frames.push({
          path: framePath,
          time,
          index: i + 1,
        });
      } catch (error) {
        console.warn(`⚠️  Failed to extract frame at ${time}s: ${error.message}`);
      }
    }

    return frames;
  } catch (error) {
    console.warn(`⚠️  Error extracting frames from ${videoPath}: ${error.message}`);
    return [];
  }
}

// Create lightweight WebM slideshow from screenshots
async function createSlideshowFromScreenshots(screenshotPaths, outputPath, fps = 2) {
  const hasFFmpeg = checkFFmpeg();
  if (!hasFFmpeg) {
    console.warn('⚠️  ffmpeg not found. Skipping slideshow creation.');
    return false;
  }

  if (screenshotPaths.length === 0) {
    console.warn('⚠️  No screenshots provided for slideshow.');
    return false;
  }

  try {
    const outputDir = path.dirname(outputPath);
    const concatFilePath = path.join(outputDir, 'slideshow-concat.txt');

    // Create concat file for ffmpeg
    // Each frame displayed for 1/fps seconds
    const frameDuration = 1 / fps;
    const concatContent = screenshotPaths
      .map(p => `file '${p}'\nduration ${frameDuration}`)
      .join('\n');
    // Add last frame again (ffmpeg concat demuxer quirk)
    const lastFrame = screenshotPaths[screenshotPaths.length - 1];
    await fs.writeFile(concatFilePath, `${concatContent}\nfile '${lastFrame}'`);

    // Create WebM slideshow with low bitrate for small file size
    const ffmpegCmd =
      `ffmpeg -f concat -safe 0 -i "${concatFilePath}" ` +
      `-vf "scale=1280:-2" -c:v libvpx-vp9 -crf 40 -b:v 0 ` +
      `-an -y "${outputPath}"`;
    execSync(ffmpegCmd, { stdio: 'ignore' });

    // Clean up concat file
    await fs.unlink(concatFilePath).catch(() => {});

    return true;
  } catch (error) {
    console.error('Error creating slideshow:', error.message);
    return false;
  }
}

// Generate AI description for images using Vercel AI SDK
async function generateAIDescription(images, clientRequest, stepContext, config) {
  const apiKeyInfo = getAPIKey();
  if (!apiKeyInfo) {
    throw new Error(
      'No API key found. Set AI_GATEWAY_API_KEY or OPENAI_API_KEY environment variable.',
    );
  }

  const model = getOpenAIModel(config.aiModel || 'gpt-4o');
  if (!model) {
    throw new Error('Failed to initialize OpenAI model');
  }

  // Limit images to cost control
  const imagesToAnalyze = images.slice(0, config.maxScreenshotsPerStep || 10);

  // Convert images to base64
  const imageParts = [];
  for (const imgPath of imagesToAnalyze) {
    try {
      const imageBuffer = await fs.readFile(imgPath);
      const base64 = imageBuffer.toString('base64');
      // Determine MIME type from extension
      const ext = path.extname(imgPath).toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'image/png';
      imageParts.push({
        type: 'image',
        image: `data:${mimeType};base64,${base64}`,
      });
    } catch (error) {
      console.warn(`⚠️  Failed to read image ${imgPath}: ${error.message}`);
    }
  }

  if (imageParts.length === 0) {
    throw new Error('No valid images to analyze');
  }

  // Build prompt
  const clientRequestText = clientRequest ? `Client Request: ${clientRequest}\n\n` : '';
  const stepContextText = stepContext ? `Step Context: ${stepContext}\n\n` : '';
  const prompt =
    `You are analyzing browser screenshots/video frames from a development review. 

${clientRequestText}${stepContextText}Please analyze these images and provide a clear, ` +
    `friendly description that:
1. Describes what is shown in the screenshots/frames
2. Explains how it relates to the client's request (if provided)
3. Highlights what was accomplished or demonstrated

Keep the description concise (2-3 sentences) and professional.`;

  try {
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageParts],
        },
      ],
      maxTokens: 500,
    });

    return result.text;
  } catch (error) {
    // Retry with exponential backoff for rate limits
    if (error.status === 429 || error.message.includes('rate limit')) {
      console.warn('⚠️  Rate limit hit, retrying with backoff...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: prompt }, ...imageParts],
            },
          ],
          maxTokens: 500,
        });
        return result.text;
      } catch (retryError) {
        throw new Error(`AI generation failed after retry: ${retryError.message}`);
      }
    }
    throw new Error(`AI generation failed: ${error.message}`);
  }
}

// Load cached descriptions from config.json
async function loadCachedDescriptions(outputDir) {
  const configPath = path.join(outputDir, 'config.json');
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.warn(`⚠️  Failed to load cached descriptions: ${error.message}`);
    return null;
  }
}

// Save generated descriptions to config.json
async function saveCachedDescriptions(outputDir, descriptions) {
  const configPath = path.join(outputDir, 'config.json');
  const apiKeyInfo = getAPIKey();
  const cacheData = {
    ...descriptions,
    generatedAt: new Date().toISOString(),
    model: descriptions.model || 'gpt-4o',
    apiKeyType: apiKeyInfo?.type || 'unknown',
  };
  try {
    await fs.writeFile(configPath, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    console.warn(`⚠️  Failed to save cached descriptions: ${error.message}`);
  }
}

// Generate HTML report
async function generateHTMLReport(config, artifacts, descriptions = null) {
  await ensureDir(config.outputDir);
  const timestamp = new Date().toISOString();
  const reportPath = path.join(config.outputDir, 'index.html');

  const screenshots = artifacts.filter(a => a.type === 'screenshot');
  const videos = artifacts.filter(
    a => a.type === 'video' || a.type === 'gif' || a.type === 'slideshow',
  );

  // Group artifacts by step for display
  const artifactsByStep = new Map();
  for (const artifact of artifacts) {
    const stepKey =
      artifact.stepIndex !== undefined && artifact.stepIndex >= 0 ? artifact.stepIndex : 'none';
    if (!artifactsByStep.has(stepKey)) {
      artifactsByStep.set(stepKey, []);
    }
    artifactsByStep.get(stepKey).push(artifact);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title || 'Browser Review'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/css-device-frames@1/dist/css-device-frames.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
        'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #f5f5f7;
      min-height: 100vh;
      padding: 0;
      color: #1d1d1f;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      background: #ffffff;
      border-radius: 18px;
      padding: 40px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      border: 0.5px solid rgba(0, 0, 0, 0.1);
    }

    h1 {
      font-size: 48px;
      font-weight: 600;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
      color: #1d1d1f;
      line-height: 1.1;
    }

    .meta {
      display: flex;
      gap: 24px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 0.5px solid rgba(0, 0, 0, 0.1);
      font-size: 14px;
      color: #86868b;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .meta-item strong {
      color: #1d1d1f;
      font-weight: 500;
    }

    .clientflow-link {
      color: #007aff;
      text-decoration: none;
      font-weight: 500;
      transition: opacity 0.2s;
    }

    .clientflow-link:hover {
      opacity: 0.7;
    }

    .client-request,
    .description {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 0.5px solid rgba(0, 0, 0, 0.1);
    }

    .client-request h3,
    .description h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1d1d1f;
    }

    .client-request p,
    .description p {
      font-size: 15px;
      line-height: 1.6;
      color: #1d1d1f;
    }

    .step-section {
      margin-bottom: 32px;
    }

    .step-header {
      margin-bottom: 16px;
    }

    .step-header h3 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1d1d1f;
    }

    .step-description {
      font-size: 15px;
      line-height: 1.6;
      color: #1d1d1f;
      margin-bottom: 16px;
      padding: 16px;
      background: #f5f5f7;
      border-radius: 8px;
      border-left: 3px solid #007aff;
    }

    .section {
      background: #ffffff;
      border-radius: 18px;
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      border: 0.5px solid rgba(0, 0, 0, 0.1);
    }

    .section h2 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 24px;
      color: #1d1d1f;
    }

    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-top: 24px;
    }

    .artifact {
      background: #f5f5f7;
      border-radius: 12px;
      padding: 16px;
      border: 0.5px solid rgba(0, 0, 0, 0.1);
    }

    .artifact h3,
    .artifact h4 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1d1d1f;
    }

    /* Device frame overrides */
    .app-frame {
      margin: 0;
    }

    .app-frame img,
    .app-frame video {
      width: 100%;
      height: auto;
      display: block;
    }

    .app-frame video {
      background: #000;
    }

    .artifact img,
    .artifact video {
      width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
      display: block;
    }

    .artifact video {
      background: #000;
    }

    .artifact-info {
      margin-top: 8px;
      font-size: 12px;
      color: #86868b;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      margin-top: 8px;
    }

    .status-pass {
      background: #d1fae5;
      color: #065f46;
    }

    .status-fail {
      background: #fee2e2;
      color: #991b1b;
    }

    .status-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }

    .summary-item {
      text-align: center;
      padding: 20px;
      background: #f5f5f7;
      border-radius: 12px;
    }

    .summary-item-value {
      font-size: 32px;
      font-weight: 600;
      color: #1d1d1f;
      margin-bottom: 4px;
    }

    .summary-item-label {
      font-size: 14px;
      color: #86868b;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${config.title || 'Browser Review'}</h1>
      <div class="meta">
        <div class="meta-item">
          <strong>Date:</strong> ${new Date(timestamp).toLocaleString()}
        </div>
        <div class="meta-item">
          <strong>Base URL:</strong> ${config.baseUrl}
        </div>
        ${config.url ? `<div class="meta-item"><strong>URL:</strong> ${config.url}</div>` : ''}
        ${
          config.clientflowTaskUrl || descriptions?.clientflowTaskUrl
            ? `<div class="meta-item">
              <a href="${
                config.clientflowTaskUrl || descriptions?.clientflowTaskUrl
              }" target="_blank" class="clientflow-link">
                View ClientFlow Task →
              </a>
            </div>`
            : ''
        }
      </div>
      ${
        descriptions?.clientRequest || config.clientRequest
          ? `<div class="client-request">
            <h3>Client Request</h3>
            <p>${descriptions?.clientRequest || config.clientRequest}</p>
          </div>`
          : ''
      }
      ${
        descriptions?.description || config.description
          ? `<div class="description">
            <h3>Description</h3>
            <p>${descriptions?.description || config.description}</p>
          </div>`
          : ''
      }
    </header>

    <section class="section">
      <h2>Summary</h2>
      <div class="summary">
        <div class="summary-item">
          <div class="summary-item-value">${screenshots.length}</div>
          <div class="summary-item-label">Screenshots</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-value">${videos.length}</div>
          <div class="summary-item-label">Recordings</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-value">${artifacts.length}</div>
          <div class="summary-item-label">Total Artifacts</div>
        </div>
      </div>
    </section>

    ${
      config.steps && Array.isArray(config.steps) && artifactsByStep.size > 0
        ? Array.from(artifactsByStep.entries())
            .filter(([stepKey]) => stepKey !== 'none')
            .map(([stepKey, stepArtifacts]) => {
              const stepIndex = parseInt(stepKey);
              const step = config.steps[stepIndex];
              const stepDescription = descriptions?.steps?.find(s => s.stepIndex === stepIndex);
              const stepScreenshots = stepArtifacts.filter(a => a.type === 'screenshot');
              const stepVideos = stepArtifacts.filter(
                a => a.type === 'video' || a.type === 'gif' || a.type === 'slideshow',
              );

              return `
    <section class="section step-section">
      <div class="step-header">
        <h3>${step.name}</h3>
        ${
          stepDescription?.description
            ? `<div class="step-description">${stepDescription.description}</div>`
            : ''
        }
      </div>
      ${
        stepScreenshots.length > 0 || stepVideos.length > 0
          ? `<div class="artifact-grid">
            ${stepScreenshots
              .map(
                art => `
              <div class="artifact">
                <h4>${art.name}</h4>
                <div class="app-frame mac">
                  <img src="artifacts/${path.basename(art.path)}" alt="${art.name}" />
                </div>
                <div class="artifact-info">
                  ${art.timestamp ? `Captured: ${new Date(art.timestamp).toLocaleString()}` : ''}
                </div>
              </div>
            `,
              )
              .join('')}
            ${stepVideos
              .map(
                art => `
              <div class="artifact">
                <h4>${art.name}</h4>
                <div class="app-frame mac">
                ${
                  art.type === 'gif'
                    ? `<img src="artifacts/${path.basename(art.path)}" alt="${art.name}" />`
                    : `
                  <video controls>
                    <source src="artifacts/${path.basename(art.path)}" type="video/webm">
                    Your browser does not support the video tag.
                  </video>
                `
                }
                </div>
                <div class="artifact-info">
                  ${art.duration ? `Duration: ${art.duration}s` : ''}
                  ${art.timestamp ? `Recorded: ${new Date(art.timestamp).toLocaleString()}` : ''}
                </div>
              </div>
            `,
              )
              .join('')}
          </div>`
          : ''
      }
    </section>
    `;
            })
            .join('')
        : ''
    }

    ${
      artifactsByStep.get('none') && artifactsByStep.get('none').length > 0
        ? `
    <section class="section">
      <h2>Artifacts</h2>
      <div class="artifact-grid">
        ${artifactsByStep
          .get('none')
          .map(
            art => `
          <div class="artifact">
            <h3>${art.name}</h3>
            <div class="app-frame mac">
            ${
              art.type === 'screenshot'
                ? `<img src="artifacts/${path.basename(art.path)}" alt="${art.name}" />`
                : art.type === 'gif'
                  ? `<img src="artifacts/${path.basename(art.path)}" alt="${art.name}" />`
                  : `
              <video controls>
                <source src="artifacts/${path.basename(art.path)}" type="video/webm">
                Your browser does not support the video tag.
              </video>
            `
            }
            </div>
            <div class="artifact-info">
              ${art.duration ? `Duration: ${art.duration}s` : ''}
              ${art.timestamp ? `Captured: ${new Date(art.timestamp).toLocaleString()}` : ''}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </section>
    `
        : ''
    }
  </div>
</body>
</html>`;

  await fs.writeFile(reportPath, html);
  return reportPath;
}

// Main review function
async function runReview(config) {
  console.log('🎬 Running browser review...');

  try {
    // Ensure output directory exists
    await ensureDir(config.outputDir);

    // Create artifacts directory
    const artifactsDir = path.join(config.outputDir, 'artifacts');
    await ensureDir(artifactsDir);

    const artifacts = [];

    console.log('🌐 Launching browser...');
    let browser;
    try {
      browser = await chromium.launch({
        headless: false, // Non-headless for better recording
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // For better compatibility
      });
    } catch (error) {
      const msg =
        `Failed to launch browser: ${error.message}. ` +
        'Make sure Playwright is installed (npx playwright install)';
      throw new Error(msg);
    }

    try {
      const context = await browser.newContext({
        viewport: config.viewport,
        recordVideo:
          config.videoFormat === 'webm'
            ? {
                dir: artifactsDir,
                size: config.viewport,
              }
            : undefined,
      });

      const page = await context.newPage();

      // If single URL provided, do a simple review
      if (config.url) {
        console.log(`📍 Navigating to ${config.url}`);
        try {
          await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (error) {
          throw new Error(`Failed to load URL ${config.url}: ${error.message}`);
        }

        await page.waitForTimeout(1000); // Wait for animations

        // Take screenshot
        const screenshotPath = path.join(artifactsDir, 'review-screenshot.png');
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          artifacts.push({
            type: 'screenshot',
            name: 'Page Screenshot',
            path: screenshotPath,
            timestamp: Date.now(),
            stepIndex: -1, // Single URL, no step
            stepName: null,
          });
          console.log('✅ Screenshot captured');
        } catch (error) {
          throw new Error(`Failed to capture screenshot: ${error.message}`);
        }
      }

      // If config has steps, execute them
      if (config.steps && Array.isArray(config.steps)) {
        for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex++) {
          const step = config.steps[stepIndex];
          console.log(`\n📋 Step ${stepIndex + 1}: ${step.name}`);

          if (step.url) {
            const fullUrl = step.url.startsWith('http') ? step.url : `${config.baseUrl}${step.url}`;
            console.log(`   Navigating to ${fullUrl}`);
            await page.goto(fullUrl, { waitUntil: 'networkidle' });
            await page.waitForTimeout(500);
          }

          let videoPath = null;
          if (step.record) {
            const stepName = step.name.replace(/\s+/g, '-').toLowerCase();

            // Slideshow mode: take periodic screenshots, combine into lightweight WebM
            if (config.videoFormat === 'slideshow') {
              const slideshowScreenshots = [];

              // Navigate to step URL
              const stepUrl = step.url
                ? step.url.startsWith('http')
                  ? step.url
                  : `${config.baseUrl}${step.url}`
                : page.url();
              await page.goto(stepUrl, { waitUntil: 'networkidle' });
              await page.waitForTimeout(300);

              // Take initial screenshot
              const initialSsPath = path.join(artifactsDir, `${stepName}-slide-000.png`);
              await page.screenshot({ path: initialSsPath });
              slideshowScreenshots.push(initialSsPath);

              // Execute actions with periodic screenshots
              let slideIndex = 1;
              if (step.actions) {
                for (const action of step.actions) {
                  switch (action.type) {
                    case 'screenshot': {
                      const ssPath = path.join(artifactsDir, `${action.name || 'screenshot'}.png`);
                      await page.screenshot({
                        path: ssPath,
                        fullPage: action.fullPage !== false,
                      });
                      artifacts.push({
                        type: 'screenshot',
                        name: action.name || 'Screenshot',
                        path: ssPath,
                        timestamp: Date.now(),
                        stepIndex,
                        stepName: step.name,
                      });
                      // Also add to slideshow
                      slideshowScreenshots.push(ssPath);
                      break;
                    }
                    case 'click':
                      await page.click(action.selector);
                      await page.waitForTimeout(action.waitAfter || 500);
                      break;
                    case 'type':
                      await page.fill(action.selector, action.text);
                      await page.waitForTimeout(action.waitAfter || 300);
                      break;
                    case 'wait':
                      await page.waitForTimeout(action.ms || 1000);
                      break;
                    case 'navigate': {
                      const navUrl = action.url.startsWith('http')
                        ? action.url
                        : `${config.baseUrl}${action.url}`;
                      await page.goto(navUrl, { waitUntil: 'networkidle' });
                      await page.waitForTimeout(500);
                      break;
                    }
                  }

                  // Take screenshot after each action for slideshow
                  const slidePath = path.join(
                    artifactsDir,
                    `${stepName}-slide-${String(slideIndex++).padStart(3, '0')}.png`,
                  );
                  await page.screenshot({ path: slidePath });
                  slideshowScreenshots.push(slidePath);
                }
              }

              // Create WebM slideshow from screenshots
              if (slideshowScreenshots.length > 0) {
                const slideshowPath = path.join(artifactsDir, `${stepName}-slideshow.webm`);
                console.log(`   Creating slideshow from ${slideshowScreenshots.length} frames...`);
                const created = await createSlideshowFromScreenshots(
                  slideshowScreenshots,
                  slideshowPath,
                  config.slideshowFps || 2,
                );
                if (created) {
                  videoPath = slideshowPath;
                  artifacts.push({
                    type: 'slideshow',
                    name: step.name,
                    path: slideshowPath,
                    frameCount: slideshowScreenshots.length,
                    timestamp: Date.now(),
                    stepIndex,
                    stepName: step.name,
                  });
                  // Clean up individual slideshow screenshots (keep explicit screenshots)
                  for (const ssPath of slideshowScreenshots) {
                    if (ssPath.includes('-slide-')) {
                      await fs.unlink(ssPath).catch(() => {});
                    }
                  }
                  console.log('   ✅ Slideshow created');
                }
              }
            } else {
              // Full video recording mode (webm or gif)
              const videoContext = await browser.newContext({
                viewport: config.viewport,
                recordVideo: {
                  dir: artifactsDir,
                  size: config.viewport,
                },
              });
              const videoPage = await videoContext.newPage();

              // Navigate to the same URL as the main page or step URL
              const stepUrl = step.url
                ? step.url.startsWith('http')
                  ? step.url
                  : `${config.baseUrl}${step.url}`
                : page.url();
              await videoPage.goto(stepUrl, { waitUntil: 'networkidle' });
              await videoPage.waitForTimeout(500);

              // Execute actions
              if (step.actions) {
                for (const action of step.actions) {
                  switch (action.type) {
                    case 'screenshot': {
                      const ssPath = path.join(artifactsDir, `${action.name || 'screenshot'}.png`);
                      await videoPage.screenshot({
                        path: ssPath,
                        fullPage: action.fullPage !== false,
                      });
                      artifacts.push({
                        type: 'screenshot',
                        name: action.name || 'Screenshot',
                        path: ssPath,
                        timestamp: Date.now(),
                        stepIndex,
                        stepName: step.name,
                      });
                      break;
                    }
                    case 'click':
                      await videoPage.click(action.selector);
                      await videoPage.waitForTimeout(action.waitAfter || 500);
                      break;
                    case 'type':
                      await videoPage.fill(action.selector, action.text);
                      await videoPage.waitForTimeout(action.waitAfter || 300);
                      break;
                    case 'wait':
                      await videoPage.waitForTimeout(action.ms || 1000);
                      break;
                    case 'navigate': {
                      const navUrl = action.url.startsWith('http')
                        ? action.url
                        : `${config.baseUrl}${action.url}`;
                      await videoPage.goto(navUrl, { waitUntil: 'networkidle' });
                      await videoPage.waitForTimeout(500);
                      break;
                    }
                  }
                }
              }

              // Stop recording
              await videoContext.close();

              // Find the video file
              const videoFiles = await fs.readdir(artifactsDir);
              const latestVideo = videoFiles
                .filter(f => f.endsWith('.webm'))
                .sort()
                .pop();

              if (latestVideo) {
                videoPath = path.join(artifactsDir, latestVideo);

                // Convert to GIF if requested
                if (config.videoFormat === 'gif') {
                  const gifPath = path.join(artifactsDir, `${stepName}.gif`);
                  console.log('   Converting video to GIF...');
                  const converted = await convertVideoToGif(videoPath, gifPath, config.gifQuality);
                  if (converted) {
                    artifacts.push({
                      type: 'gif',
                      name: step.name,
                      path: gifPath,
                      timestamp: Date.now(),
                      stepIndex,
                      stepName: step.name,
                    });
                    // Remove original video
                    await fs.unlink(videoPath).catch(() => {});
                    console.log('   ✅ GIF created');
                  } else {
                    artifacts.push({
                      type: 'video',
                      name: step.name,
                      path: videoPath,
                      timestamp: Date.now(),
                      stepIndex,
                      stepName: step.name,
                    });
                  }
                } else {
                  artifacts.push({
                    type: 'video',
                    name: step.name,
                    path: videoPath,
                    timestamp: Date.now(),
                    stepIndex,
                    stepName: step.name,
                  });
                }
              }
            }
          } else {
            // Just execute actions without recording
            if (step.actions) {
              for (const action of step.actions) {
                switch (action.type) {
                  case 'screenshot': {
                    const ssPath = path.join(artifactsDir, `${action.name || 'screenshot'}.png`);
                    await page.screenshot({ path: ssPath, fullPage: action.fullPage !== false });
                    artifacts.push({
                      type: 'screenshot',
                      name: action.name || 'Screenshot',
                      path: ssPath,
                      timestamp: Date.now(),
                      stepIndex,
                      stepName: step.name,
                    });
                    break;
                  }
                  case 'click':
                    await page.click(action.selector);
                    await page.waitForTimeout(action.waitAfter || 500);
                    break;
                  case 'type':
                    await page.fill(action.selector, action.text);
                    await page.waitForTimeout(action.waitAfter || 300);
                    break;
                  case 'wait':
                    await page.waitForTimeout(action.ms || 1000);
                    break;
                  case 'navigate': {
                    const navUrl = action.url.startsWith('http')
                      ? action.url
                      : `${config.baseUrl}${action.url}`;
                    await page.goto(navUrl, { waitUntil: 'networkidle' });
                    await page.waitForTimeout(500);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      await context.close();
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    // Extract video frames for AI analysis
    const extractedFrames = [];
    if (config.useAI !== false) {
      console.log('\n🎬 Extracting video frames for AI analysis...');
      for (const artifact of artifacts) {
        if (artifact.type === 'video' || artifact.type === 'gif' || artifact.type === 'slideshow') {
          try {
            const frames = await extractVideoFrames(artifact.path, artifactsDir, 3);
            for (const frame of frames) {
              extractedFrames.push({
                ...frame,
                stepIndex: artifact.stepIndex,
                stepName: artifact.stepName,
                sourceArtifact: artifact.name,
              });
            }
          } catch (error) {
            console.warn(`⚠️  Failed to extract frames from ${artifact.path}: ${error.message}`);
          }
        }
      }
    }

    // Load cached descriptions
    let descriptions = null;
    if (!config.forceAI) {
      descriptions = await loadCachedDescriptions(config.outputDir);
      if (descriptions) {
        console.log('📋 Loaded cached descriptions');
      }
    }

    // Generate AI descriptions if needed
    if (config.useAI !== false && (!descriptions || config.forceAI)) {
      const apiKeyInfo = getAPIKey();
      if (!apiKeyInfo) {
        console.warn('⚠️  No API key found. Skipping AI description generation.');
        console.warn(
          '   Set AI_GATEWAY_API_KEY or OPENAI_API_KEY environment variable to enable AI.',
        );
      } else {
        console.log('\n🤖 Generating AI descriptions...');
        try {
          descriptions = {
            description: config.description || null,
            clientRequest: config.clientRequest || null,
            clientflowTaskUrl: config.clientflowTaskUrl || null,
            steps: [],
            model: config.aiModel || 'gpt-4o',
          };

          // Group artifacts by step
          const artifactsByStep = new Map();
          for (const artifact of artifacts) {
            const stepKey = artifact.stepIndex !== undefined ? artifact.stepIndex : 'none';
            if (!artifactsByStep.has(stepKey)) {
              artifactsByStep.set(stepKey, []);
            }
            artifactsByStep.get(stepKey).push(artifact);
          }

          // Add extracted frames to their steps
          for (const frame of extractedFrames) {
            const stepKey = frame.stepIndex !== undefined ? frame.stepIndex : 'none';
            if (!artifactsByStep.has(stepKey)) {
              artifactsByStep.set(stepKey, []);
            }
            artifactsByStep.get(stepKey).push({
              type: 'frame',
              name: `Frame ${frame.index} from ${frame.sourceArtifact}`,
              path: frame.path,
              stepIndex: frame.stepIndex,
              stepName: frame.stepName,
            });
          }

          // Generate descriptions for each step
          if (config.steps && Array.isArray(config.steps)) {
            for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex++) {
              const step = config.steps[stepIndex];
              const stepArtifacts = artifactsByStep.get(stepIndex) || [];

              // Skip if step already has description
              if (step.description && !config.forceAI) {
                descriptions.steps.push({
                  stepIndex,
                  stepName: step.name,
                  description: step.description,
                });
                continue;
              }

              // Get screenshots and frames for this step
              const images = stepArtifacts
                .filter(a => a.type === 'screenshot' || a.type === 'frame')
                .map(a => a.path)
                .slice(0, config.maxScreenshotsPerStep || 10);

              if (images.length > 0) {
                try {
                  const stepDescription = await generateAIDescription(
                    images,
                    config.clientRequest || '',
                    `Step: ${step.name}`,
                    config,
                  );
                  descriptions.steps.push({
                    stepIndex,
                    stepName: step.name,
                    description: stepDescription,
                  });
                  console.log(`   ✅ Generated description for: ${step.name}`);
                } catch (error) {
                  console.warn(
                    `   ⚠️  Failed to generate description for ${step.name}: ${error.message}`,
                  );
                  descriptions.steps.push({
                    stepIndex,
                    stepName: step.name,
                    description: step.description || null,
                  });
                }
              } else {
                descriptions.steps.push({
                  stepIndex,
                  stepName: step.name,
                  description: step.description || null,
                });
              }
            }
          }

          // Generate overall description if not provided
          if (!descriptions.description) {
            try {
              const allImages = artifacts
                .filter(a => a.type === 'screenshot')
                .map(a => a.path)
                .slice(0, 5); // Limit for overall description

              if (allImages.length > 0) {
                descriptions.description = await generateAIDescription(
                  allImages,
                  config.clientRequest || '',
                  `Overall review: ${config.title}`,
                  config,
                );
                console.log('   ✅ Generated overall description');
              }
            } catch (error) {
              console.warn(`   ⚠️  Failed to generate overall description: ${error.message}`);
            }
          }

          // Save descriptions to cache
          await saveCachedDescriptions(config.outputDir, descriptions);
          console.log('💾 Saved descriptions to cache');
        } catch (error) {
          console.error(`❌ Error during AI generation: ${error.message}`);
          // Continue without AI descriptions
        }
      }
    }

    // Clean up extracted frames
    for (const frame of extractedFrames) {
      try {
        await fs.unlink(frame.path).catch(() => {});
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Generate HTML report
    console.log('\n📄 Generating HTML report...');
    const reportPath = await generateHTMLReport(config, artifacts, descriptions);
    console.log(`✅ Report generated: ${reportPath}`);
    console.log(`\n🎉 Review complete! Open ${reportPath} in your browser.`);

    return reportPath;
  } catch (error) {
    console.error('❌ Error during review:', error.message);
    throw error;
  }
}

// Validate config object
function validateConfig(config) {
  if (!config.title || typeof config.title !== 'string' || !config.title.trim()) {
    throw new Error('--title is required and cannot be empty');
  }

  if (!config.url && !config.steps) {
    throw new Error('Either --url or --config with steps is required');
  }

  if (config.url && config.steps) {
    console.warn('⚠️  Warning: Both --url and --config specified. Using config file steps.');
  }

  if (config.steps && !Array.isArray(config.steps)) {
    throw new Error('Config.steps must be an array');
  }

  if (config.steps) {
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      if (!step.name || typeof step.name !== 'string') {
        throw new Error(`Step ${i + 1}: name is required`);
      }
      if (step.actions && !Array.isArray(step.actions)) {
        throw new Error(`Step "${step.name}": actions must be an array`);
      }
    }
  }

  if (config.videoFormat && !['gif', 'webm'].includes(config.videoFormat)) {
    throw new Error('videoFormat must be either "gif" or "webm"');
  }

  if (config.gifQuality && !['low', 'medium', 'high'].includes(config.gifQuality)) {
    throw new Error('gifQuality must be "low", "medium", or "high"');
  }

  // Validate AI fields
  if (config.useAI !== undefined && typeof config.useAI !== 'boolean') {
    throw new Error('useAI must be a boolean');
  }

  if (config.aiModel && typeof config.aiModel !== 'string') {
    throw new Error('aiModel must be a string');
  }

  if (config.aiProvider && typeof config.aiProvider !== 'string') {
    throw new Error('aiProvider must be a string');
  }

  if (config.clientflowTaskUrl) {
    try {
      new URL(config.clientflowTaskUrl);
    } catch {
      throw new Error('clientflowTaskUrl must be a valid URL');
    }
  }

  if (config.maxScreenshotsPerStep !== undefined) {
    if (typeof config.maxScreenshotsPerStep !== 'number' || config.maxScreenshotsPerStep <= 0) {
      throw new Error('maxScreenshotsPerStep must be a positive number');
    }
  }

  if (config.description && typeof config.description !== 'string') {
    throw new Error('description must be a string');
  }

  if (config.clientRequest && typeof config.clientRequest !== 'string') {
    throw new Error('clientRequest must be a string');
  }
}

// Main execution
async function main() {
  try {
    const config = await parseArgs();
    validateConfig(config);

    console.log('🚀 Starting Browser Review Tool');
    console.log(`Title: ${config.title}`);
    console.log(`Base URL: ${config.baseUrl}`);
    if (config.url) {
      console.log(`URL: ${config.url}`);
    }
    if (config.steps) {
      console.log(`Steps: ${config.steps.length}`);
    }
    console.log(`Output: ${config.outputDir}`);
    console.log(`Format: ${config.videoFormat}`);
    console.log();

    await runReview(config);

    console.log('\n✅ Review completed successfully!');
    console.log(`📁 Reports saved to: ${config.outputDir}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (process.env.DEBUG) {
      console.error('\nStack trace:');
      console.error(error.stack);
    } else {
      console.log('\nRun with DEBUG=1 for full stack trace');
      console.log('Run with --help for usage information');
    }
    process.exit(1);
  }
}

// Export functions for testing
export { parseArgs, ensureDir, generateHTMLReport, checkFFmpeg };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
