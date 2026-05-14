# ARCHITECTURE.md — CleeVoice

Detalle técnico módulo por módulo. Léelo antes de empezar Fase 1.

---

## Procesos de Electron

Electron tiene dos tipos de procesos:

- **Main process** (Node.js completo) — tiene acceso a FS, child_process, globalShortcut, tray, ventanas. Aquí vive toda la lógica pesada.
- **Renderer process** (Chromium sandboxed) — solo UI React. No tiene acceso directo a Node por seguridad.
- **Preload script** — el puente. Expone APIs del main al renderer vía `contextBridge`.

**Regla:** todo lo que toque disco, audio, atajos, child_process → main. Todo lo visual → renderer. Nunca al revés.

---

## Módulo: `main/index.ts` — entry point

Responsabilidades:
- `app.whenReady()` → inicializar tray, hotkey, DB, settings.
- Crear ventanas escondidas (overlay y settings) — no se muestran hasta que se necesitan.
- Manejar `app.on('window-all-closed')` para **NO** cerrar la app (queremos que viva en tray).
- Single instance lock con `app.requestSingleInstanceLock()` — solo una CleeVoice corriendo a la vez.

```typescript
import { app } from 'electron'
import { setupTray } from './tray'
import { setupHotkey } from './hotkey'
import { initDb } from './db'

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return }
  await initDb()
  setupTray()
  setupHotkey()
})

app.on('window-all-closed', (e) => e.preventDefault())
```

---

## Módulo: `main/tray.ts` — bandeja del sistema

- Crear `new Tray(iconPath)` con icono 16x16 (Mac retina: 32x32 @2x).
- Menú contextual: `[ Settings, Toggle dictation, ─, Quit ]`.
- En Mac, usar template image (negro + transparente) para que se vea bien en dark/light mode.

---

## Módulo: `main/hotkey.ts` — atajos globales

Dos modos:

### Modo A — Toggle (default, simple)
```typescript
import { globalShortcut } from 'electron'

globalShortcut.register('CommandOrControl+Shift+Space', () => {
  isRecording ? stopRecording() : startRecording()
})
```

Limitación: `globalShortcut` solo dispara en `keydown`, no detecta `keyup`. Bueno para toggle, malo para push-to-talk.

### Modo B — Push-to-talk (avanzado)
Usar `node-global-key-listener` que sí da `up`/`down`:

```typescript
import { GlobalKeyboardListener } from 'node-global-key-listener'
const v = new GlobalKeyboardListener()
v.addListener((e) => {
  if (e.name === 'SPACE' && e.modifiers.includes('LEFT CTRL') && e.modifiers.includes('LEFT SHIFT')) {
    if (e.state === 'DOWN') startRecording()
    if (e.state === 'UP') stopRecording()
  }
})
```

**Decisión:** empezar con Modo A. Migrar a Modo B en Fase 5 si el feedback pide push-to-talk.

---

## Módulo: `main/audio.ts` — captura de audio

El audio se captura en el **renderer** (la web API es la que da acceso al mic). El main solo orquesta.

Flujo:
1. Main dispara evento `start-recording` al renderer del overlay.
2. Overlay (React) llama `navigator.mediaDevices.getUserMedia({ audio: true })`.
3. Crea `MediaRecorder` con `mimeType: 'audio/webm;codecs=opus'`.
4. Al stop, junta chunks en un Blob, lo convierte a `ArrayBuffer`, lo manda al main.
5. Main escribe a `${app.getPath('temp')}/cleevoice-${Date.now()}.wav` (conversión webm→wav con `ffmpeg-static`).

```typescript
// renderer/overlay/recorder.ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
const chunks: Blob[] = []
recorder.ondataavailable = (e) => chunks.push(e.data)
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' })
  const buffer = await blob.arrayBuffer()
  window.api.audioReady(buffer)  // expuesto via preload
}
recorder.start()
```

**Importante:** Whisper espera WAV 16kHz mono. Si pasamos webm, whisper.cpp lo rechaza. **Convertir siempre.**

