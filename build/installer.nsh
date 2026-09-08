; Candy Haven — NSIS customisations.
;
; Adds two things to electron-builder's generated installer:
;   1. Install-time provisioning of the MongoDB runtime that backs the embedded
;      archive, via resources\scripts\install-archive-runtime.ps1.
;   2. Removal of that runtime, and of any daemon started from this directory,
;      on uninstall.
;
; The provisioning step is deliberately non-fatal. If the download cannot
; complete, the installer still succeeds and the application provisions the
; runtime itself on first launch through its boot sequence, which has a
; progress UI far better suited to a large transfer than an NSIS dialog.
;
; Both steps delegate to PowerShell scripts rather than inlining commands:
; NSIS string escaping makes non-trivial inline PowerShell fragile, and a real
; script file can be tested on its own.

!macro customInstall
  DetailPrint "Preparing the resonance archive runtime..."
  DetailPrint "This downloads MongoDB and may take several minutes."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\install-archive-runtime.ps1" -InstallDir "$INSTDIR"'
  Pop $0

  ; The script always exits 0; installation never blocks on the download.
  DetailPrint "Archive runtime step finished (code $0)."
!macroend

!macro customUnInstall
  DetailPrint "Removing the archive runtime..."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\remove-archive-runtime.ps1" -InstallDir "$INSTDIR"'
  Pop $0

  ; Belt and braces: remove the directory even if the script could not run.
  RMDir /r "$INSTDIR\resources\mongodb"
!macroend
