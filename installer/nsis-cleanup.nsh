; nsis-cleanup.nsh
; Script customizado para o instalador NSIS do Replay
; Limpa cache do Electron e versoes anteriores durante a instalacao

!macro customInstall
  ; === Fechar Replay se estiver rodando ===
  DetailPrint "Fechando Replay se estiver rodando..."
  nsExec::ExecToLog 'taskkill /F /IM "Replay.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Replay-0.1.0.exe"'
  Sleep 1000

  ; === Limpar cache do Electron (preservar cookies/sessao) ===
  DetailPrint "Limpando cache do Electron..."

  RMDir /r "$APPDATA\replay\Cache"
  RMDir /r "$APPDATA\replay\Code Cache"
  RMDir /r "$APPDATA\replay\GPUCache"
  RMDir /r "$APPDATA\replay\DawnCache"
  RMDir /r "$APPDATA\replay\DawnWebGPUCache"
  RMDir /r "$APPDATA\replay\Service Worker"
  RMDir /r "$APPDATA\replay\Local Storage"
  RMDir /r "$APPDATA\replay\Session Storage"
  RMDir /r "$APPDATA\replay\blob_storage"
  RMDir /r "$APPDATA\replay\shared_proto_db"

  DetailPrint "Cache limpo. Sessao do ZenFisio preservada."

  ; === Limpar temporarios do portable antigo ===
  DetailPrint "Removendo versoes antigas portateis..."
  Delete "$DESKTOP\Replay-*.exe"
  Delete "$PROFILE\Downloads\Replay-*.exe"

  ; === Limpar temp Electron ===
  RMDir /r "$TEMP\*Replay*"

  DetailPrint "Limpeza concluida."
!macroend

!macro customUnInstall
  ; Limpar tudo na desinstalacao (incluindo cookies/sessao)
  DetailPrint "Removendo dados do Replay..."
  RMDir /r "$APPDATA\replay"
  DetailPrint "Dados removidos."
!macroend
