/**
 * Minimal typed event emitter used for intra-main service communication.
 * Kept dependency-free so services can be unit-tested without Electron.
 */
export type Listener<T> = (payload: T) => void

export class TypedEmitter<Events> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let bucket = this.listeners.get(event)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(event, bucket)
    }
    bucket.add(listener as Listener<never>)
    return () => this.off(event, listener)
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const bucket = this.listeners.get(event)
    if (!bucket) return
    // Copy before iterating so listeners may unsubscribe during dispatch.
    for (const listener of [...bucket]) {
      ;(listener as Listener<Events[K]>)(payload)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
