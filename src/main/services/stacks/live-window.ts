import { execFile } from 'node:child_process'

/**
 * Reads each running Live's main window title. `exit 0` because the answer is
 * the output: `-Command` exits 1 when `$?` ends false, and nothing running is
 * not a failure.
 */
const SCRIPT = [
  "Get-Process -Name 'Ableton Live*' -ErrorAction SilentlyContinue |",
  'ForEach-Object { $_.MainWindowTitle };',
  'exit 0'
].join(' ')

/**
 * The window title of every running Ableton Live, or null when Windows would
 * not say.
 *
 * Live holds one set at a time and puts it in its title
 * (`Name [Name Project] - Ableton Live 12 Suite`, with a `*` while unsaved),
 * so the title is how the temporary clean-up tells a set that is still open
 * from one that is finished with. Nothing else on Windows says so: Live
 * doesn't keep the set file locked.
 *
 * PowerShell's process list rather than `tasklist /v`, which looks up every
 * process's owner and window before filtering and ran for minutes on the
 * development machine. This answers in under a second, and runs at most once
 * an hour, only when something is due to go.
 */
export function liveWindowTitles(): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true, timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        // One title per line; a Live still starting up has none yet.
        resolve(
          stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        )
      }
    )
  })
}