---

## Módulo: `main/whisper.ts` — transcripción local

Wrapper sobre el binario `whisper-cli` (parte de whisper.cpp).

```typescript
import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'

const binPath = process.platform === 'darwin'
  ? path.join(process.resourcesPath, 'whisper/whisper-cli-mac')
  : path.join(process.resourcesPath, 'whisper/whisper-cli-win.exe')

const modelPath = path.join(app.getPath('userData'), 'models/ggml-base.bin')

export async function transcribe(wavPath: string, lang = 'es'): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-l', lang,
      '--output-txt',
      '--no-prints',
    ]
    const proc = spawn(binPath, args)
    let out = ''
    proc.stdout.on('data', (d) => out += d)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`whisper exit ${code}`))
      resolve(out.trim())
    })
  })
}
```

### Descarga del modelo (primer arranque)

`scripts/download-model.js` — al primer uso, si el modelo no existe, lo baja de:
`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin` (~140 MB)

Mostrar progreso en la UI con barra. NO bloquear la app — permitir cancelar y elegir cloud.

### Tamaños de modelo (para que el usuario elija)

| Modelo | Tamaño | Velocidad relativa | Calidad ES | Recomendado para |
|---|---|---|---|---|
| tiny | ~75 MB | 10x | ⭐⭐ | Notas rápidas, comandos |
| base | ~140 MB | 7x | ⭐⭐⭐ | **Default — buena calidad general** |
| small | ~460 MB | 4x | ⭐⭐⭐⭐ | Si base no convence |
| medium | ~1.5 GB | 2x | ⭐⭐⭐⭐⭐ | Solo en máquinas potentes |

---

## Módulo: `main/groq.ts` — transcripción cloud (plan B gratis)

Groq da Whisper-large-v3-turbo gratis con API key. Es la opción de "LLM gratuito" que mencionó Cristhian.

```typescript
import FormData from 'form-data'
import fs from 'fs'
import fetch from 'node-fetch'

export async function transcribeWithGroq(wavPath: string, apiKey: string, lang = 'es') {
  const form = new FormData()
  form.append('file', fs.createReadStream(wavPath))
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', lang)
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  return (await res.text()).trim()
}
```

El usuario pega su API key en Settings. La key se guarda cifrada con `safeStorage` de Electron (Keychain en Mac, DPAPI en Windows).

---

## Módulo: `main/llm-cleanup.ts` — limpieza con LLM (opcional)

Groq también da Llama 3.3 70B gratis. Lo usamos para limpiar muletillas y dar formato.

```typescript
export async function cleanup(rawText: string, apiKey: string, context: string) {
  const systemPrompt = `Eres un editor de texto. Recibirás una transcripción de voz cruda en español.
Tu tarea: devolver el texto limpio, con puntuación correcta, sin muletillas ("eh", "este", "o sea",
"como que"), preservando 100% el sentido. NO agregues nada que no esté. NO uses markdown.
Devuelve SOLO el texto limpio, sin comillas ni comentarios.

Contexto de la app activa: ${context}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  })
  const data = await res.json() as any
  return data.choices[0].message.content.trim()
}
```

**Contexto = nombre de la app activa.** Usamos `active-win` npm package para detectar dónde está el cursor. Si es Gmail → "email profesional". Si es Slack → "mensaje casual breve". Si es Cursor/VSCode → "comentario técnico". El prompt se ajusta.

---

## Módulo: `main/paste.ts` — inyección de texto

**Mac:**
```typescript
import { clipboard } from 'electron'
import { exec } from 'child_process'

export async function pasteText(text: string) {
  const previous = clipboard.readText()
  clipboard.writeText(text)
  await new Promise(r => setTimeout(r, 50))  // dale tiempo al clipboard

  // AppleScript: simular Cmd+V
  exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)

  // Restaurar clipboard previo después de 1s (opcional pero buen UX)
  setTimeout(() => clipboard.writeText(previous), 1000)
}
```

**Windows:**
```typescript
import { keyboard, Key } from '@nut-tree-fork/nut-js'
// nut-js es más mantenido que robotjs y soporta Windows/Mac/Linux

