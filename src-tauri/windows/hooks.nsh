; Görseller (PNG, JPG, WebP) için yalnız "Birlikte aç" listesine giriş: varsayılan uygulama (ör. Fotoğraflar)
; değişmez. Tauri'nin dosya ilişkilendirmesi uzantının varsayılan değerini değiştirdiği için görseller orada değil, burada.
; Kurulum kullanıcıya özel (HKCU); kaldırırken aynı anahtarlar silinir.

!macro PAPERWELL_OPENWITH EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Paperwell.Image" ""
  WriteRegStr HKCU "Software\Classes\Applications\paperwell.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro PAPERWELL_OPENWITH_REMOVE EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Paperwell.Image"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Paperwell.Image" "" "Paperwell görseli"
  WriteRegStr HKCU "Software\Classes\Paperwell.Image\DefaultIcon" "" "$INSTDIR\paperwell.exe,0"
  WriteRegStr HKCU "Software\Classes\Paperwell.Image\shell\open" "" "Paperwell ile düzenle"
  WriteRegStr HKCU "Software\Classes\Paperwell.Image\shell\open\command" "" '"$INSTDIR\paperwell.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\paperwell.exe" "FriendlyAppName" "Paperwell"
  WriteRegStr HKCU "Software\Classes\Applications\paperwell.exe\shell\open\command" "" '"$INSTDIR\paperwell.exe" "%1"'
  !insertmacro PAPERWELL_OPENWITH "png"
  !insertmacro PAPERWELL_OPENWITH "jpg"
  !insertmacro PAPERWELL_OPENWITH "jpeg"
  !insertmacro PAPERWELL_OPENWITH "webp"
  ; Gezgin'e değişikliği bildir (SHCNE_ASSOCCHANGED)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro PAPERWELL_OPENWITH_REMOVE "png"
  !insertmacro PAPERWELL_OPENWITH_REMOVE "jpg"
  !insertmacro PAPERWELL_OPENWITH_REMOVE "jpeg"
  !insertmacro PAPERWELL_OPENWITH_REMOVE "webp"
  DeleteRegKey HKCU "Software\Classes\Paperwell.Image"
  DeleteRegKey HKCU "Software\Classes\Applications\paperwell.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
