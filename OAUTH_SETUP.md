# OAuth Cloud Storage Setup Guide

This application supports OAuth 2.0 authentication for connecting to cloud storage services including Dropbox, Google Drive, OneDrive, and GitHub.

## Table of Contents

1. [Overview](#overview)
2. [Setting Up Dropbox OAuth](#dropbox-oauth)
3. [Setting Up Google Drive OAuth](#google-drive-oauth)
4. [Setting Up OneDrive OAuth](#onedrive-oauth)
5. [Setting Up GitHub OAuth](#github-oauth)
6. [Using the OAuth Integration](#using-the-oauth-integration)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)

## Overview

OAuth 2.0 allows the application to securely access your cloud storage files without storing your password. Instead, you authorize the app through the cloud service's interface, and receive time-limited access tokens.

### Required Information

For each service, you'll need to create an OAuth application and obtain:
- **Client ID**: Public identifier for your application
- **Client Secret**: Private key for your application (keep this secure!)
- **Redirect URI**: Where users return after authorization: `https://your-domain.com/oauth/callback`

## Dropbox OAuth

### Step 1: Create a Dropbox App

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **Create App**
3. Choose API: **Scoped access**
4. Choose access type: **Full Dropbox** (or **App folder** for restricted access)
5. Name your app (e.g., "AI Search Engine Cloud Access")
6. Click **Create App**

### Step 2: Configure OAuth Settings

1. In your new app's settings page, find the **OAuth 2** section
2. Add your **Redirect URIs**:
   - For production: `https://your-domain.com/oauth/callback`
   - For local development: `http://localhost:5173/oauth/callback`
3. Under **Permissions**, enable:
   - `files.metadata.read` - Read metadata for files and folders
   - `files.content.read` - Read content of files

### Step 3: Get Your Credentials

1. Copy the **App key** (this is your Client ID)
2. Click **Show** next to **App secret** and copy it (this is your Client Secret)
3. Save both in the application's Settings → OAuth Connections tab

### API Documentation
- [Dropbox OAuth Guide](https://developers.dropbox.com/oauth-guide)
- [Dropbox API Reference](https://www.dropbox.com/developers/documentation/http/documentation)

---

## Google Drive OAuth

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Drive API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Google Drive API"
   - Click **Enable**

### Step 2: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email
   - Add scopes: `../auth/drive.readonly`, `../auth/drive.metadata.readonly`
4. For Application type, choose **Web application**
5. Add **Authorized redirect URIs**:
   - Production: `https://your-domain.com/oauth/callback`
   - Development: `http://localhost:5173/oauth/callback`
6. Click **Create**

### Step 3: Get Your Credentials

1. Copy the **Client ID**
2. Copy the **Client Secret**
3. Save both in the application's Settings → OAuth Connections tab

### Important Notes

- Google may require verification for apps requesting sensitive scopes
- During development, add test users in the OAuth consent screen
- The refresh token is only provided on the first authorization if you include `access_type=offline`

### API Documentation
- [Google Drive OAuth Guide](https://developers.google.com/drive/api/guides/about-auth)
- [Google Drive API Reference](https://developers.google.com/drive/api/reference/rest/v3)

---

## OneDrive OAuth

### Step 1: Register an Application

1. Go to [Azure Portal App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Enter application name (e.g., "AI Search Engine")
4. Choose **Supported account types**:
   - **Accounts in any organizational directory and personal Microsoft accounts** (most compatible)
5. Add **Redirect URI**:
   - Platform: **Web**
   - URI: `https://your-domain.com/oauth/callback` (or `http://localhost:5173/oauth/callback` for development)
6. Click **Register**

### Step 2: Configure API Permissions

1. Go to **API permissions** in your app
2. Click **Add a permission**
3. Choose **Microsoft Graph**
4. Select **Delegated permissions**
5. Add these permissions:
   - `Files.Read` - Read user files
   - `Files.Read.All` - Read all files that user can access
   - `offline_access` - Maintain access to data (for refresh tokens)
6. Click **Add permissions**

### Step 3: Create a Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description (e.g., "OAuth Secret")
4. Choose expiration (recommend **24 months**)
5. Click **Add**
6. **Important**: Copy the secret **Value** immediately (it won't be shown again!)

### Step 4: Get Your Credentials

1. Go to **Overview** page
2. Copy the **Application (client) ID** (this is your Client ID)
3. Use the Client Secret you created in Step 3
4. Save both in the application's Settings → OAuth Connections tab

### API Documentation
- [Microsoft Identity Platform OAuth](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
- [OneDrive API Reference](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/)

---

## GitHub OAuth

### Step 1: Register a GitHub App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in the application details:
   - **Application name**: Your app name (e.g., "AI Search Engine")
   - **Homepage URL**: Your app's homepage
   - **Authorization callback URL**: `https://your-domain.com/oauth/callback` (or `http://localhost:5173/oauth/callback`)
4. Click **Register application**

### Step 2: Configure Scopes

The application will request these scopes during authorization:
- `repo` - Access to repositories (public and private)
- `read:user` - Read user profile data

You don't need to configure these in the GitHub settings; they're requested during the OAuth flow.

### Step 3: Get Your Credentials

1. Copy the **Client ID** from the app page
2. Click **Generate a new client secret**
3. Copy the **Client Secret** (save it immediately, it won't be shown again!)
4. Save both in the application's Settings → OAuth Connections tab

### API Documentation
- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub REST API](https://docs.github.com/en/rest)

---

## Using the OAuth Integration

### Step 1: Add OAuth Credentials

1. Open the application
2. Go to **Settings** (gear icon in sidebar)
3. Click the **OAuth Connections** tab
4. For each service you want to connect:
   - Enter the **Client ID**
   - Enter the **Client Secret**
   - Click **Save OAuth Credentials**

### Step 2: Connect a Service

1. Click **Connect with OAuth** for the desired service
2. You'll be redirected to the service's authorization page
3. Review the permissions requested
4. Click **Allow** or **Authorize**
5. You'll be redirected back to the application
6. The service should now show as **Connected**

### Step 3: Access Files

1. When composing a query, click the **Cloud** icon
2. Select the connected service
3. Browse and select files
4. Click **Import Selected**
5. The files will be available in your query context

### Token Management

- **Access Tokens**: Valid for 1-2 hours (varies by service)
- **Refresh Tokens**: Automatically used to get new access tokens
- **Expiration**: Tokens are checked before each request; expired tokens trigger reconnection
- **Disconnecting**: Removes stored tokens but doesn't revoke them on the service side

---

## Security Considerations

### Client Secret Storage

- Client secrets are stored in your browser's local storage
- They are never sent to external servers except during OAuth token exchange
- For production deployments, consider using a secure backend to store secrets

### Token Storage

- OAuth tokens are stored in browser local storage via the `useKV` hook
- Tokens are scoped to your browser and cleared when you disconnect a service
- Refresh tokens (when provided) are used to automatically renew access

### Best Practices

1. **Use Environment Variables** (for production):
   - Don't hardcode Client IDs and Secrets in your application
   - Use server-side OAuth flows if possible
   
2. **Rotate Secrets Regularly**:
   - Most services allow you to create new secrets
   - Update them in the app settings after rotation

3. **Monitor Access**:
   - Review connected applications in each service's security settings:
     - Dropbox: [Security Settings](https://www.dropbox.com/account/security)
     - Google: [Account Permissions](https://myaccount.google.com/permissions)
     - Microsoft: [Account Privacy](https://account.microsoft.com/privacy)
     - GitHub: [Applications](https://github.com/settings/applications)

4. **Revoke When Not Needed**:
   - Disconnect services you're not actively using
   - Revoke access from the service's security settings if concerned

### HTTPS Requirement

- OAuth requires HTTPS in production
- The redirect URI must match exactly (including protocol, domain, and path)
- For local development, `http://localhost` is allowed by most services

---

## Troubleshooting

### "Invalid OAuth state" Error

**Cause**: The state parameter doesn't match or has expired.

**Solution**:
- Clear your browser cache and cookies
- Try the authorization flow again
- Ensure you're not using multiple tabs during authorization

### "Redirect URI Mismatch" Error

**Cause**: The redirect URI in your OAuth app doesn't match the one in the application.

**Solution**:
- Check the redirect URI in your OAuth app settings
- Ensure it exactly matches: `https://your-domain.com/oauth/callback`
- For local development, use: `http://localhost:5173/oauth/callback`

### "Token Expired" Warning

**Cause**: The access token has exceeded its lifetime.

**Solution**:
- Click **Reconnect** in the Settings → OAuth Connections tab
- The app will automatically use the refresh token if available
- If reconnection fails, disconnect and reconnect the service

### Connection Shows "Connected" But Files Don't Load

**Possible Causes**:
- Token has been revoked on the service side
- Permissions have changed
- Network connectivity issues

**Solution**:
- Disconnect and reconnect the service
- Check the browser console for error messages
- Verify the service is accessible (try logging in directly)

### "Failed to Exchange Authorization Code" Error

**Cause**: Issue during the token exchange process.

**Solution**:
- Verify Client ID and Client Secret are correct
- Check that the OAuth app is active (not suspended)
- Ensure the redirect URI is correctly configured
- Review the browser console for detailed error messages

### CORS Errors

**Note**: Some OAuth operations may encounter CORS issues when running locally.

**Solution for Development**:
- Use a local proxy or development server with CORS headers
- Some services require server-side OAuth implementations for security

---

## Additional Resources

### General OAuth 2.0
- [OAuth 2.0 Simplified](https://www.oauth.com/)
- [RFC 6749 - OAuth 2.0 Framework](https://tools.ietf.org/html/rfc6749)

### Service-Specific Guides
- [Dropbox Platform](https://www.dropbox.com/developers)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Microsoft Azure Portal](https://portal.azure.com/)
- [GitHub Developers](https://docs.github.com/en/developers)

---

## Support

If you encounter issues not covered in this guide:

1. Check the browser console for detailed error messages
2. Review the OAuth app settings in the service's developer console
3. Ensure all credentials are entered correctly
4. Verify network connectivity and HTTPS certificates (in production)

For service-specific issues, consult the respective developer documentation linked in each section.
