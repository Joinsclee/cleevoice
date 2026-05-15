# Instalación de CleeVoice — Equipo JoinsClee

Guía para que cualquier persona del equipo instale CleeVoice en su Mac o Windows y empiece a dictar en menos de 5 minutos.

---

## Setup común: API key de Groq (1 minuto, gratis)

CleeVoice usa **Groq** como motor de transcripción (Whisper-large-v3-turbo) — es más rápido y mejor calidad que las alternativas locales, y **es gratis** hasta ~4 horas de audio por día por persona.

Necesitás una API key (la app te la pide al primer arranque):

1. Andá a **[console.groq.com/keys](https://console.groq.com/keys)**.
2. Login con Google (o crea cuenta).
3. Click en **Create API Key** → ponele cualquier nombre → copia la key (empieza con `gsk_...`).
4. Cuando abras CleeVoice por primera vez, pegala en el banner de bienvenida y dale **Guardar**.

Listo, ya podés dictar.

---

## macOS (Apple Silicon — M1, M2, M3, M4)

### Paso 1 — Bajar e instalar la app

1. Andá a la [página del último release](https://github.com/Joinsclee/cleevoice/releases/latest).
2. Bajá **`CleeVoice-X.Y.Z-arm64.dmg`** y **`Liberar-CleeVoice.command`**.
3. Doble click en el DMG → arrastrá **CleeVoice** a **Aplicaciones**. Ejectá el DMG.

### Paso 2 — Liberar la app de la cuarentena de macOS

> *Por qué:* macOS marca con "cuarentena" todo lo descargado de internet. Como CleeVoice no está firmada con un Apple Developer ID ($99/año), si abrís directo, macOS muestra *"Apple no ha podido verificar..."*. El script de abajo te evita ese diálogo.

1. Doble click en **`Liberar-CleeVoice.command`**.
2. Se abre una ventanita con un mensaje verde. Esperá 3 segundos.
3. CleeVoice se abre solo en la menubar. **Listo para siempre.**

> Si macOS te bloquea el `.command`, click derecho → Abrir → Abrir igual. Solo la primera vez.

### Paso 3 — API key de Groq

La ventana de Settings se abre sola con un banner pidiendo la API key.

- Si todavía no la tenés: seguí el [paso de Setup común](#setup-común-api-key-de-groq-1-minuto-gratis) arriba (1 min en console.groq.com).
- Pegala en el banner → click **Guardar**. La app la valida y la cifra con Keychain de macOS.

### Paso 4 — Permisos macOS (cuando los pida)

Cuando dictes por primera vez, macOS pide dos permisos. **Aceptá los dos**:

1. **Micrófono** — diálogo nativo al primer dictado.
2. **Accesibilidad** — para que el texto se pegue donde está el cursor. macOS abre el panel automáticamente. Activá el toggle de CleeVoice.

### Paso 5 — Dictar

- Hotkey: **`⌘ + Shift + Espacio`**
- Estando en cualquier app (Gmail, Slack, Notion, Skool, GoHighLevel…) presionalo → habla → presionalo de nuevo → el texto aparece pegado donde tenés el cursor.

---

## Windows 10/11 (x64)

### Paso 1 — Bajar e instalar

1. Andá a la [página del último release](https://github.com/Joinsclee/cleevoice/releases/latest).
2. Bajá **`CleeVoice-X.Y.Z-x64.exe`**.

> Si todavía no está, Cristhian/Camilo lo van a subir desde una PC con Windows.

3. Doble click → SmartScreen muestra *"Windows protegió tu PC"* → click **"Más información"** → **"Ejecutar de todas formas"**.
4. El instalador te deja elegir directorio. Marcá *"Crear acceso directo en escritorio"* si querés.

### Paso 2 — API key de Groq (igual que en Mac)

CleeVoice se abre con un banner pidiendo la API key. Pegala. Listo.

### Paso 3 — Permiso de micrófono

Windows pide acceso al micrófono al primer dictado — aceptá.

### Paso 4 — Dictar

- Hotkey: **`Ctrl + Shift + Espacio`**
- Misma lógica que Mac.

---

## Configurarla (opcional)

Click en el ícono → **Settings** → 7 pestañas:

| Pestaña | Para qué |
|---|---|
| **General** | Idioma, autostart, notificaciones |
| **Modelo** | Cambiar a engine Local si querés (requiere `brew install whisper-cpp` en Mac) |
| **Cloud** | Tu API key de Groq, test de conexión |
| **Limpieza IA** | Activa para que Llama 3.3 quite muletillas antes de pegar |
| **Atajos** | Cambiar el hotkey |
| **Diccionario** | Skool, JoinsClee, GoHighLevel, MétodoCLEE... ya precargados |
| **Historial** | Tus transcripciones + tiempo ahorrado |

---

## Actualizaciones

CleeVoice chequea cada 4 horas si hay versión nueva. Cuando hay, te notifica y te ofrece descargarla. También podés disparar el check manualmente desde el ícono → **"Buscar actualizaciones…"**.

En Mac el update abre el DMG nuevo en el browser → arrastrás a Aplicaciones → corres `Liberar-CleeVoice.command` una vez → seguís usando.

---

## Troubleshooting

| Síntoma | Solución |
|---|---|
| Banner rojo *"No hay API key de Groq configurada"* | Tab Cloud → pegá tu key gratis de console.groq.com/keys |
| **"Apple no ha podido verificar..."** al abrir la app | Doble click en `Liberar-CleeVoice.command`, o en Terminal: `xattr -rd com.apple.quarantine /Applications/CleeVoice.app` |
| **"CleeVoice está dañado"** | Versión vieja. Bajá la última desde Releases y reinstalá |
| Dicto pero no aparece texto | *System Settings → Privacy → Accesibilidad* → activar CleeVoice |
| Hotkey no responde | Otra app lo captura. Settings → Atajos → cambialo |
| Whisper escucha mal mis términos | Settings → Diccionario → agregá los términos con su capitalización exacta |
| El ícono de la menubar no aparece | Buscá bien junto a la hora. Si tu Mac tiene notch + muchos íconos, `⌘+drag` para moverlos |

---

## Reportar problemas

Mandale screenshot + descripción a Cristhian. Los logs detallados están en:

- **macOS:** `~/Library/Logs/cleevoice/main.log`
- **Windows:** `%APPDATA%\cleevoice\logs\main.log`

---

## Privacidad

Con engine **Groq Cloud** (default), el audio se envía a los servidores de Groq para transcribir. Ellos no entrenan modelos con tu audio (ver su [política de privacidad](https://groq.com/privacy-policy/)). El texto transcrito vuelve a tu Mac y se guarda en el historial local.

Si querés **100% local** (sin internet, nada sale de tu Mac), instalá Homebrew + whisper-cpp y cambiá engine a Local en Settings → Modelo. Solo Mac por ahora.
