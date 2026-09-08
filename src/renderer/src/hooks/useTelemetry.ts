import { useEffect, useState } from 'react'
import type { TelemetryState } from '@shared/domain/telemetry'
import { createEmptySample } from '@shared/domain/telemetry.constants'

const EMPTY: TelemetryState = {
  latest: createEmptySample(),
  cpuHistory: [],
  memoryHistory: [],
  gpuHistory: [],
  ready: false
}

/**
 * Subscribes to host telemetry for as long as the calling view is mounted.
 *
 * Sampling in the main process is reference-counted, so leaving the page stops
 * the polling — including the PowerShell probes for GPU counters and disk
 * capacity, which are the expensive part. Telemetry deliberately does not live
 * in the global system store for this reason: it should cost nothing when
 * nobody is looking at it.
 */
export function useTelemetry(): TelemetryState {
  const [state, setState] = useState<TelemetryState>(EMPTY)

  useEffect(() => {
    let cancelled = false
    const unsubscribeEvent = window.candy.telemetry.onSample((next) => {
      if (!cancelled) setState(next)
    })

    void window.candy.telemetry.subscribe().then((initial) => {
      // A live sample may already have overtaken this response; only apply the
      // initial state if nothing has arrived yet.
      if (!cancelled) setState((current) => (current.ready ? current : initial))
    })

    return () => {
      cancelled = true
      unsubscribeEvent()
      void window.candy.telemetry.unsubscribe()
    }
  }, [])

  return state
}
