import './styles/global.scss'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SystemBridge } from '@renderer/app/providers/SystemBridge'
import { ErrorBoundary } from '@renderer/components/feedback/ErrorBoundary'
import { StripApp } from '@renderer/features/strip/StripApp'

/**
 * THE QUICK STRIP and its popup: one document, two roles (`?role=strip` or
 * `?role=popup`, set by main/app/strip.ts).
 *
 * Its own root, like the vestibule's, so it never imports the console's
 * router and pages. SystemBridge gives it what it shares with the console:
 * boot, the archive's state, the settings and the accent.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false }
  }
})

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root was not found in strip.html.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SystemBridge>
          <StripApp />
        </SystemBridge>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
