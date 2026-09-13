; Candy Haven — NSIS customisations.
;
; Adds three things to electron-builder's generated installer:
;   1. Install-time provisioning of the MongoDB runtime that backs the embedded
;      archive, via resources\scripts\install-archive-runtime.ps1.
;   2. Removal of that runtime, and of any daemon started from this directory,
;      on uninstall.
;   3. Two choices, on uninstall, about what of the operator's own to keep.
;
; The provisioning step is deliberately non-fatal. If the download cannot
; complete, the installer still succeeds and the application provisions the
; runtime itself on first launch through its boot sequence, which has a
; progress UI far better suited to a large transfer than an NSIS dialog.
;
; Both steps delegate to PowerShell scripts rather than inlining commands:
; NSIS string escaping makes non-trivial inline PowerShell fragile, and a real
; script file can be tested on its own.

/*
 * Included explicitly, because where this file lands is not ours to choose.
 *
 * electron-builder splices the custom script into its generated installer at a
 * point of its own choosing, and that point is not guaranteed to be after
 * MUI2 has pulled in the dialog helpers. Without these, `${NSD_CreateCheckbox}`
 * is an undefined macro and the whole installer fails to compile. All three
 * carry include guards, so asking again costs nothing.
 */
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "nsDialogs.nsh"

/*
 * Declared in the uninstaller pass alone, for the same reason the functions
 * are: nothing in the installer pass touches them, and an unused variable is
 * `warning 6001`, which this build treats as an error.
 */
!ifdef BUILD_UNINSTALLER
Var UnKeepSettings
Var UnKeepArchive
Var UnKeepSettingsState
Var UnKeepArchiveState
!endif

!macro customInstall
  DetailPrint "Preparing the resonance archive runtime..."
  DetailPrint "This downloads MongoDB and may take several minutes."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\install-archive-runtime.ps1" -InstallDir "$INSTDIR"'
  Pop $0

  ; The script always exits 0; installation never blocks on the download.
  DetailPrint "Archive runtime step finished (code $0)."
!macroend

; ---------------------------------------------------------------- uninstalling

/*
 * What each box governs, kept apart on purpose.
 *
 * Settings are the few kilobytes set in REGULATION: the filing root and the
 * other locations, appearance, startup, the integrations and the tokens they
 * earned. Losing them costs a few minutes of re-entry.
 *
 * The archive is the register — every project record, stage, tag, note, volume
 * and release. It is hundreds of megabytes and it is not recoverable from
 * anywhere else; the project *folders* survive on disk, but nothing that lived
 * only in the database does.
 *
 * One box covering both would mean an operator who wanted to reset their
 * preferences lost their whole register to do it. They are different questions
 * and they get different answers.
 */
!macro ch_ClearSettings Base
  Delete "${Base}\settings.json"
  ; What the loader sets aside when a settings file will not parse. A verbatim
  ; copy of the file above, so deleting one and keeping the other says nothing.
  Delete "${Base}\settings.corrupt.*.json"
  Delete "${Base}\spotify.dat"
  Delete "${Base}\dispatch.dat"
  Delete "${Base}\firebase.json"
  Delete "${Base}\orientation.json"
  Delete "${Base}\release-notes.json"
  Delete "${Base}\window-state.json"
  Delete "${Base}\.updaterId"
  ; Chromium's own, which hold the window's state and nothing the operator set.
  Delete "${Base}\Preferences"
  Delete "${Base}\Local State"
  RMDir /r "${Base}\Cache"
  RMDir /r "${Base}\Code Cache"
  RMDir /r "${Base}\GPUCache"
  RMDir /r "${Base}\DawnGraphiteCache"
  RMDir /r "${Base}\DawnWebGPUCache"
  RMDir /r "${Base}\blob_storage"
  RMDir /r "${Base}\Local Storage"
  RMDir /r "${Base}\Session Storage"
  RMDir /r "${Base}\Shared Dictionary"
  RMDir /r "${Base}\WebStorage"
  RMDir /r "${Base}\Network"
!macroend

!macro ch_ClearArchive Base
  RMDir /r "${Base}\archive"
  RMDir /r "${Base}\runtime"
!macroend

/*
 * Applied to every name the user-data directory could carry.
 *
 * Electron takes it from `package.json`'s `name` while electron-builder knows
 * the product name, and neither end can be certain which the other used. The
 * generated uninstaller clears all three for the same reason. The trailing
 * `RMDir` is not recursive: it removes the directory only if both choices left
 * it empty, and leaves it alone otherwise.
 */
