# PROMPT MASTER — Claude Code

> Copia este archivo completo (o sus secciones por fase) directamente en tu sesión de Claude Code dentro de la carpeta vacía donde quieres construir CleeVoice.

---

## 🎯 PROMPT DE ARRANQUE (úsalo el primer día)

Copia desde aquí ↓↓↓

```
Vamos a construir CleeVoice, una app de dictado por voz multiplataforma (Windows + Mac) inspirada en Glaido (glaido.com), pero open-source y con modelo local gratuito por defecto.

## Contexto del proyecto
CleeVoice vive en la bandeja del sistema (tray). El usuario presiona un atajo global (Ctrl+Shift+Espacio por defecto), habla en cualquier app, y el texto transcrito aparece pegado donde estaba el cursor. Procesamiento local con whisper.cpp (gratis, privado) y opción cloud con Groq (también gratis con API key).

Este proyecto es para JoinsClee, una agencia de marketing digital especializada en lanzamientos de productos digitales y comunidades en Skool. Servirá como herramienta interna de productividad y posiblemente como producto público bajo la marca JoinsClee.

## Stack obligatorio
- Electron 33+ con electron-vite (NO crear el proyecto desde cero — usa el template oficial de electron-vite con React + TypeScript)
- React 19 + TypeScript estricto
- Tailwind CSS v4 + shadcn/ui (componentes con clases utility)
- whisper.cpp para transcripción local (binarios bundleados, modelos descargables)
- Groq SDK para transcripción cloud (whisper-large-v3-turbo) y LLM cleanup (llama-3.3-70b-versatile)
- better-sqlite3 para historial
- electron-store para settings
- @nut-tree-fork/nut-js para inyección de texto en Windows (Mac usa AppleScript)
- electron-builder para empaquetado

## Tu primera tarea: Fase 0 + Fase 1

Construye estas dos fases en el siguiente orden, una commit por fase.

### Fase 0 — Setup base
1. Inicializa el proyecto con `npm create @quick-start/electron@latest cleevoice -- --template react-ts` (electron-vite con React + TS).
2. Si esa plantilla no existe, usa `electron-vite` directamente: `npm create electron-vite cleevoice -- --template=react-ts`.
3. Instala y configura Tailwind CSS v4 siguiendo la doc oficial (Vite plugin).
4. Configura TypeScript en modo strict.
5. Crea la estructura de carpetas:
   ```
   src/
   ├── main/         (Electron main process - vacío por ahora salvo index.ts)
   ├── preload/      (bridge main↔renderer)
   ├── renderer/     (UI React)
   │   ├── overlay/
   │   ├── settings/
   │   └── shared/
   resources/
   ├── icons/
   └── whisper/      (binarios, vacío por ahora)
   scripts/          (descarga de modelos, vacío por ahora)
   ```
6. Reemplaza el contenido por defecto: la ventana inicial debe mostrar "CleeVoice — Listo para construir" centrado, con fondo gradiente sutil.
7. Crea un README.md mínimo con `npm run dev`, `npm run build`.
8. Configura electron-builder mínimo en package.json (appId: com.joinsclee.cleevoice, productName: CleeVoice).

**Criterio de aceptación Fase 0:**
- `npm install` corre sin errores
- `npm run dev` abre una ventana de Electron con el texto "CleeVoice — Listo para construir"
- TypeScript strict no muestra errores
- No hay warnings de Tailwind

Después de pasar el criterio, haz commit:
```
git init
git add .
git commit -m "feat: project skeleton with electron-vite + react + ts + tailwind"
```

### Fase 1 — Tray + Hotkey + Overlay flotante

Sin cerrar la app entre las fases, continúa.

1. **Tray icon:** en `src/main/tray.ts`, crea un Tray con un icono temporal (puedes usar un PNG genérico o generar uno simple programáticamente con nativeImage). Menú: "Settings", "Toggle dictation", separador, "Quit".
2. **Single instance lock:** en `src/main/index.ts`, llama `app.requestSingleInstanceLock()`.
3. **Override window-all-closed:** la app no debe cerrarse cuando se cierran ventanas; debe vivir en tray. En Mac, esconde el dock con `app.dock?.hide()`.
4. **Global hotkey:** en `src/main/hotkey.ts`, registra `CommandOrControl+Shift+Space` con `globalShortcut.register`. Al disparar, emite evento `toggle-recording`.
5. **Overlay window:** crea una BrowserWindow con `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, tamaño 280x100. Posiciónala centrada horizontalmente, 80px desde abajo de la pantalla principal. NO la muestres al iniciar.
6. **Renderer del overlay:** una página `overlay.html` con un componente React que muestra "🎤 Escuchando…" cuando está activo, animación pulse sutil con Tailwind. Por ahora cuando recibe el evento `toggle-recording` muestra el overlay 2 segundos y lo esconde.
7. **Preload del overlay:** expone `window.api.onToggleRecording(callback)` con contextBridge.

