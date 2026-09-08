/**
 * Cross-process constants. This module is imported by main, preload and renderer,
 * so it must stay free of Node and Electron imports.
 */

export const APP_NAME = 'Candy Haven'
export const APP_ID = 'app.candyhaven.desktop'

/** Institutional subtitle used across chrome and the boot sequence. */
export const APP_SUBTITLE = 'SONOALCHEMY OPERATIONS TERMINAL'

/**
 * Default port for the embedded archive daemon. Deliberately off the MongoDB
 * default (27017) so a bundled instance never collides with a system install.
 */
export const DEFAULT_ARCHIVE_PORT = 27917

/** Logical database name inside the embedded archive. */
export const ARCHIVE_DB_NAME = 'candy_haven'

/** Height of the custom window chrome, in CSS pixels. Shared with the main process. */
export const TITLEBAR_HEIGHT = 40

export const MIN_WINDOW_WIDTH = 1120
export const MIN_WINDOW_HEIGHT = 720
export const DEFAULT_WINDOW_WIDTH = 1440
export const DEFAULT_WINDOW_HEIGHT = 900
