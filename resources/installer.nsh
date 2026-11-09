; Some PCs leave the install folder with an AppContainer entry but no "ALL APPLICATION PACKAGES"
; (S-1-15-2-1) entry. Electron's sandboxed processes then cannot read it and the app exits
; before showing anything. Grant read/execute like Program Files has by default.
!macro customInstall
  nsExec::Exec '"$SYSDIR\icacls.exe" "$INSTDIR" /grant *S-1-15-2-1:(OI)(CI)(RX) /C /Q'
!macroend
