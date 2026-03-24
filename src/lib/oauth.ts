export interface OAuthProvider {
  name: string
  authUrl: string
  tokenUrl: string
  clientId: string
  scopes: string[]
  redirectUri: string
}

export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

export interface OAuthState {
  provider: string
  nonce: string
  returnUrl: string
}

const OAUTH_CONFIGS: Record<string, Partial<OAuthProvider>> = {
  dropbox: {
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.metadata.read', 'files.content.read'],
  },
  googleDrive: {
    name: 'Google (Drive & Calendar)',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  },
  oneDrive: {
    name: 'OneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Files.Read', 'Files.Read.All', 'offline_access'],
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user'],
  },
}

export function getOAuthConfig(provider: string): OAuthProvider | null {
  const config = OAUTH_CONFIGS[provider]
  if (!config) return null

  const redirectUri = `${window.location.origin}/oauth/callback`
  
  return {
    ...config,
    clientId: '',
    redirectUri,
  } as OAuthProvider
}

export function generateOAuthState(provider: string): OAuthState {
  return {
    provider,
    nonce: crypto.randomUUID(),
    returnUrl: window.location.pathname,
  }
}

export function buildAuthUrl(provider: string, clientId: string): string | null {
  const config = getOAuthConfig(provider)
  if (!config) return null

  const state = generateOAuthState(provider)
  sessionStorage.setItem('oauth_state', JSON.stringify(state))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: state.nonce,
    access_type: 'offline',
  })

  if (provider === 'googleDrive') {
    params.append('prompt', 'consent')
  }

  return `${config.authUrl}?${params.toString()}`
}

export function validateOAuthState(stateParam: string): OAuthState | null {
  const savedState = sessionStorage.getItem('oauth_state')
  if (!savedState) return null

  try {
    const state: OAuthState = JSON.parse(savedState)
    if (state.nonce === stateParam) {
      sessionStorage.removeItem('oauth_state')
      return state
    }
  } catch (e) {
    console.error('Invalid OAuth state', e)
  }

  return null
}

export async function exchangeCodeForToken(
  provider: string,
  code: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthToken | null> {
  const config = getOAuthConfig(provider)
  if (!config) return null

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      console.error('Token exchange failed:', await response.text())
      return null
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      tokenType: data.token_type || 'Bearer',
    }
  } catch (error) {
    console.error('Error exchanging code for token:', error)
    return null
  }
}

export async function refreshAccessToken(
  provider: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthToken | null> {
  const config = getOAuthConfig(provider)
  if (!config) return null

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text())
      return null
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      tokenType: data.token_type || 'Bearer',
    }
  } catch (error) {
    console.error('Error refreshing token:', error)
    return null
  }
}

export function isTokenExpired(token: OAuthToken): boolean {
  return Date.now() >= token.expiresAt - 300000
}
