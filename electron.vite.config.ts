import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { LIVE_OVERLAYS } from './src/shared/domain/overlays'

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src')
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
          ...Object.fromEntries(
            LIVE_OVERLAYS.map((overlay) => [
              overlay.slug,
              resolve(`src/renderer/overlays/${overlay.slug}.html`)
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
