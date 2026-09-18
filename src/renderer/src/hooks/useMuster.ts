import { useEffect, useState } from 'react'
import type { MusterState } from '@shared/domain/muster'
import { createEmptyMusterState } from '@shared/domain/muster.constants'

/**
 * Live call state, pushed from the main process.
 *
 * Lifted out of `MusterPage`, which held this subscription inline while it was
 * the only surface that wanted it. The OBSERVATORY dashboard is the second, and
 * two copies of a subscription that has an ordering guard in it is exactly the
 * kind of duplication that drifts — one gets the guard and the other does not.
 *
 * Subscribes before fetching the snapshot, then only applies the snapshot if no
 * push has already overtaken it: the same guard `useRiteState` and
 * `useConcordState` use, and the reason is the same. A slow first response must
 * not roll live state backwards over a change the operator has already made.
 *
 * Not in the global system store, for the reason none of the overlay state is:
 * a running call republishes on a heartbeat, and putting that churn in a store
 * the whole console subscribes to would re-render every page in the app.
 */
export function useMusterState(): MusterState {
  const [state, setState] = useState<MusterState>(createEmptyMusterState)

  useEffect(() => {
    let cancelled = false
    let claimed = false

    const unsubscribe = window.candy.muster.onState((next) => {
      if (cancelled) return
      claimed = true
      setState(next)
    })

    void window.candy.muster.state().then((initial) => {
      if (!cancelled && !claimed) setState(initial)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
