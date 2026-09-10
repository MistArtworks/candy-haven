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
import { AuditoriumPopout } from '@renderer/features/auditorium/AuditoriumPopout'
import { readPopoutIntent } from '@renderer/app/popout'
import { PlaybackProvider } from '@renderer/app/providers/PlaybackProvider'

/**
 * Whether this window is a detached view rather than the console.
 *
 * Read once at module scope: it comes from the URL this window was opened
 * with and cannot change for its lifetime, and reading it here means the
 * decision is made before anything mounts — which matters, because a popout
 * must not run the boot sequence. Boot provisions the archive and starts the
 * overlay server; a second window doing that alongside the first is at best
 * duplicated work and at worst two processes contending for one data
 * directory. See main/app/popout.ts.
 */
const POPOUT = readPopoutIntent()

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

/**
 * Theme and ambience for a detached window.
 *
 * `useThemePreferences` lives in the console's `Shell`, which a popout never
 * mounts — without this the detached window would draw at the default accent
 * and scale regardless of what REGULATION says, which is exactly the sort of
 * drift that makes a second window feel like a second application.
 */
function PopoutShell({ children }: { children: ReactNode }): ReactNode {
  useThemePreferences()

  return (
    <>
      {children}
      <div className="ch-ambience" aria-hidden="true">
        <div className="ch-ambience__grain" />
        <div className="ch-ambience__vignette" />
      </div>
    </>
  )
}

export default function App(): ReactNode {
  /*
   * A detached view is the whole application in that window.
   *
   * Still inside the error boundary and the system bridge — it reads settings
   * for the theme and talks over the same IPC — but with no router, no boot and
   * no console shell, none of which a single-purpose window has any use for.
   */
  if (POPOUT) {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SystemBridge>
            <PopoutShell>
              <AuditoriumPopout file={POPOUT.file} />
            </PopoutShell>
          </SystemBridge>
        </QueryClientProvider>
      </ErrorBoundary>
    )
  }

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
            {/*
              Above the shell, so the transport survives every page change.
              A player that stops because the operator went to look at
              something else is not a player; see PlaybackProvider.
            */}
            <PlaybackProvider>
              <HotkeyProvider>
                <Shell />
              </HotkeyProvider>
            </PlaybackProvider>
          </HashRouter>
        </SystemBridge>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