export async function pasteText(text: string) {
  const previous = clipboard.readText()
  clipboard.writeText(text)
  await new Promise(r => setTimeout(r, 50))
  await keyboard.pressKey(Key.LeftControl, Key.V)
  await keyboard.releaseKey(Key.V, Key.LeftControl)
  setTimeout(() => clipboard.writeText(previous), 1000)
}
```

**Permisos:**
- **Mac:** la app debe estar en "Accesibilidad" en System Settings. Mostrar instrucción en onboarding.
- **Windows:** sin permisos especiales, funciona out of the box.

---

## Módulo: `main/db.ts` — SQLite

`better-sqlite3` es síncrono y rápido. Schema:

```sql
CREATE TABLE IF NOT EXISTS transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER,
  app_name TEXT,
  raw_text TEXT,
  cleaned_text TEXT,
  engine TEXT,  -- 'local' | 'groq'
  model TEXT    -- 'base' | 'small' | 'whisper-large-v3-turbo'
);

CREATE TABLE IF NOT EXISTS dictionary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL,
  notes TEXT
);
```

DB vive en `app.getPath('userData')/cleevoice.db`.

---

## Módulo: `main/settings.ts` — configuración

`electron-store` para settings simples (JSON):

```typescript
import Store from 'electron-store'

export const settings = new Store<{
  hotkey: string
  engine: 'local' | 'groq'
  model: 'tiny' | 'base' | 'small' | 'medium'
  language: string
  cleanupEnabled: boolean
  groqApiKey: string  // cifrado con safeStorage
  customPrompt: string
}>({
  defaults: {
    hotkey: 'CommandOrControl+Shift+Space',
    engine: 'local',
    model: 'base',
    language: 'es',
    cleanupEnabled: false,
    groqApiKey: '',
    customPrompt: '',
  }
})
```

---

## Ventanas

### Overlay window (la que dice "🎤 escuchando")
- `frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true`
- Tamaño ~240x80, centrada abajo de la pantalla
- No se muestra hasta que se dispara el hotkey
- `mouseEnabled: false` mientras escucha (no roba focus)

### Settings window
- Ventana normal, 800x600
- Solo se abre desde tray menu o desde el primer arranque
- Se cierra → vuelve al tray, no quita la app

---

## Bridge main ↔ renderer (preload)

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  audioReady: (buffer: ArrayBuffer) => ipcRenderer.send('audio-ready', buffer),
  onStartRecording: (cb: () => void) => ipcRenderer.on('start-recording', cb),
  onStopRecording: (cb: () => void) => ipcRenderer.on('stop-recording', cb),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s: any) => ipcRenderer.invoke('set-settings', s),
})
```

Cada llamada del renderer va por `ipcRenderer.invoke/send`. Nunca `nodeIntegration: true` (security).

---

## Empaquetado (electron-builder)

`electron-builder.yml`:

```yaml
appId: com.joinsclee.cleevoice
productName: CleeVoice
directories:
  output: dist
extraResources:
  - from: resources/whisper/
    to: whisper/
mac:
  category: public.app-category.productivity
  target: dmg
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  notarize: true   # requiere Apple Developer ID
win:
  target: nsis
  publisherName: JoinsClee
```

`entitlements.mac.plist` debe incluir:
```xml
<key>com.apple.security.device.microphone</key><true/>
<key>com.apple.security.automation.apple-events</key><true/>
```

---

## Lo que NO vamos a construir (scope explícito)

Para no morir en feature creep:

- ❌ Transcripción de meetings (Zoom/Meet)
- ❌ Diarization (separar voces)
- ❌ Sincronización en la nube de transcripciones
- ❌ App móvil
- ❌ Sistema de cuentas / login
- ❌ Compartir transcripciones públicamente
- ❌ Plug-ins de terceros

Si más adelante se piden, se discuten. Por ahora: **dictado a texto, una tecla, donde sea, gratis.**
