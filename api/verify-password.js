/**
 * API endpoint to verify password
 * Used by the password protection middleware
 */

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const expectedPassword = process.env.SITE_PASSWORD || 'password';

  if (password === expectedPassword) {
    // Set cookie server-side for better reliability
    res.setHeader('Set-Cookie', 'browser-review-auth=true; path=/; max-age=' + (60 * 60 * 24 * 7) + '; SameSite=Lax; HttpOnly');
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: 'Incorrect password' });
}
