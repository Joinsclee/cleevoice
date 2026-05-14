#!/usr/bin/env bash
# Bundlea whisper-cli + sus libs ggml dentro del repo en resources/whisper/
# para que la app empaquetada funcione en cualquier Mac (incluso sin brew).
#
# Reescribe todas las refs absolutas a /opt/homebrew/... usando install_name_tool,
# con paths relativos a @loader_path. Después del bundling, los binarios son
# auto-contenidos y portátiles.
#
# Requisitos: estar en un Mac con `brew install whisper-cpp` ya ejecutado.
# Output:
#   resources/whisper/whisper-cli-mac        (binario)
#   resources/whisper/lib/libwhisper.1.dylib
#   resources/whisper/lib/libggml.0.dylib
#   resources/whisper/lib/libggml-base.0.dylib
#   resources/whisper/lib/ggml-libexec/libggml-{blas,metal,cpu-*}.so
#
# El main process setea GGML_BACKEND_PATH al lanzar whisper-cli para que
# encuentre los backends. Ver src/main/whisper.ts.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/resources/whisper"
LIB="$OUT/lib"
LIBEXEC="$LIB/ggml-libexec"

BREW_PREFIX="$(brew --prefix)"
WHISPER_BIN="$BREW_PREFIX/bin/whisper-cli"
WHISPER_DYLIB="$(ls "$BREW_PREFIX/Cellar/whisper-cpp"/*/lib/libwhisper.1.*.dylib | head -1)"
GGML_LIB_DIR="$(ls -d "$BREW_PREFIX/Cellar/ggml"/*/lib | head -1)"
GGML_LIBEXEC_DIR="$(ls -d "$BREW_PREFIX/Cellar/ggml"/*/libexec | head -1)"

if [ ! -x "$WHISPER_BIN" ]; then
  echo "❌ whisper-cli no encontrado en $WHISPER_BIN"
  echo "   Instalá con: brew install whisper-cpp"
  exit 1
fi

echo "→ Limpiando $OUT/whisper-cli-mac, $LIB/"
rm -rf "$LIB" "$OUT/whisper-cli-mac"
mkdir -p "$LIBEXEC"

echo "→ Copiando binario"
cp "$WHISPER_BIN" "$OUT/whisper-cli-mac"
chmod +x "$OUT/whisper-cli-mac"

echo "→ Copiando libwhisper"
cp "$WHISPER_DYLIB" "$LIB/libwhisper.1.dylib"
chmod +w "$LIB/libwhisper.1.dylib"

echo "→ Copiando libggml + libggml-base"
GGML_DYLIB="$(ls "$GGML_LIB_DIR"/libggml.0.*.dylib | head -1)"
GGML_BASE_DYLIB="$(ls "$GGML_LIB_DIR"/libggml-base.0.*.dylib | head -1)"
cp "$GGML_DYLIB" "$LIB/libggml.0.dylib"
cp "$GGML_BASE_DYLIB" "$LIB/libggml-base.0.dylib"
chmod +w "$LIB/libggml.0.dylib" "$LIB/libggml-base.0.dylib"

