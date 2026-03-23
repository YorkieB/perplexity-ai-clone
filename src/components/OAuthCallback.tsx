import { useEffect, useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings } from '@/lib/types'
import { validateOAuthState, exchangeCodeForToken } from '@/lib/oauth'
import { NexusLogo } from '@/components/NexusLogo'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Spinner } from '@phosphor-icons/react'

export function OAuthCallback() {
  const [settings, setSettings] = useLocalStorage<UserSettings>('user-settings', {
    apiKeys: {},
    oauthTokens: {},
    oauthClientIds: {},
    oauthClientSecrets: {},
    connectedServices: {
      googledrive: false,
      onedrive: false,
      github: false,
      dropbox: false,
    },
  })

  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Processing OAuth callback...')

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const stateParam = params.get('state')
      const error = params.get('error')

      if (error) {
        setStatus('error')
        setMessage(`Authorization failed: ${error}`)
        return
      }

      if (!code || !stateParam) {
        setStatus('error')
        setMessage('Missing authorization code or state parameter')
        return
      }

      const state = validateOAuthState(stateParam)
      if (!state) {
        setStatus('error')
        setMessage('Invalid or expired OAuth state')
        return
      }

      const providerKey = state.provider as 'googledrive' | 'onedrive' | 'github' | 'dropbox'
      const clientId = settings?.oauthClientIds[providerKey]
      const clientSecret = settings?.oauthClientSecrets[providerKey]

      if (!clientId || !clientSecret) {
        setStatus('error')
        setMessage('OAuth credentials not found. Please configure them in settings.')
        return
      }

      try {
        const token = await exchangeCodeForToken(state.provider, code, clientId, clientSecret)

        if (!token) {
          setStatus('error')
          setMessage('Failed to exchange authorization code for access token')
          return
        }

        setSettings((current) => ({
          ...current!,
          oauthTokens: {
            ...current!.oauthTokens,
            [providerKey]: token,
          },
          connectedServices: {
            ...current!.connectedServices,
            [providerKey]: true,
          },
        }))

        setStatus('success')
        setMessage(`Successfully connected to ${state.provider}!`)

        setTimeout(() => {
          window.location.href = state.returnUrl || '/'
        }, 2000)
      } catch (err) {
        setStatus('error')
        setMessage(`Error during OAuth flow: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    })()
    // Single exchange on mount; settings come from KV hook initial/hydrated state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <NexusLogo size={44} className="rounded-xl" />
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center space-y-6">
          {status === 'processing' && (
            <>
              <div className="p-4 bg-primary/10 rounded-full">
                <Spinner className="text-primary animate-spin" size={48} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Processing Authorization</h2>
                <p className="text-muted-foreground mt-2">{message}</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="p-4 bg-green-500/10 rounded-full">
                <CheckCircle className="text-green-500" size={48} weight="fill" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Authorization Successful!</h2>
                <p className="text-muted-foreground mt-2">{message}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Redirecting you back to the application...
                </p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="p-4 bg-destructive/10 rounded-full">
                <XCircle className="text-destructive" size={48} weight="fill" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Authorization Failed</h2>
                <p className="text-muted-foreground mt-2">{message}</p>
              </div>
              <Button onClick={() => (window.location.href = '/')}>
                Return to Application
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
