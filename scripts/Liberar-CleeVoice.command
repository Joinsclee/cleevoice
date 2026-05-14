#!/usr/bin/env bash
#
# CleeVoice — Liberador de cuarentena macOS.
#
# Doble click en este archivo desbloquea la app de CleeVoice del atributo
# com.apple.quarantine que macOS pone automáticamente a archivos
# descargados de internet. Después de correrlo, CleeVoice abre sin el
# diálogo "Apple no ha podido verificar...".
#
# Esto NO instala nada, NO modifica el sistema, NO requiere password.
# Lo único que hace es ejecutar:
#     xattr -rd com.apple.quarantine /Applications/CleeVoice.app
#
# Necesario porque CleeVoice se distribuye sin firma de Apple Developer ID
# ($99/año) — la firma ad-hoc que usamos satisface a Gatekeeper en un 99%
# de los casos, pero algunos macOS recientes (Sonoma+/Sequoia) además
# requieren quitar el quarantine cuando viene de internet.

set -e

APP_PATH="/Applications/CleeVoice.app"

clear
cat <<'BANNER'

   ┌─────────────────────────────────────────────┐
   │                                             │
   │     CleeVoice — Liberador de cuarentena     │
   │                                             │
   └─────────────────────────────────────────────┘

BANNER

if [ ! -d "$APP_PATH" ]; then
  echo "  ❌ No encuentro CleeVoice en /Applications/"
  echo ""
  echo "  Antes de correr este script:"
  echo "    1. Abrí el DMG que descargaste"
  echo "    2. Arrastrá CleeVoice a la carpeta Aplicaciones"
  echo "    3. Volvé a correr este script"
  echo ""
  read -p "  Presioná Enter para cerrar..." dummy
  exit 1
fi

echo "  🔓 Destrabando CleeVoice de la cuarentena de macOS…"
if xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null; then
  echo "     ✓ Listo"
else
  echo "     (la app ya estaba liberada)"
fi

echo ""
echo "  🚀 Abriendo CleeVoice…"
open "$APP_PATH"

echo ""
echo "  ✅ Todo listo. El ícono del micrófono debería aparecer en"
echo "     la menubar (esquina superior derecha de tu pantalla)."
echo ""
echo "  Si es la primera vez que la usás:"
echo "    • Click en el ícono → 'Iniciar / detener dictado' o"
echo "    • Presioná ⌘+Shift+Espacio para dictar desde cualquier app"
echo ""
sleep 5
