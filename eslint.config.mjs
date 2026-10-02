import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      /*
       * The Streamlabs widget is not this project's code in any sense that the
       * TypeScript rules apply to. It is plain browser ES5 pasted into someone
       * else's editor, so it is written for that runtime deliberately —
       * `var`, no modules, no annotations — and linting it as project source
       * only ever produces demands to make it something it must not become.
       * Prettier still formats it; see .prettierignore, which does not.
       */
      'streamlabs/**/*.js',
      /*
       * Build scripts are Node, not application source.
       *
       * They run under `node` directly rather than through the bundler, and the
       * TypeScript rules that govern `src/` — return-type annotations chief
       * among them — have nothing to say about a plain `.mjs` that never sees
       * `tsc`. Prettier still formats them.
       */
      'scripts/**/*.mjs',
      /*
       * Copies of the website's own files (the planet engine and the lore's
       * markdown reader), kept byte for byte by `npm run sync:planets`. They
       * are written and linted to the website's rules, and reformatting them
       * here would make the next check report a difference that isn't one.
       */
      'src/shared/planets/**',
      'src/renderer/src/lib/markdown/blocks.ts'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
