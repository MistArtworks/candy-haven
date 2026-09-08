/// <reference types="vite/client" />

// Typed CSS Modules. Without this, `import styles from './X.module.scss'`
// resolves to `any` and every class name typo becomes a runtime-only failure.
declare module '*.module.scss' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

declare module '*.scss' {
  const content: string
  export default content
}