**Criterio de aceptación Fase 1:**
- App corre. Icono visible en tray (esquina derecha en Mac, esquina derecha de la barra en Win).
- Cierro toda ventana → app sigue viva en tray.
- Estando en otra app (Chrome, Notepad, lo que sea), presiono Ctrl+Shift+Space → aparece el overlay flotante "🎤 Escuchando…" centrado abajo.
- A los 2 segundos desaparece solo.
- Click derecho en tray → menú con Quit funciona.

Commit:
```
git add .
git commit -m "feat: tray icon, global hotkey, floating overlay window"
```

## Reglas de trabajo
- Después de cada fase, **detente y muéstrame qué archivos cambiaste**. No avances a la siguiente sin que yo lo apruebe.
- Si una dependencia tiene una versión más nueva o un breaking change, **avísame antes de instalar**.
- Si el comando de inicialización del template falla, **NO inventes**. Dime qué pasó y propón alternativas.
- Comenta el código en español cuando explique decisiones de negocio o pasos no obvios.
- Para componentes UI, usa Tailwind utility classes inline (no CSS modules).
- TypeScript estricto: nada de `any` sin justificar.
- No uses `console.log` para debug en producción — usa `electron-log` desde Fase 1.

## Cuando termines Fase 0 y Fase 1
1. Lista los archivos creados/modificados.
2. Muéstrame la salida de `npm run dev` (que abra y funcione).
3. Espera mi confirmación antes de Fase 2 (audio).

Empieza.
```

Hasta aquí ↑↑↑ termina el prompt de arranque.

---

## 📋 PROMPTS POR FASE (úsalos secuencialmente después del de arranque)

### Prompt Fase 2 — Captura de audio

```
Fase 1 está aprobada. Vamos con Fase 2: captura de audio.

Cambia el comportamiento del hotkey de "mostrar overlay 2s" al siguiente flujo:
1. Primera presión del hotkey: empieza a grabar (overlay muestra "🎤 Grabando..." con timer mm:ss).
2. Segunda presión: detiene la grabación (overlay muestra "⚙️ Procesando..." por 1s y desaparece).
3. Por ahora no transcribimos; solo guardamos el WAV y mostramos el path en consola.

Implementa:
- `src/renderer/overlay/Recorder.tsx`: usa `navigator.mediaDevices.getUserMedia({ audio: true })` y `MediaRecorder` con `mimeType: 'audio/webm;codecs=opus'`. Junta los chunks y al stop, manda el ArrayBuffer al main vía IPC.
- En main: recibe el ArrayBuffer, escríbelo como `.webm` temporal en `app.getPath('temp')`, luego conviértelo a WAV 16kHz mono usando `ffmpeg-static` + `fluent-ffmpeg`. Guarda el WAV final como `cleevoice-${timestamp}.wav`. Log de path y duración en electron-log.
- Maneja el permiso de micrófono: si falla, muestra notificación nativa con instrucciones para habilitarlo.
- En Mac, asegura que `entitlements.mac.plist` incluya `com.apple.security.device.microphone`.

Criterio de aceptación:
- Dicto "uno dos tres prueba de audio" durante 3 segundos.
- En consola aparece "Audio guardado: /tmp/cleevoice-xxxx.wav, duración: 3.0s".
- Abro ese WAV y se escucha correctamente lo que dije.
- Si niego el permiso del mic, la app me notifica claramente.

Commit: `feat: audio capture and webm-to-wav conversion`
```

### Prompt Fase 3 — Whisper local

```
Fase 2 aprobada. Vamos con Fase 3: transcripción local con whisper.cpp.

Esta es la fase más larga. Trabájala con cuidado.

