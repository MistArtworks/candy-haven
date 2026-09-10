import { useCallback, type ReactNode } from 'react'
import { HashRouter } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SystemBridge } from '@renderer/app/providers/SystemBridge'
import { ErrorBoundary } from '@renderer/components/feedback/ErrorBoundary'
import { BootScreen } from '@renderer/features/boot/BootScreen'
import { AppRouter } from '@renderer/app/router'
import {
  useSystemStore,
  selectBoot,
  selectSettings,
  selectShellPhase
} from '@renderer/app/store/system.store'
import { useThemePreferences } from '@renderer/hooks/useMotionPreference'
import { HotkeyProvider } from '@renderer/hotkeys/HotkeyProvider'

/**
 * Query client tuned for a desktop app talking to a local main process:
 * requests are cheap and never fail from flaky networks, so aggressive
 * refetching would be pure noise.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
})

/**
 * Boot-to-console handover.
 *
 * The console is mounted as soon as the operator commits to entering, so it can
 * fade up *behind* the departing boot layer rather than after it. AnimatePresence
 * keeps the boot screen alive through its exit animation before unmounting it.
 */
function Shell(): ReactNode {
  const boot = useSystemStore(selectBoot)
  const settings = useSystemStore(selectSettings)
  const shellPhase = useSystemStore(selectShellPhase)
  const setShellPhase = useSystemStore((state) => state.setShellPhase)

  useThemePreferences()

  const handleEnter = useCallback(() => {
    setShellPhase('ready')
  }, [setShellPhase])

  const showBoot = shellPhase !== 'ready'
  const showConsole = shellPhase === 'ready'

  return (
    <>
      {showConsole ? <AppRouter /> : null}

      <AnimatePresence>
        {showBoot ? (
          <BootScreen
            key="boot"
            snapshot={boot}
            onEnter={handleEnter}
            fastBoot={settings?.appearance.fastBoot ?? false}
          />
        ) : null}
      </AnimatePresence>

      {/* Ambient grain and vignette, above content and inert to pointers. */}
      <div className="ch-ambience" aria-hidden="true">
        <div className="ch-ambience__scan" />
        <div className="ch-ambience__grain" />
        <div className="ch-ambience__vignette" />
      </div>
    </>
  )
}

export default function App(): ReactNode {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SystemBridge>
          {/*
            Hash routing: the production renderer is loaded from a file:// URL,
            where the History API cannot resolve paths.
          */}
          <HashRouter>
            {/*
              Inside the router, because most bindings navigate; outside the
              shell, so the cheatsheet is not unmounted along with the boot
              screen and survives every page change.
            */}
            <HotkeyProvider>
              <Shell />
            </HotkeyProvider>
          </HashRouter>
        </SystemBridge>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
