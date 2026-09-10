import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { liveOverlayDocuments } from './src/shared/domain/overlays'

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src'),
  /*
   * The Streamlabs chat widget, which lives outside `src/` because it is not
   * built — it is pasted into someone else's editor.
   *
   * Aliased rather than reached with a relative path so the console can import
   * the three files verbatim with `?raw` and hand the operator exactly what is
   * on disk. The alternative was keeping a second copy inside the renderer to
   * generate from, which is the one arrangement guaranteed to ship a widget
   * that differs from the one in the repository.
   */
  '@widget': resolve('streamlabs/chorus-chat')
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    css: {
      preprocessorOptions: {
        scss: {
          // Exposes the styles root to Sass so every stylesheet can write
          // `@use 'abstracts' as *;` without relative paths. Deliberately not
          // using `additionalData`, which would inject that import into the
          // abstracts index itself and create a circular @use.
          loadPaths: [resolve('src/renderer/src/styles')]
        }
      }
    },
    build: {
      // Vendor code changes far less often than app code. Splitting it keeps
      // electron-updater's differential downloads small, since an app-only
      // change no longer invalidates the React and animation bundles.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        // `index` is the console, loaded into the Electron window. Every
        // shipped overlay adds a second kind of document: a genuine browser
        // page served over plain HTTP to an OBS browser source, with no preload
        // and no access to `window.candy`.
        //
        // Built straight off the shared registry, so commissioning an overlay
        // is one entry there plus its `overlays/<slug>.html` — the build never
        // needs touching.
        input: {
          index: resolve('src/renderer/index.html'),
          /*
           * A contact sheet of the NEXUS landing fields.
           *
           * Not reachable from the application and not linked from anywhere —
           * it exists so the scenes can be looked at side by side without
           * launching the console and waiting on a database. Composition is
           * what these are for, and composition is not type-checkable.
           */
          'preview-scenes': resolve('src/renderer/preview/scenes.html'),
          'preview-muster': resolve('src/renderer/preview/muster.html'),
          ...Object.fromEntries(
            liveOverlayDocuments().map((document) => [
              document,
              resolve(`src/renderer/overlays/${document}.html`)
            ])
          )
        },
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['motion', 'gsap', 'animejs'],
            'vendor-data': ['@tanstack/react-query', 'zustand']
          }
        }
      }
    }
  }
})