1. **Binarios de whisper.cpp:**
   - Crea `scripts/download-whisper-cli.js` que descarga los binarios precompilados de la última release de https://github.com/ggerganov/whisper.cpp/releases/
   - Para Mac descarga el universal (arm64+x64). Para Windows el x64.
   - Los pone en `resources/whisper/whisper-cli-mac` y `resources/whisper/whisper-cli-win.exe`.
   - El script corre con `npm run postinstall` automáticamente.
   - Si no encuentras releases precompiladas confiables, usa Homebrew (Mac) y descarga el zip oficial de Windows. Si tampoco, dime y vemos compilar desde fuente.

2. **electron-builder config:**
   - En `electron-builder.yml`, agrega `extraResources` para copiar `resources/whisper/` al app empaquetado.

3. **Descarga del modelo en runtime:**
   - Crea `src/main/model-downloader.ts`.
   - Al arrancar, verifica si existe `app.getPath('userData')/models/ggml-base.bin`.
   - Si no existe, descárgalo de `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin` (~140MB) mostrando progreso.
   - El progreso se muestra en una ventana modal de onboarding (créala si hace falta) con barra de progreso shadcn/ui.

4. **Wrapper de whisper.cpp:**
   - Crea `src/main/whisper.ts` con la función `transcribeLocal(wavPath: string, language: string): Promise<string>`.
   - Usa `child_process.spawn` con el binario y args: `-m <modelPath> -f <wavPath> -l <lang> --output-txt --no-prints`.
   - Lee el `.txt` resultante (whisper-cli lo genera junto al WAV) o captura stdout.
   - Mide tiempo de procesamiento y logéalo.
   - Maneja errores: binario no existe, modelo no existe, audio vacío, exit code != 0.

5. **Integración con el flujo:**
   - Cuando termina la grabación, llama a `transcribeLocal()` con el WAV.
   - Mientras procesa, overlay muestra "⚙️ Transcribiendo...".
   - Al terminar, overlay muestra el texto transcrito por 3 segundos. Luego desaparece.
   - Por ahora SOLO mostrar el texto en el overlay. La inyección a la app activa la haremos en Fase 4.

Criterio de aceptación:
- Al primer arranque, baja el modelo con progreso visible.
- Dicto 5 frases en español de complejidad creciente:
  1. "Hola mundo"
  2. "Esta es una prueba de dictado"
  3. "Necesito mandarle un correo a Camilo sobre la propuesta"
  4. "Voy a lanzar mi comunidad en Skool con el método CLEE de JoinsClee" (este puede fallar en términos propios, OK por ahora)
  5. "Mañana a las tres tengo reunión con el equipo de marketing"
- 4 de 5 deben transcribirse correctamente (palabra-perfectas o con error mínimo).
- Tiempo de procesamiento < 3s en Mac M1 / Windows i5 reciente para clips de 10s.

Commit: `feat: local transcription with whisper.cpp and base model`
```

### Prompt Fase 4 — Inyección de texto

```
Fase 3 aprobada. Vamos con Fase 4: pegar el texto donde está el cursor del usuario.

Implementa `src/main/paste.ts` con la función `pasteText(text: string)`:

**Mac:**
- Guarda el clipboard actual con `clipboard.readText()`.
- Escribe el texto nuevo con `clipboard.writeText(text)`.
- Espera 50ms.
- Ejecuta vía `child_process.exec`:
  `osascript -e 'tell application "System Events" to keystroke "v" using command down'`
- Después de 1 segundo, restaura el clipboard original.

**Windows:**
- Instala `@nut-tree-fork/nut-js`.
- Misma lógica de guardar/restaurar clipboard.
- Para simular Ctrl+V: `keyboard.pressKey(Key.LeftControl, Key.V); await new Promise(r=>setTimeout(r,30)); keyboard.releaseKey(Key.V, Key.LeftControl)`.

**Onboarding para Mac:**
- Crea pantalla de onboarding (si aún no existe) que detecta si la app tiene permiso de accesibilidad usando `systemPreferences.isTrustedAccessibilityClient(false)`.
- Si no lo tiene, muestra instrucciones paso a paso (texto + screenshot que generes con SVG inline si no tienes imágenes) para ir a System Settings → Privacy & Security → Accessibility → activar CleeVoice.
- Botón "Abrir System Settings" que ejecuta `systemPreferences.isTrustedAccessibilityClient(true)`.

**Fallback:**
- Si la inyección falla (ej. ventana sin focus), muestra una notificación nativa: "Texto copiado al portapapeles — presiona Ctrl/Cmd+V para pegar".

