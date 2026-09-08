import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.scss'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level render guard.
 *
 * A thrown render error would otherwise leave the operator staring at a blank
 * window with no way to recover, since there is no browser chrome to reload
 * from. This surfaces the failure and offers a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced in the renderer console and captured by the main process log
    // through electron-log's console transport.
    console.error('Unhandled render error', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.fallback} role="alert">
        <div className={styles.panel}>
          <p className={styles.label}>INTERFACE FAULT</p>
          <p className={styles.message}>{error.message}</p>
          <p className={styles.hint}>
            The console encountered an unrecoverable rendering error. Reloading restores the
            interface; the archive and its data are unaffected.
          </p>
          <button type="button" className={styles.action} onClick={this.handleReload}>
            Reload console
          </button>
        </div>
      </div>
    )
  }
}
