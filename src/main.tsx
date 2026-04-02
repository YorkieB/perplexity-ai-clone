import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { hydrateUiSyncFromServer } from '@/lib/ui-sync'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

void hydrateUiSyncFromServer().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>,
  )
})