**Integración:**
- Después de transcribir, ANTES de mostrar el texto en el overlay, ya pega el texto en la app activa.
- El overlay muestra brevemente "✓ Listo" en vez del texto completo.

Criterio de aceptación:
- Abro Notepad/TextEdit. Dicto algo. El texto aparece en Notepad.
- Abro Gmail web. Hago click en cuerpo del correo. Dicto. Aparece en el correo.
- Abro Cursor/VSCode. Hago click en el editor. Dicto. Aparece en el editor.
- Mi clipboard previo se restaura después.
- En Mac, si no di permiso de accesibilidad, el onboarding me lo pide claramente.

Commit: `feat: cross-platform text injection at cursor position`
```

### Prompt Fase 5 — Settings UI

```
Fase 4 aprobada. Construyamos la ventana de Settings.

Crea `src/renderer/settings/` con React Router (o un sistema simple de tabs con useState) y estas 4 tabs:

1. **General**
   - Toggle "Iniciar con el sistema" → usa `app.setLoginItemSettings`.
   - Toggle "Mostrar notificaciones".
   - Selector de idioma de transcripción (es, en, pt, fr — por ahora estos 4).

2. **Modelo**
   - Lista de modelos disponibles: tiny (75MB), base (140MB - default), small (460MB), medium (1.5GB).
   - Para cada uno: nombre, tamaño, "✓ Descargado" o botón "Descargar".
   - Radio button para elegir cuál usar.
   - Botón "Eliminar" para liberar espacio.

3. **Atajos**
   - Campo de captura de hotkey (KeyCapture): graba la combinación que el usuario presiona.
   - Validación: debe incluir al menos un modificador (Ctrl/Cmd/Shift/Alt).
   - Al guardar, re-registrar el atajo con `globalShortcut.unregisterAll()` + `register()`.

4. **Diccionario**
   - Textarea o lista editable con términos personalizados.
   - Pre-cargar con: Skool, GoHighLevel, JoinsClee, MétodoCLEE, Cristhian, Camilo, Hormozi, Cialdini, Schwartz, n8n, Supabase, Easypanel, Claude Code, Anthropic.
   - Botones agregar/eliminar.
   - Estos términos se pasan a Whisper vía el flag `--prompt "Términos clave: ..."`.

**Storage:**
- Usa `electron-store` con las claves definidas en `ARCHITECTURE.md` sección "Settings".
- Cifra la futura groqApiKey con `safeStorage` (será Fase 6, pero deja el campo preparado).

**Apertura:**
- Click en tray menu "Settings" → abre la ventana.
- Si ya está abierta, hace focus.

Criterio de aceptación:
- Cambio el hotkey de Ctrl+Shift+Space a Cmd+Opt+D (Mac) o Ctrl+Alt+D (Win).
- Cierro Settings. Presiono el nuevo hotkey en cualquier app. Funciona.
- Reinicio CleeVoice. El hotkey nuevo sigue activo.
- Agrego "JoinsClee" al diccionario, dicto "voy a publicar en mi comunidad de yonscli" y la transcripción muestra "JoinsClee" correctamente (o más cercano).
- Descargo el modelo "small" desde Settings. Cambia el engine activo a small. La siguiente transcripción usa small.

Commit: `feat: settings window with general, model, hotkey, dictionary tabs`
```

### Prompt Fase 6 — Groq cloud

```
Fase 5 aprobada. Agreguemos Groq como engine cloud alternativo.

1. **Nueva tab "Cloud" en Settings:**
   - Campo input para Groq API key (type="password" con toggle ver/ocultar).
   - Link "Cómo obtener una API key gratis" → https://console.groq.com/keys
   - Botón "Probar conexión": hace un request de prueba a Groq y muestra ✓ o ✗.
   - Radio: "Engine: ( ) Local ( ) Cloud (Groq)"
   - Texto pequeño: "Cloud es ~3x más rápido y ligeramente más preciso. Requiere internet."

2. **Cifrado de la key:**
   - Antes de guardar en electron-store, ciframos con `safeStorage.encryptString(key)` y guardamos el buffer en base64.
   - Al leer, desciframos con `safeStorage.decryptString(Buffer.from(b64, 'base64'))`.