echo "→ Copiando backends ggml (libexec)"
for src in "$GGML_LIBEXEC_DIR"/*.so; do
  cp "$src" "$LIBEXEC/$(basename "$src")"
  chmod +w "$LIBEXEC/$(basename "$src")"
done

# ─── Reescribir install names ──────────────────────────────────────────────

# Patrones de búsqueda para refs absolutas que queremos rebobinar.
# Brew puede usar /opt/homebrew (arm) o /usr/local (intel) — manejamos los dos.
patterns=(
  "/opt/homebrew/opt/ggml/lib/libggml.0.dylib"
  "/opt/homebrew/opt/ggml/lib/libggml-base.0.dylib"
  "/opt/homebrew/opt/whisper-cpp/lib/libwhisper.1.dylib"
  "/usr/local/opt/ggml/lib/libggml.0.dylib"
  "/usr/local/opt/ggml/lib/libggml-base.0.dylib"
  "/usr/local/opt/whisper-cpp/lib/libwhisper.1.dylib"
)

fix_install_names() {
  local target="$1"
  local relative_lib_prefix="$2"  # ej: @loader_path/lib (binario) o @loader_path (dylib)

  echo "    fixing $target"

  # Identidad del propio módulo (id) — sólo para dylibs.
  local base="$(basename "$target")"
  if [[ "$target" == *.dylib ]]; then
    install_name_tool -id "@rpath/$base" "$target" 2>/dev/null || true
  fi

  # Cambiar cada path absoluto a @loader_path/<base>.
  for pat in "${patterns[@]}"; do
    local base_lib="$(basename "$pat")"
    install_name_tool -change "$pat" "$relative_lib_prefix/$base_lib" "$target" 2>/dev/null || true
  done

  # Borramos TODOS los rpaths existentes (homebrew deja "@loader_path/../lib"
  # que no aplica a nuestro layout). Después agregamos el correcto.
  local rpaths
  rpaths=$(otool -l "$target" 2>/dev/null | awk '/LC_RPATH/{flag=1;next} flag && /path/{print $2; flag=0}')
  while IFS= read -r rp; do
    if [ -n "$rp" ]; then
      install_name_tool -delete_rpath "$rp" "$target" 2>/dev/null || true
    fi
  done <<<"$rpaths"

  # Reaplicar rpath relativo según el rol del archivo.
  if [[ "$target" == *.dylib ]] || [[ "$target" == *.so ]]; then
    # Las libs buscan sus deps en su mismo directorio.
    install_name_tool -add_rpath "@loader_path" "$target" 2>/dev/null || true
  else
    # El binario whisper-cli busca libs en ./lib relativo a sí mismo.
    install_name_tool -add_rpath "@loader_path/lib" "$target" 2>/dev/null || true
  fi
}

echo "→ Reescribiendo install names"
fix_install_names "$OUT/whisper-cli-mac" "@loader_path/lib"
fix_install_names "$LIB/libwhisper.1.dylib" "@loader_path"
fix_install_names "$LIB/libggml.0.dylib" "@loader_path"
fix_install_names "$LIB/libggml-base.0.dylib" "@loader_path"
for so in "$LIBEXEC"/*.so; do
  fix_install_names "$so" "@loader_path/.."
done

# libggml tiene HARDCODED el path donde buscar los backends ggml (.so files).
# En Homebrew apunta a /opt/homebrew/Cellar/ggml/<version>/libexec. Ese path
# no existe en máquinas sin brew. Patcheamos binariamente el string a uno
# neutro y predecible; en runtime, src/main/whisper.ts crea ese directorio y
# coloca symlinks a los .so del bundle antes de spawnear whisper-cli.
#
# La nueva ruta debe tener menor o igual length que la original — usamos null
# bytes de padding (C-string termina en el primer NUL).
echo "→ Patchando path hardcoded en libggml.0.dylib"
python3 - "$LIB/libggml.0.dylib" <<'PY'
import sys, re
path = sys.argv[1]
data = open(path, 'rb').read()
# Match cualquier /opt/homebrew/Cellar/ggml/<version>/libexec o /usr/local/.../libexec
pattern = re.compile(rb'(/(?:opt/homebrew|usr/local)/Cellar/ggml/[^/]+/libexec)\x00')
new_target = b'/tmp/cleevoice-ggml-bx'  # 22 chars
replacements = 0
def repl(m):
    global replacements
    replacements += 1
    original = m.group(1)
    padding = b'\x00' * (len(original) - len(new_target))
    # Devolvemos new_target + padding + NUL terminator (\x00)
    return new_target + padding + b'\x00'
data = pattern.sub(repl, data)
open(path, 'wb').write(data)
print(f'   {replacements} occurrence(s) replaced → /tmp/cleevoice-ggml-bx')
PY

# install_name_tool invalida la firma ad-hoc que Homebrew aplica a los binarios.
# Sin firma válida, macOS Gatekeeper mata silenciosamente al binario al arrancarlo
# (sin output ni error visible). Re-firmamos ad-hoc para que funcione localmente.
# Para distribución pública con notarización habría que usar tu Developer ID.
echo "→ Re-firmando ad-hoc para evitar bloqueo de Gatekeeper"
codesign --force --sign - --timestamp=none "$LIB/libggml-base.0.dylib"
codesign --force --sign - --timestamp=none "$LIB/libggml.0.dylib"
codesign --force --sign - --timestamp=none "$LIB/libwhisper.1.dylib"
for so in "$LIBEXEC"/*.so; do
  codesign --force --sign - --timestamp=none "$so"
done
codesign --force --sign - --timestamp=none "$OUT/whisper-cli-mac"

echo "→ Verificando dependencias"
echo "  whisper-cli:"
otool -L "$OUT/whisper-cli-mac" | sed 's/^/    /'
echo "  libwhisper:"
otool -L "$LIB/libwhisper.1.dylib" | sed 's/^/    /'
echo "  libggml:"
otool -L "$LIB/libggml.0.dylib" | sed 's/^/    /'

# Quitar quarantine xattr por si los archivos vienen con él (raro pero pasa).
xattr -dr com.apple.quarantine "$OUT" 2>/dev/null || true

echo ""
echo "✅ Bundle listo en $OUT"
echo "   $(du -sh "$OUT" | cut -f1) totales"
