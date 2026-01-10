# Cloudflare API Token Setup Guide

## Required Permissions

For Browser Review Tool, you need a Cloudflare API token with these permissions:

### 1. Workers Permissions (for Browser Rendering)
- **Workers Scripts**: Edit
- **Workers Routes**: Edit
- **Workers KV Storage**: Edit (if using KV)
- **Workers Tail**: Read (for debugging)

### 2. R2 Permissions (for Storage)
- **Account**: Cloudflare R2:Edit
- **Zone**: Not required for R2 (R2 is account-level)

### 3. Account Access
- **Account**: Your Cloudflare account
- **Zone**: Not required (unless you want to deploy to a specific zone)

## Step-by-Step Setup

### Option 1: Using Cloudflare Dashboard (Recommended)

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/profile/api-tokens
   - Or: My Profile → API Tokens

2. **Create Custom Token**
   - Click "Create Token"
   - Click "Create Custom Token"

3. **Configure Token**

   **Token Name:**
   ```
   Browser Review Tool - Workers + R2
   ```

   **Permissions:**
   - **Account** → **Workers Scripts** → **Edit**
   - **Account** → **Workers Routes** → **Edit**
   - **Account** → **Cloudflare R2** → **Edit**
   - **Account** → **Workers Tail** → **Read** (optional, for debugging)

   **Account Resources:**
   - Include → **Your Account** (select your account)

   **Zone Resources:**
   - Not required (leave as "All zones" or "None")

4. **Continue to Summary**
   - Review permissions
   - Click "Create Token"

5. **Copy Token**
   - ⚠️ **IMPORTANT**: Copy the token immediately - it's only shown once!
   - Store securely (password manager, env file)

### Option 2: Using Wrangler CLI (Alternative)

If you have `wrangler` CLI installed:

```bash
# Login to Cloudflare
wrangler login

# This will open browser and authenticate
# Wrangler will use your browser session, no API token needed
```

## Environment Variables

Add these to your `.env.local` or Vercel environment variables:

```bash
# Cloudflare API Token (for Workers deployment)
CLOUDFLARE_API_TOKEN=your_api_token_here

# Cloudflare Account ID (found in dashboard → right sidebar)
CLOUDFLARE_ACCOUNT_ID=your_account_id_here

# R2 Credentials (create in R2 dashboard → Manage R2 API Tokens)
CLOUDFLARE_R2_ACCOUNT_ID=your_r2_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_R2_BUCKET=your-bucket-name

# Optional: Zone ID (if deploying to specific zone)
CLOUDFLARE_ZONE_ID=your_zone_id
```

## Getting Your Account ID

1. Go to Cloudflare Dashboard
2. Select any zone
3. Look at the right sidebar → "Account ID" is shown there
4. Or: Workers → Overview → Account ID is in the URL

## Creating R2 API Tokens

R2 uses separate API tokens (S3-compatible):

1. Go to **R2** in Cloudflare Dashboard
2. Click **Manage R2 API Tokens**
3. Click **Create API Token**
4. Select your bucket or "All buckets"
5. Set permissions: **Object Read & Write**
6. Copy the credentials:
   - Access Key ID
   - Secret Access Key
   - Account ID (shown at top of R2 page)

## Testing Your Token

```bash
# Test Workers API access
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts" \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Test R2 access (using AWS CLI format)
aws s3 ls s3://your-bucket-name \
  --endpoint-url https://{account_id}.r2.cloudflarestorage.com \
  --profile r2
```

## Security Best Practices

1. **Scope tokens narrowly**: Only give permissions needed
2. **Use separate tokens**: One for Workers, one for R2 (if preferred)
3. **Set expiration**: For production, set token TTL
4. **Rotate regularly**: Update tokens periodically
5. **Never commit tokens**: Use environment variables only
6. **Use IP restrictions**: If possible, restrict to your deployment IPs

## Troubleshooting

**"Invalid API Token"**
- Check token hasn't expired
- Verify permissions are correct
- Ensure Account ID matches

**"Permission Denied"**
- Verify token has "Edit" permissions for Workers
- Check R2 token has "Object Read & Write"
- Ensure account-level access is granted

**"R2 Access Denied"**
- R2 uses separate S3-compatible tokens
- Make sure you're using R2 API tokens, not Workers API token
- Verify bucket name is correct