3. **Cliente Groq:**
   - Crea `src/main/groq.ts` con `transcribeWithGroq(wavPath, apiKey, language)`.
   - Usa `node-fetch` o el fetch nativo de Node 24.
   - POST a `https://api.groq.com/openai/v1/audio/transcriptions`.
   - FormData con file, model=whisper-large-v3-turbo, language, response_format=text.
   - Headers: `Authorization: Bearer <key>`.
   - Maneja errores: 401 (key inválida), 429 (rate limit), 500+ (error servidor), network errors.

4. **Router de engine:**
   - En el flujo de transcripción, después de tener el WAV, lee `settings.engine`.
   - Si es 'local' → `transcribeLocal()`.
   - Si es 'groq' → `transcribeWithGroq()`.
   - Si Groq falla por red, fallback automático a local con notificación: "Cloud no disponible, usando local".

5. **Indicador visual:**
   - En el overlay durante "⚙️ Transcribiendo..." muestra "(local)" o "(cloud)" en pequeño.
   - En el tray menu, muestra "Engine: Local" o "Engine: Cloud" como ítem informativo.

Criterio de aceptación:
- Voy a console.groq.com, saco una API key gratis.
- La pego en Settings → Cloud, pruebo conexión: ✓.
- Activo engine Cloud.
- Dicto una frase. Tarda <1s (vs ~2s local). La calidad es notablemente mejor.
- Apago el wifi. Dicto. Veo notificación "Cloud no disponible, usando local". Funciona local.

Commit: `feat: groq cloud engine with safestorage-encrypted api key`
```

### Prompt Fase 7 — LLM cleanup

```
Fase 6 aprobada. Agreguemos limpieza de texto con LLM.

1. **Nueva sección en Settings → tab "Limpieza":**
   - Toggle "Limpiar texto con IA después de transcribir".
   - Selector de tono: General / Profesional / Casual / Técnico.
   - Textarea: "Prompt personalizado del sistema" (con el prompt default cargado, editable).
   - Botón "Restaurar prompt original".

2. **Detección de contexto:**
   - Instala `active-win` npm package.
   - Antes de limpiar, llama `await activeWin()` para saber qué app está enfocada.
   - Mapea apps a contextos:
     - Gmail / Outlook / Mail → "email profesional"
     - Slack / Discord / Telegram → "mensaje corto y casual"
     - VSCode / Cursor / IntelliJ → "comentario técnico de código"
     - ChatGPT / Claude → "prompt claro para LLM"
     - Notion / Obsidian / Word → "nota personal o documento"
     - Otros → "texto general"

3. **Implementación `src/main/llm-cleanup.ts`:**
   - Función `cleanupText(rawText, apiKey, context): Promise<string>`.
   - POST a `https://api.groq.com/openai/v1/chat/completions`.
   - model: `llama-3.3-70b-versatile`.
   - System prompt construido dinámicamente con el contexto:
     ```
     Eres un editor de texto preciso. Recibes una transcripción de voz cruda en español.
     Tarea: devolver el texto limpio sin muletillas ("eh", "este", "o sea", "como que"),
     con puntuación correcta, capitalización apropiada. Preserva 100% el sentido.
     NO inventes, NO agregues, NO uses markdown. Devuelve solo el texto.
     
     Contexto: ${context}
     ${context.includes('email') ? 'Tono profesional, párrafos completos.' : ''}
     ${context.includes('casual') ? 'Tono conversacional, frases cortas, sin saludos formales.' : ''}
     ${context.includes('técnico') ? 'Preserva términos técnicos, mantén código inline si lo hay.' : ''}
     ```
   - temperature: 0.2, max_tokens: 1500.

4. **Integración:**
   - En el flujo: transcribe → si `cleanupEnabled` → cleanup → paste.
   - Si cleanup falla, paste el texto raw (no bloquear al usuario).
   - Overlay muestra "✨ Limpiando..." entre transcripción y paste.

5. **Persistir en historial (preparación Fase 8):**
   - Guarda en memoria el texto raw + texto limpio + contexto detectado.
   - Fase 8 los persistirá en SQLite.

Criterio de aceptación:
- Activo limpieza con tono "Profesional".
- Estando en Gmail, dicto: "eh este o sea quería decirte que la propuesta este la mando mañana".
- El texto pegado dice: "Quería decirte que la propuesta la mando mañana."
- Estando en Slack, dicto lo mismo. El texto pegado dice algo como: "te mando la propuesta mañana".
- Estando en VSCode, dicto "esta función eh recibe un usuario y devuelve eh un token". El texto pegado: "Esta función recibe un usuario y devuelve un token."

