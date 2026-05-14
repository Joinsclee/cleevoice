# Instalación de CleeVoice — Equipo JoinsClee

Guía para que cualquier persona del equipo instale CleeVoice en su Mac o Windows y empiece a dictar en menos de 5 minutos.

---

## macOS (Apple Silicon — M1, M2, M3, M4)

> **Importante:** estas builds son solo para Mac con chip Apple Silicon. Para Intel x64 hablar con Cristhian.

### Paso 1 — Bajar los dos archivos

Desde la [página del último release](https://github.com/Joinsclee/cleevoice/releases/latest):

1. **`CleeVoice-0.1.4-arm64.dmg`** — la app
2. **`Liberar-CleeVoice.command`** — script para destrabar macOS (1 doble-click)

### Paso 2 — Instalar la app

1. Doble click en el **DMG** → arrastrá **CleeVoice** a **Aplicaciones**.
2. Ejectá el DMG.

### Paso 3 — Liberar la app de la cuarentena de macOS

> *¿Por qué?* macOS pone un atributo de "cuarentena" a todo lo que se baja de internet. Como CleeVoice no está firmada con un Apple Developer ID ($99/año), si abrís la app directo, macOS muestra *"Apple no ha podido verificar..."* y exige ir a System Settings → Privacy → "Abrir igualmente". El script de abajo te evita esa fricción.

1. Doble click en **`Liberar-CleeVoice.command`** que descargaste.
2. Se abre una ventana de terminal con un mensaje. Esperá 3 segundos.
3. CleeVoice se abre solo. **Listo, ya no vuelve a aparecer ese diálogo.**

> Si macOS te bloquea el `.command` con "no se puede abrir porque viene de un desarrollador no identificado", **click derecho → Abrir → Abrir igual**. Solo una vez.

### Paso 4 — Permisos del sistema (cuando los pida)

CleeVoice pide dos permisos macOS la primera vez que los usa:

1. **Micrófono** — al primer dictado. Aceptá.
2. **Accesibilidad** — para que el texto se pegue donde tenés el cursor. Activá el toggle de CleeVoice en *System Settings → Privacy & Security → Accesibilidad*.

Si saltás el de accesibilidad, igual funciona: el texto queda en el portapapeles y vos hacés `Cmd+V` manual. El overlay te lo recuerda.

### Paso 5 — Empezar a dictar

- CleeVoice vive en la **menubar** (esquina superior derecha, junto a la hora). NO aparece en el Dock.
- **Hotkey por defecto:** `⌘ + Shift + Espacio`
- Estando en cualquier app (Gmail, Slack, Notion, Skool, GoHighLevel...) presioná el hotkey → habla → presionalo de nuevo → el texto aparece pegado donde estabas escribiendo.

### Primer arranque: descarga del modelo (1-2 min, una vez)

La primera vez que dictes, CleeVoice baja **`ggml-small.bin` (~460MB)** desde Hugging Face. Vas a ver una notificación *"CleeVoice: descargando modelo"*. Esperá; después de eso, todo es local — el audio nunca sale de tu Mac.

---

## Windows 10/11 (x64)

### Paso 1 — Bajar

Desde la [página del último release](https://github.com/Joinsclee/cleevoice/releases/latest), descargá **`CleeVoice-0.1.4-x64.exe`**.

> Si todavía no está disponible, Cristhian te avisa cuando lo suba (se genera desde una PC con Windows; no se puede cross-compilar desde Mac).

### Paso 2 — Instalar

1. Doble click → SmartScreen muestra *"Windows protegió tu PC"* → click **"Más información"** → **"Ejecutar de todas formas"**.
2. El instalador te deja elegir directorio.
3. Marcá *"Crear acceso directo en escritorio"* si querés.

### Paso 3 — Empezar a dictar

- El ícono aparece en la **bandeja del sistema** (junto al reloj).
- **Hotkey por defecto:** `Ctrl + Shift + Espacio`
- Windows pide permiso de micrófono la primera vez — aceptá.

---

## Configurarla (opcional)

Click en el ícono → **Settings** → tenés 7 pestañas:

| Pestaña | Para qué |
|---|---|
| **General** | Idioma, autostart, notificaciones |
| **Modelo** | Elegir tiny/base/small/medium |
| **Cloud** | API key de Groq (gratis, ~3× más rápido) |
| **Limpieza IA** | Llama 3.3 quita muletillas antes de pegar |
| **Atajos** | Cambiar el hotkey |
| **Diccionario** | Skool, JoinsClee, GoHighLevel, MétodoCLEE... ya precargados |
| **Historial** | Tus transcripciones + tiempo ahorrado |

### API key de Groq (gratis)

1. [console.groq.com/keys](https://console.groq.com/keys) — login con Google
2. Create API Key → copiala
3. Settings → Cloud → pegala → Probar → Guardar

Límite gratis: ~14,400 segundos/día. Si lo superás, fallback automático a engine local.

---

## Actualizaciones

CleeVoice chequea cada 4 horas si hay una versión nueva. Cuando la hay, te notifica y te ofrece descargarla automáticamente. También podés disparar el check desde el ícono → **"Buscar actualizaciones…"**.

Para apps sin firma de Developer ID (como esta), el update se descarga al browser y vos arrastrás a Aplicaciones reemplazando. Hay que correr `Liberar-CleeVoice.command` (o `xattr -rd com.apple.quarantine /Applications/CleeVoice.app` en Terminal) **una vez por update** — después la app ya no muestra diálogos.

---

## Troubleshooting

| Síntoma | Solución |
|---|---|
| **"Apple no ha podido verificar..."** al abrir | Doble click en `Liberar-CleeVoice.command`, o en Terminal: `xattr -rd com.apple.quarantine /Applications/CleeVoice.app` |
| **"CleeVoice está dañado"** | Versión vieja (v0.1.0–v0.1.3). Bajá la última desde Releases y reinstalá |
| **Dicto pero no aparece texto** | Revisá *System Settings → Privacy → Accesibilidad* → activar CleeVoice |
| **Hotkey no responde** | Otra app está capturándolo. Settings → Atajos → cambialo |
| **Whisper escucha mal mis términos** | Settings → Diccionario → agregá los términos exactos con su capitalización |
| **El ícono de la menubar no aparece** | Buscá bien junto a la hora. Si tu Mac tiene notch + muchos íconos, podés moverlos con `⌘+drag` |

---

## Reportar problemas

Mandale screenshot + descripción a Cristhian. Los logs detallados están en:

- **macOS:** `~/Library/Logs/cleevoice/main.log`
- **Windows:** `%APPDATA%\cleevoice\logs\main.log`
