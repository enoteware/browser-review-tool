/**
 * Vercel Edge Middleware for Password Protection
 * This runs on Vercel's Edge Network before requests reach your site
 */

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static files (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)).*)',
  ],
};

export default function middleware(request) {
  const url = new URL(request.url);
  
  // Get password from environment variable
  const password = process.env.SITE_PASSWORD || 'password';
  
  // Check for authentication cookie
  const cookie = request.headers.get('cookie') || '';
  const isAuthenticated = cookie.includes('browser-review-auth=true');

  // If authenticated, let request pass through (don't return anything)
  if (isAuthenticated) {
    return; // Let Vercel handle the request normally
  }

  // Not authenticated - show password prompt
  if (!isAuthenticated) {
    // Return password prompt page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 100%;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #333;
    }
    p {
      color: #666;
      margin-bottom: 24px;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .error {
      color: #e74c3c;
      font-size: 14px;
      margin-top: -12px;
      margin-bottom: 16px;
      display: none;
    }
    .error.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔒 Password Required</h1>
    <p>Please enter the password to access this site.</p>
    <form id="authForm">
      <input 
        type="password" 
        id="password" 
        name="password" 
        placeholder="Enter password" 
        required 
        autofocus
      />
      <div class="error" id="error">Incorrect password. Please try again.</div>
      <button type="submit">Access Site</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('authForm');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('error');
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('error') === '1') {
      errorDiv.classList.add('show');
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = passwordInput.value;
      
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });
      
      if (response.ok) {
        // Set cookie with proper attributes
        const cookieValue = 'browser-review-auth=true; path=/; max-age=' + (60 * 60 * 24 * 7) + '; SameSite=Lax; Secure';
        document.cookie = cookieValue;
        
        // Small delay to ensure cookie is set, then reload
        setTimeout(() => {
          window.location.href = window.location.origin + '/';
        }, 100);
      } else {
        errorDiv.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();
      }
    });
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 401,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
