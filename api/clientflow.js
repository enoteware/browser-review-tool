// ClientFlow Integration API
// This API is designed for integration with ClientFlow task management

export default function handler(req, res) {
  // Handle CORS for ClientFlow embedding
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Return API info and device presets
    return res.status(200).json({
      name: 'Browser Review Tool - ClientFlow Integration',
      version: '1.0.0',
      endpoints: {
        'POST /api/clientflow': 'Generate review command for a ClientFlow task',
        'GET /api/clientflow': 'Get API info and device presets'
      },
      devices: {
        desktop: { width: 1920, height: 1080, name: 'Desktop' },
        laptop: { width: 1440, height: 900, name: 'Laptop' },
        tablet: { width: 768, height: 1024, name: 'Tablet' },
        mobile: { width: 375, height: 812, name: 'Mobile' },
        'mobile-landscape': { width: 812, height: 375, name: 'Mobile Landscape' }
      },
      quickStart: {
        desktop_mobile: '--devices desktop,mobile',
        all_devices: '--devices desktop,tablet,mobile'
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    title,
    url,
    baseUrl,
    taskId,
    taskUrl,
    clientRequest,
    devices,
    steps,
    useAI,
    videoFormat
  } = req.body;

  // Validate required fields
  if (!title) {
    return res.status(400).json({ error: 'Missing required field: title' });
  }

  if (!url && !steps) {
    return res.status(400).json({ error: 'Missing required field: url or steps' });
  }

  // Build command arguments
  const args = [`--title "${title}"`];

  if (url) {
    args.push(`--url "${url}"`);
  }

  if (baseUrl) {
    args.push(`--base-url "${baseUrl}"`);
  }

  if (taskId) {
    args.push(`--clientflow-task-id "${taskId}"`);
  }

  if (taskUrl) {
    args.push(`--clientflow-url "${taskUrl}"`);
  }

  if (clientRequest) {
    args.push(`--client-request "${clientRequest.replace(/"/g, '\\"')}"`);
  }

  if (devices && Array.isArray(devices) && devices.length > 0) {
    args.push(`--devices ${devices.join(',')}`);
  }

  if (videoFormat) {
    args.push(`--format ${videoFormat}`);
  }

  if (useAI === false) {
    args.push('--no-ai');
  }

  // Always generate embeddable output
  args.push('--embeddable');

  // Build config for steps-based review
  let configJson = null;
  if (steps && Array.isArray(steps)) {
    configJson = {
      title,
      baseUrl: baseUrl || 'http://localhost:7777',
      devices: devices || ['desktop', 'mobile'],
      videoFormat: videoFormat || 'gif',
      useAI: useAI !== false,
      clientRequest: clientRequest || null,
      clientflowTaskUrl: taskUrl || null,
      clientflowTaskId: taskId || null,
      steps
    };
  }

  const command = `node src/index.mjs ${args.join(' ')}`;

  // Response with integration details
  res.status(200).json({
    success: true,
    integration: {
      taskId: taskId || null,
      taskUrl: taskUrl || null
    },
    execution: {
      command,
      configJson,
      outputs: {
        report: 'review-reports/index.html',
        embed: 'review-reports/embed.html',
        json: 'review-reports/review.json',
        artifacts: 'review-reports/artifacts/'
      }
    },
    embedding: {
      iframe: '<iframe src="review-reports/embed.html" width="100%" height="600" frameborder="0"></iframe>',
      note: 'The embed.html file is designed to be embedded in ClientFlow task views'
    },
    devices: devices || ['desktop'],
    instructions: {
      step1: 'Run the command locally or in CI/CD',
      step2: 'Upload review-reports/ folder to your hosting',
      step3: 'Embed embed.html in ClientFlow task or share index.html link'
    }
  });
}
