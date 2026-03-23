# Tavily API Setup Guide

This guide will walk you through obtaining and configuring your Tavily Search API key for Nexus.

## Step 1: Get Your Tavily API Key

1. Visit [https://tavily.com](https://tavily.com)
2. Sign up for a free account or log in if you already have one
3. Navigate to your dashboard
4. Find the "API Keys" section
5. Copy your API key (it should start with `tvly-`)

## Step 2: Configure Your Environment

### Option A: Using a `.env` file (Recommended for local development)

1. In the root directory of this project, create a file named `.env`
2. Add the following line to the file:
```
VITE_TAVILY_API_KEY=tvly-your-actual-api-key-here
```
3. Replace `tvly-your-actual-api-key-here` with your actual API key
4. Save the file

**Important**: The `.env` file is already in `.gitignore` and will not be committed to version control.

### Option B: Using Codespaces Secrets (Recommended for GitHub Codespaces)

1. Go to your GitHub account settings
2. Navigate to Codespaces → Secrets
3. Click "New secret"
4. Name: `VITE_TAVILY_API_KEY`
5. Value: Your Tavily API key
6. Select repository access (this repository)
7. Restart your Codespace for changes to take effect

### Option C: Environment Variables in Production

Set the `VITE_TAVILY_API_KEY` environment variable in your hosting platform:

- **Vercel**: Project Settings → Environment Variables
- **Netlify**: Site Settings → Build & Deploy → Environment
- **Other platforms**: Refer to their documentation for setting environment variables

## Step 3: Verify Configuration

1. Start the development server:
```bash
npm run dev
```

2. Submit a test query in the application

3. Check the results:
   - ✅ **Success**: You'll see real web search results as sources in the response
   - ❌ **Failure**: You'll see a toast notification with an error message

## Troubleshooting

### "Search service not configured" error

This means the API key environment variable is not set or not being read correctly.

**Solutions**:
- Double-check the variable name is exactly `VITE_TAVILY_API_KEY`
- Restart your development server after adding the `.env` file
- In Codespaces, restart the entire Codespace after adding secrets
- Verify there are no extra spaces or quotes around the API key

### "Search failed with status 401" error

This means the API key is invalid or has expired.

**Solutions**:
- Verify you copied the entire API key correctly
- Check if your Tavily account is still active
- Generate a new API key from the Tavily dashboard

### "Search failed with status 429" error

This means you've exceeded your API rate limit.

**Solutions**:
- Check your Tavily plan limits
- Upgrade your Tavily plan if needed
- Wait before making more requests

### Application works but no sources appear

The application is designed to gracefully degrade when the search API fails. It will:
- Show a toast notification about the search failure
- Continue generating AI responses using the LLM's base knowledge
- Not crash or block the user from using the application

## API Usage Information

The Tavily Search API is called with the following configuration:
- **Search Depth**: `advanced` (for highest quality results)
- **Max Results**: `6` (optimal balance of context and relevance)
- **Include Answer**: `false` (we generate answers using the LLM)

Each query to the application makes one API call to Tavily. Monitor your usage on the Tavily dashboard.

## Security Best Practices

✅ **DO**:
- Use environment variables for API keys
- Keep `.env` files out of version control
- Use Codespaces secrets for cloud development
- Rotate API keys periodically

❌ **DON'T**:
- Hardcode API keys in source code
- Commit `.env` files to Git
- Share API keys in public channels
- Expose API keys in client-side code (this is handled by Vite's build process)

## Need Help?

If you continue to experience issues:
1. Check the browser console for detailed error messages
2. Review the Tavily API documentation at [https://docs.tavily.com](https://docs.tavily.com)
3. Ensure your network allows outbound requests to `api.tavily.com`