!macro ch_ApplyChoices Base
  ${If} $UnKeepSettingsState != ${BST_CHECKED}
    !insertmacro ch_ClearSettings "${Base}"
  ${EndIf}
  ${If} $UnKeepArchiveState != ${BST_CHECKED}
    !insertmacro ch_ClearArchive "${Base}"
  ${EndIf}
  RMDir "${Base}"
!macroend

/*
 * Keep both, unless the operator says otherwise.
 *
 * Set here rather than only by the checkboxes, and that is the load-bearing
 * part: a silent uninstall (`/S`) never shows the welcome page, so the leave
 * handler never runs and the states would be the empty string — which is not
 * "checked", so an unattended or scripted removal would delete the archive.
 * Defaulting to keep means the destructive answer can only ever come from
 * somebody who was shown the question and cleared the box.
 */
!macro customUnInit
  StrCpy $UnKeepSettingsState ${BST_CHECKED}
  StrCpy $UnKeepArchiveState ${BST_CHECKED}
!macroend

/*
 * The questions, on the page the operator is already reading.
 *
 * Checkboxes on the welcome page rather than a step of their own: these are two
 * small decisions with safe defaults, and giving them a whole page implies they
 * need more thought than they do.
 *
 * Anchored to the bottom of the dialog with negative offsets so they sit below
 * the body text whatever length it ends up being, and given a white background
 * because the welcome page is the one white panel in the installer.
 */
!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Remove ${PRODUCT_NAME}"
  !define MUI_UNWELCOMEPAGE_TEXT "This removes ${PRODUCT_NAME} and the archive runtime it installed.$\r$\n$\r$\nYour project folders on disk are never touched, whatever you choose below. Only this console's own record of them is in question.$\r$\n$\r$\nLeave both ticked and a later reinstall comes back exactly as you left it.$\r$\n"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ShowKeepChoices
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.LeaveKeepChoices
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

/*
 * Compiled into the uninstaller pass alone.
 *
 * electron-builder builds the uninstaller in a separate makensis run and then
 * the installer in another, including this file in both. Uninstaller functions
 * left visible to the installer pass earn `warning 6020: Uninstaller script
 * code found but WriteUninstaller never used` — and the build treats warnings
 * as errors, so the whole installer fails to compile over two functions that
 * pass never calls.
 */
!ifdef BUILD_UNINSTALLER

Function un.ShowKeepChoices
  ${NSD_CreateCheckbox} 120u -46u 195u 12u "Keep my settings"
  Pop $UnKeepSettings
  SetCtlColors $UnKeepSettings "" "ffffff"
  ${NSD_Check} $UnKeepSettings

  ${NSD_CreateCheckbox} 120u -32u 195u 12u "Keep my archive"
  Pop $UnKeepArchive
  SetCtlColors $UnKeepArchive "" "ffffff"
  ${NSD_Check} $UnKeepArchive
FunctionEnd

Function un.LeaveKeepChoices
  ${NSD_GetState} $UnKeepSettings $UnKeepSettingsState
  ${NSD_GetState} $UnKeepArchive $UnKeepArchiveState
FunctionEnd

!endif

!macro customUnInstall
  DetailPrint "Removing the archive runtime..."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\remove-archive-runtime.ps1" -InstallDir "$INSTDIR"'
  Pop $0

  ; Belt and braces: remove the directory even if the script could not run.
  RMDir /r "$INSTDIR\resources\mongodb"

  ${If} $UnKeepSettingsState == ${BST_CHECKED}
    DetailPrint "Settings kept."
  ${Else}
    DetailPrint "Removing settings..."
  ${EndIf}

  ${If} $UnKeepArchiveState == ${BST_CHECKED}
    DetailPrint "Archive kept."
  ${Else}
    DetailPrint "Removing the archive..."
  ${EndIf}

  ; Electron's user data is always per user, whichever mode this installed in.
  SetShellVarContext current

  !insertmacro ch_ApplyChoices "$APPDATA\${APP_FILENAME}"
  !ifdef APP_PRODUCT_FILENAME
    !insertmacro ch_ApplyChoices "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  !ifdef APP_PACKAGE_NAME
    !insertmacro ch_ApplyChoices "$APPDATA\${APP_PACKAGE_NAME}"
    ; The updater's download cache. Neither settings nor archive, and of no use
    ; to anything once the application it was fetching updates for is gone.
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
  !endif
!macroend