Commit: `feat: llm cleanup with groq llama 3.3 and app-aware context detection`
```

### Prompt Fase 8 — Historial + diccionario aplicado

```
Fase 7 aprobada. Persistamos historial y mejoremos el diccionario.

1. **SQLite con better-sqlite3:**
   - Crea `src/main/db.ts` con el schema de `ARCHITECTURE.md`.
   - DB en `app.getPath('userData')/cleevoice.db`.
   - Funciones: `saveTranscription({ created_at, duration_ms, app_name, raw_text, cleaned_text, engine, model })`, `listTranscriptions(limit, offset, search)`, `deleteTranscription(id)`.

2. **Guardar cada transcripción:**
   - Después de paste, guarda la entrada completa en DB.
   - No bloquear el flow de UI.

3. **Tab "Historial" en Settings:**
   - Tabla con: timestamp (formato relativo: "hace 5min"), app, texto limpio (truncado a 80 chars), botones: copiar / eliminar.
   - Buscador arriba.
   - Paginación: 50 por página.

4. **Diccionario activo:**
   - Al construir el comando de whisper-cli, agrega `--prompt "Términos clave: ${dict.join(', ')}"`.
   - Al hacer cleanup con LLM, agrega en el system prompt: "Términos que SIEMPRE deben escribirse así (respeta mayúsculas/minúsculas): ${dict.join(', ')}".
   - Post-procesamiento adicional: regex case-insensitive de cada término → reemplaza con la versión canónica del diccionario. (Ej: si alguien dice "skol" o "scool", Whisper puede transcribir mal, pero el regex final corrige a "Skool").

5. **Estadísticas básicas en tab "Historial":**
   - "Total de transcripciones: X"
   - "Palabras totales: Y"
   - "Tiempo ahorrado estimado: Z minutos" (asumiendo 40 wpm typing vs ~150 wpm dictado)

Criterio de aceptación:
- Hago 10 transcripciones a lo largo del día.
- Abro Settings → Historial → veo las 10 con app, hora, texto.
- Busco "propuesta" → filtra correctamente.
- Hablo "voy a vender un curso de skul" → el texto final dice "Skool" (no "skul").
- Hablo "el método de hormosi y chialdini" → el texto final dice "Hormozi y Cialdini".
- La pestaña muestra "Tiempo ahorrado estimado: ~X minutos".

Commit: `feat: sqlite history, dictionary post-processing, stats`
```

### Prompt Fase 9 — Pulido y empaquetado

```
Fase 8 aprobada. Última fase: producto listo para distribuir.

1. **Branding final:**
   - Crea/agrega icono CleeVoice. Si no tienes diseño, pídele a Cristhian uno o usa un emoji estilizado generado con SVG (un círculo gradiente con un micrófono adentro, colores oscuros con acento azul/violeta acorde a JoinsClee).
   - Iconos en todos los tamaños: 16, 32, 64, 128, 256, 512, 1024.
   - Ícono de tray: 16x16 en Mac (con @2x = 32x32), template image (negro+alpha).
   - Splash de onboarding pulido con logo + nombre + tagline: "Habla. Aparece texto. En cualquier app."

2. **Onboarding completo (5 pantallas):**
   - 1: Bienvenida + tagline + "Empezar".
   - 2: Permiso de micrófono (botón "Conceder permiso").
   - 3: Permiso de accesibilidad en Mac / "Listo" en Win.
   - 4: Elegir engine: Local (gratis, privado) / Cloud (más rápido, requiere API key).
   - 5: Resumen + "Tu hotkey es Ctrl+Shift+Space. ¡Pruébalo!" con animación apuntando al hotkey.

3. **Auto-updater:**
   - Configura `electron-updater` con publish a GitHub Releases.
   - Verifica updates al iniciar y cada 24h.
   - Si hay update, descarga en background, notifica al usuario.

4. **Empaquetado Mac:**
   - DMG con `electron-builder --mac`.
   - Si tienes Apple Developer ID: configura firma y notarización (`afterSign` con `electron-notarize`).
   - Si no: el DMG funciona pero el primer arranque pedirá "abrir de todas formas" desde System Settings.

5. **Empaquetado Windows:**
   - NSIS installer con `electron-builder --win`.
   - Firma con cert si tienes (opcional).
   - El instalador debe ofrecer "Iniciar con Windows" como checkbox.

