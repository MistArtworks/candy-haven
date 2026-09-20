import './styles/global.scss'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SystemBridge } from '@renderer/app/providers/SystemBridge'
import { ErrorBoundary } from '@renderer/components/feedback/ErrorBoundary'
import { VestibulePage } from '@renderer/features/vestibule/VestibulePage'

/**
 * THE VESTIBULE — its own document, and deliberately so.
 *
 * This window opens ahead of the console and instead of it, so it must not
 * import the console: `App.tsx` pulls in the router, which pulls in all ten
 * feature pages. A second root is the cost of that, and the preview and overlay
 * entries already establish the pattern.
 *
 * It still runs `SystemBridge`, because it needs the same three things the
 * console does — boot progress for its status rail, the archive's health for
 * whether a project can be created at all, and the appearance settings so the
 * accent and interface scale match. No router, no boot screen, no shell; the
 * page applies the theme and draws the ambience itself.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false }
  }
})

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root was not found in vestibule.html.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SystemBridge>
          <VestibulePage />
        </SystemBridge>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
