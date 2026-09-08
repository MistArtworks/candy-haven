import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
        input: { index: resolve('src/renderer/index.html') },
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
