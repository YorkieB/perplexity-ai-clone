import { useCallback, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createLinkToken, exchangePublicToken } from '@/lib/plaid-api'

interface PlaidLinkButtonProps {
  readonly onSuccess: (accessToken: string) => void
  readonly disabled?: boolean
}

export function PlaidLinkButton({ onSuccess, disabled }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGetToken = useCallback(async () => {
    setLoading(true)
    try {
      const token = await createLinkToken()
      setLinkToken(token)
    } catch (e) {
      toast.error(`Failed to create link token: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken: string) => {
      try {
        const accessToken = await exchangePublicToken(publicToken)
        onSuccess(accessToken)
        toast.success('Bank account connected successfully!')
      } catch (e) {
        toast.error(`Failed to connect bank: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    onExit: (err) => {
      if (err) toast.error(`Plaid Link exited: ${err.display_message || err.error_message || 'Unknown error'}`)
    },
  })

  if (!linkToken) {
    return (
      <Button
        size="sm"
        onClick={handleGetToken}
        disabled={disabled || loading}
      >
        {loading ? 'Connecting...' : 'Connect Bank Account'}
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      onClick={() => open()}
      disabled={disabled || !ready}
    >
      {ready ? 'Open Bank Login' : 'Loading...'}
    </Button>
  )
}
