import type { CandyHavenApi } from '@shared/ipc/api'

declare global {
  interface Window {
    /**
     * The complete main-process surface available to the renderer.
     * Implemented by the preload bridge; see src/preload/index.ts.
     */
    candy: CandyHavenApi
  }
}

export {}