6. **Landing simple (opcional pero recomendado):**
   - Astro o HTML estático en `cleevoice.joinsclee.com`.
   - Secciones: hero ("Una tecla. Habla. Texto."), cómo funciona (GIF/screenshot), descarga (botones Mac/Win), FAQ.
   - Captura email opcional vía form a GoHighLevel o similar.

7. **Telemetría mínima opt-in:**
   - Sentry (tier gratis) para errores no manejados.
   - Solo se activa si el usuario marca el checkbox en onboarding.

Criterio de aceptación:
- Genero el DMG y el EXE.
- Mando el DMG a una persona con Mac que nunca vio el proyecto. En menos de 3 minutos está dictando.
- Mando el EXE a una persona con Windows. Misma prueba: <3 minutos hasta primera transcripción exitosa.
- Hago un cambio mínimo en el código, bumpeo versión 1.0.0 → 1.0.1, publico release. La app instalada detecta y descarga la actualización.

Commit final: `release: v1.0.0 — public installers for mac and windows`

Tag: `git tag v1.0.0 && git push --tags`
```

---

## 🚨 Reglas universales para Claude Code en este proyecto

Pega esto al INICIO de cualquier sesión nueva (recordatorio):

```
Reglas para este proyecto CleeVoice:

1. NO ejecutes `npm install` con dependencias que no estén en mi lista permitida sin avisar.
2. NO inventes APIs ni nombres de paquetes. Si dudas, busca primero.
3. NO uses `any` en TypeScript salvo que me lo justifiques.
4. NO escribas archivos `.md` largos como output; el detalle ya está en README.md, ARCHITECTURE.md y ROADMAP.md.
5. Después de cada cambio significativo, corre `npm run dev` y verifica que no hay errores antes de decir "listo".
6. Cuando termines una fase, lista archivos cambiados y espera mi visto bueno antes de la siguiente.
7. Comentarios en español cuando expliquen lógica de negocio. Variables y funciones en inglés.
8. Si algo no funciona en una plataforma (Mac o Win), dilo explícitamente — no asumas paridad.
9. Para temas de empaquetado y firma, NUNCA inventes paths o configs; verifica con la doc oficial de electron-builder.
10. Si una fase del roadmap parece tener un error u oportunidad de mejora, dilo ANTES de implementar, no después.
```

---

## 📚 Referencias de código abierto para consultar

Si te trabas, lee primero:

- **OpenWhispr** (referencia más cercana): https://github.com/OpenWhispr/openwhispr
- **Whispering** (alternativa con Tauri): https://github.com/braden-w/whispering
- **whisper.cpp releases** (binarios): https://github.com/ggerganov/whisper.cpp/releases
- **electron-vite docs**: https://electron-vite.org
- **electron-builder docs**: https://www.electron.build
- **Groq API docs**: https://console.groq.com/docs/speech-to-text
- **node-global-key-listener**: https://github.com/LaunchMenu/node-global-key-listener
- **nut-js**: https://nutjs.dev

---

## ⚡ Atajo: usar OpenWhispr como base (estrategia rápida)

Si en lugar de construir desde cero quieres acortar a 4-5 días, usa este prompt alternativo:

```
Vamos a forkear OpenWhispr (https://github.com/OpenWhispr/openwhispr) y convertirlo en CleeVoice, la app de dictado de JoinsClee.

Plan:
1. Clona el repo, instala deps, verifica que corre en dev.
2. Lee toda la estructura. Lista qué módulos vamos a conservar y cuáles vamos a quitar.
3. Conservar: dictation core, hotkey, whisper local, paste, settings básicos.
4. Quitar: meeting transcription, calendar integration, agent mode, notes system, cloud sync, billing/Stripe, OpenWhispr Cloud account system.
5. Rebrand: todos los strings "OpenWhispr" → "CleeVoice", appId → com.joinsclee.cleevoice, package.json name, README, logos, colores.
6. Agregar: diccionario JoinsClee precargado, prompt de cleanup en español con tono CLEE, branding visual.
7. Reempaquetar y probar Mac + Windows.

Antes de tocar código, hazme un plan detallado por archivo: qué eliminas, qué modificas, qué agregas. Espero tu plan.
```

---

**FIN DEL PROMPT MASTER.** Si necesitas regenerar prompts adaptados a algo que cambió en el proyecto, vuelve a este archivo y editalo.
