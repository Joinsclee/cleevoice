# CleeVoice — Dictado por voz para todo tu sistema operativo

> **Una tecla. Habla. Aparece texto limpio donde estés escribiendo.**
> El "Glaido" de JoinsClee — open-source, multiplataforma (Windows + Mac), gratuito en su modo local.

---

## 0. Naming — ¿Por qué "CleeVoice"?

Antes de empezar a construir, fijamos el nombre. Te dejo cinco opciones apalancadas en el ecosistema **JoinsClee**, ordenadas de la más recomendada a las alternativas:

| Nombre | Lectura | Pros | Contras |
|---|---|---|---|
| **CleeVoice** ⭐ | "clí-vois" | Claro, directo, dice qué hace. Mantiene la raíz `Clee`. Dominio probablemente libre. | Algo descriptivo, poco "marca" |
| **Cleeko** | "clí-ko" | Corto, brandeable, suena tech. Fácil de pronunciar en ES e inglés. | No dice qué hace por sí solo |
| **Cleespeak** | "clí-spik" | Descriptivo. Suena premium. | Más largo |
| **Vooclee** | "vu-clí" | Mezcla "voice" + "Clee". Memorable. | Pronunciación dudosa fuera de ES |
| **Sayclee** | "sei-clí" | Verbo + marca. Sentido publicitario. | Suena más a feature que a app |

**Recomendación:** usar **CleeVoice** como nombre del producto y `cleevoice` como slug técnico (carpeta, repo, app id, dominio). Es el más claro para que cualquier cliente lo entienda al primer vistazo, y el más fácil de SEO-ear si algún día abrimos un landing en `cleevoice.joinsclee.com`.

A partir de aquí todo el documento asume ese nombre.

---

## 1. ¿Qué estamos construyendo?

CleeVoice es una **app de dictado por voz que vive en segundo plano**. Funciona así:

1. Está corriendo en la bandeja del sistema (tray icon).
2. El usuario presiona un atajo global (por defecto `Ctrl+Shift+Espacio` en Windows / `Cmd+Shift+Espacio` en Mac) **estando en cualquier app** — Gmail, Notion, ChatGPT, VSCode, Skool, GoHighLevel, Slack, Word, etc.
3. Aparece un mini-overlay flotante "🎤 Escuchando…" mientras habla.
4. Suelta la tecla (o vuelve a presionar el atajo).
5. La app transcribe localmente con Whisper, limpia el texto con un LLM, y **lo pega automáticamente donde estaba el cursor**.

Resultado: el usuario habla y el texto aparece. Punto. No abre otra ventana, no copia-pega, no cambia de contexto.

### Diferenciales vs. Glaido (que es nuestro benchmark)

| Aspecto | Glaido | CleeVoice |
|---|---|---|
| Plataforma | Solo macOS | **Windows + Mac desde día 1** |
| Stack | App nativa Mac | Electron multiplataforma |
| Modelo | Cloud propietario | **Local (gratis) + Cloud opcional** |
| Privacidad | Procesa en su nube | **100% local por defecto** |
| Costo | Freemium (~Pro pagado) | **Gratis** (modo local) / pago opcional |
| Idiomas | 100+ | 100+ (Whisper soporta todo) |
| Custom prompts | Sí | Sí — y conectado a **Método CLEE** |

### Por qué esto tiene sentido para JoinsClee

Tres razones de negocio:

1. **Productividad interna del equipo** — Cristhian + setters + media-buyers + redactores escriben cientos de mensajes, copys, scripts y respuestas a comunidad cada día. Una app de dictado bien hecha les devuelve 1-2 horas diarias por persona.
2. **Demo de "AI-first agency"** — poder mostrarle a un cliente potencial "esta app la construimos nosotros con Claude Code en una semana" refuerza la PUV de la agencia.
3. **Posible producto/lead magnet futuro** — descarga gratuita con branding JoinsClee, captura email, upgrade a Cloud con LLM premium. MiniApp pero a escala de desktop.

---

## 2. Arquitectura técnica (decisiones tomadas)

### Stack elegido

```
┌─────────────────────────────────────────────────────┐
│                  CleeVoice App                       │
│         (Electron 33 — Node 24 + Chromium)          │
├─────────────────────────────────────────────────────┤
│  UI (React 19 + Tailwind + shadcn/ui)               │
│  ├─ Tray icon (system tray)                         │
│  ├─ Recording overlay (siempre-encima)              │
│  └─ Settings window                                  │
├─────────────────────────────────────────────────────┤
│  Main process (Node)                                 │
│  ├─ globalShortcut → captura el hotkey              │
│  ├─ Audio capture (mic via Web Audio API)           │
│  ├─ Audio buffer → WAV en /tmp                      │
│  ├─ Llamada a whisper.cpp (local) ó Groq (cloud)    │
│  ├─ Post-procesamiento LLM (limpieza + formato)     │
│  └─ Inyección de texto (clipboard + paste sintético)│
├─────────────────────────────────────────────────────┤
│  Local storage                                       │
│  ├─ better-sqlite3 → historial de transcripciones   │
│  ├─ electron-store → settings (JSON)                │
│  └─ Whisper models en ~/.cleevoice/models/          │
└─────────────────────────────────────────────────────┘
```

### Decisiones clave y por qué

| Decisión | Por qué |
|---|---|
| **Electron** (no Tauri, no Native) | Code-share Windows+Mac, ecosistema npm completo, ejemplos abiertos (OpenWhispr, Whispering) sobre los que partir. Tauri es más liviano pero menos maduro para audio + globalShortcut + tray. |
| **whisper.cpp** local (no Python) | Inferencia rápida en CPU, sin instalar Python, binario que se empaqueta con la app. Mismo binario funciona en Mac (Metal) y Windows (CPU/CUDA). |
| **Modelo `base` (~140 MB)** como default | Equilibrio precio/calidad. En español multiplataforma da transcripción decente en ~1-2s para clips de 10s. Si la calidad no convence, el usuario puede bajar `small` (~460 MB) desde Settings. |
| **Groq como cloud fallback gratuito** | Groq sirve Whisper-large-v3-turbo **gratis** con rate limit generoso. Es nuestro plan B "LLM gratuito" — calidad cloud sin pagar. |
| **Paste sintético** (no API de inyección) | Copiamos el resultado al clipboard, simulamos `Cmd/Ctrl+V`. Funciona universalmente sin permisos especiales por app. Es lo que hace Glaido y OpenWhispr. |
| **Limpieza con LLM opcional** | Groq Llama 3.3 70B gratis para limpiar muletillas y formatear. Off por defecto para evitar latencia; el usuario lo prende. |

### Stack final (resumen)

- **Runtime:** Node.js 24, Electron 33
- **UI:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Audio:** Web Audio API → WAV buffer
- **STT local:** whisper.cpp (modelos base/small/medium descargables)
- **STT cloud:** Groq Whisper-large-v3-turbo (gratis con API key del usuario)
- **LLM cleanup:** Groq Llama 3.3 70B (gratis) — opcional
- **DB:** better-sqlite3 (historial local)
- **Settings:** electron-store
- **Build:** electron-builder (NSIS para Windows, DMG para Mac)
- **Global hotkey:** Electron `globalShortcut` (default) + `node-global-key-listener` (push-to-talk avanzado)
- **Paste:** Electron clipboard + `robotjs` (Win) / `applescript` (Mac) para simular Cmd+V

---

## 3. Flujo de usuario completo

```
1. Usuario instala CleeVoice.exe / CleeVoice.dmg
2. Primer arranque → wizard de 3 pasos:
     a) Permisos de micrófono y accesibilidad
     b) Elige modelo (base recomendado / cloud Groq con API key)
     c) Elige hotkey (default Ctrl+Shift+Espacio)
3. App va a tray. Listo.

— En uso —

4. Usuario está en Gmail escribiendo un correo.
5. Presiona Ctrl+Shift+Espacio (push-to-talk) → aparece overlay "🎤".
6. Habla: "Hola Camilo, gracias por tu mensaje de ayer, mañana te mando la propuesta actualizada"
7. Suelta la tecla → overlay muestra "⚙️ procesando…"
8. ~1.5s después → texto aparece pegado en Gmail, capitalizado y con puntuación.
9. Overlay desaparece. Usuario sigue escribiendo.
```

---

## 4. Roadmap por fases

Pensado para construir con Claude Code de forma incremental. Cada fase es un PR funcional.

### Fase 0 — Setup (medio día)
- Crear repo `cleevoice`
- Inicializar Electron + Vite + React + TS + Tailwind
- Configurar electron-builder
- App vacía abre, muestra "Hello CleeVoice", cierra. Hello world cross-platform.

### Fase 1 — Tray + Hotkey + Overlay (1 día)
- Tray icon que abre menú (Settings, Quit)
- `globalShortcut.register` con hotkey configurable
- Al presionar hotkey, muestra overlay flotante centrado abajo
- Suelta hotkey → overlay desaparece
- **Validación:** funciona en Windows y Mac, el hotkey responde estando en cualquier app

### Fase 2 — Captura de audio (1 día)
- Al presionar hotkey, captura audio del mic con MediaRecorder
- Guarda WAV en `app.getPath('temp')`
- Log del path y duración. Sin transcribir todavía.
- **Validación:** archivo WAV se reproduce correctamente

### Fase 3 — Transcripción local con whisper.cpp (2 días)
- Bundlear binario `whisper-cli` (Mac universal + Windows x64) en `resources/whisper/`
- Descargar modelo `ggml-base.bin` al primer uso → `~/.cleevoice/models/`
- Pasar el WAV al binario, capturar stdout
- Mostrar el texto en el overlay por 3s
- **Validación:** dictado "hola mundo esto es una prueba" → texto correcto en ES

### Fase 4 — Inyección de texto (medio día)
- Copiar texto transcrito al clipboard
- Simular `Cmd+V` (Mac via AppleScript) / `Ctrl+V` (Win via robotjs o nut-js)
- **Validación:** dictado aparece en Notepad, Gmail, VSCode

### Fase 5 — Settings UI (1 día)
- Ventana de Settings con tabs: General, Modelo, Atajos, Avanzado
- Cambiar hotkey
- Cambiar modelo (descarga si no existe)
- Toggle "limpieza con LLM"
- **Validación:** cambios persisten entre reinicios

### Fase 6 — Cloud fallback con Groq (1 día)
- Settings: pegar API key de Groq
- Opción "Usar cloud (más rápido, requiere internet)"
- Llamada a `https://api.groq.com/openai/v1/audio/transcriptions` con `whisper-large-v3-turbo`
- **Validación:** transcripción cloud < 1s, igual o mejor calidad

### Fase 7 — Limpieza con LLM (1 día)
- Después de transcribir, pasar texto a Groq Llama 3.3 70B con prompt de limpieza
- Detectar contexto (app activa via `active-win`) → ajustar tono
- Prompt configurable: el usuario puede editarlo (gancho para Método CLEE)
- **Validación:** "eh esto es como osea una prueba" → "Esto es una prueba."

### Fase 8 — Historial + dictionary (1 día)
- better-sqlite3: guarda cada transcripción (timestamp, app, texto raw, texto limpio)
- Settings → Historial: lista buscable
- Diccionario personalizado: lista de términos que Whisper debe respetar (nombres clientes, jerga JoinsClee: "Skool", "GoHighLevel", "Hormozi", "Cialdini", "CLEE"...)
- **Validación:** "joinsclee" se transcribe como "JoinsClee", no como "Join Esquí"

### Fase 9 — Pulido y empaquetado (2 días)
- Auto-updater (electron-updater)
- Icono, splash, branding JoinsClee
- DMG firmado (Mac) — requiere Apple Developer ID
- NSIS instalador (Win) — opcionalmente firmado
- Landing simple en cleevoice.joinsclee.com con descargas
- **Entregable final:** instaladores listos para distribuir

**Total estimado:** 10-11 días-hombre con Claude Code asistiendo a velocidad ~3x.

---

## 5. Costos esperados

| Componente | Costo |
|---|---|
| Modelo local Whisper | **$0** (corre en CPU del usuario) |
| Groq Whisper cloud | **$0** hasta el rate limit gratuito (~14,400 segundos/día por API key) |
| Groq Llama 3.3 70B | **$0** hasta rate limit (~6000 req/día) |
| Apple Developer (firma Mac) | $99/año (opcional pero recomendado para que no salga "app no verificada") |
| Windows code signing cert | ~$200-400/año (opcional) |
| Hosting landing | $0 — usar Vercel/GH Pages |
| **TOTAL Y1 mínimo** | **$0** funcionando, **$99-499** "presentable" |

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Calidad de Whisper `base` en español no convence | Plan B desde día 1: Groq cloud con `large-v3-turbo` gratis es la opción más rápida y precisa que existe hoy |
| Inyección de texto falla en alguna app específica | Fallback: copia al clipboard y muestra notificación "texto listo, presiona Ctrl+V". El usuario nunca queda colgado. |
| Permisos de accesibilidad en macOS confunden al usuario | Wizard de onboarding con screenshots paso a paso. OpenWhispr ya resolvió esto bien, copiamos su approach. |
| Modelos pesan mucho (base = 140MB) | Descarga bajo demanda al primer uso, no se empaqueta en el instalador. Instalador queda en ~80MB. |
| Hotkey colisiona con otra app del usuario | Settings permite cambiarlo. Si la registración falla, mostrar warning. |

---

## 7. Estructura de archivos del repo

```
cleevoice/
├── README.md                          ← este archivo
├── PROMPT_MASTER_CLAUDE_CODE.md       ← el prompt para arrancar
├── ARCHITECTURE.md                    ← detalle técnico
├── ROADMAP.md                         ← fases con tareas
├── package.json
├── electron-builder.yml
├── src/
│   ├── main/                          ← Electron main process
│   │   ├── index.ts                   ← entry point
│   │   ├── tray.ts                    ← tray icon + menu
│   │   ├── hotkey.ts                  ← globalShortcut
│   │   ├── audio.ts                   ← captura de audio
│   │   ├── whisper.ts                 ← wrapper de whisper.cpp
│   │   ├── groq.ts                    ← cliente Groq cloud
│   │   ├── llm-cleanup.ts             ← post-procesamiento LLM
│   │   ├── paste.ts                   ← inyección de texto
│   │   ├── db.ts                      ← SQLite
│   │   └── settings.ts                ← electron-store
│   ├── renderer/                      ← UI React
│   │   ├── overlay/                   ← ventana flotante "escuchando"
│   │   ├── settings/                  ← ventana de configuración
│   │   └── shared/                    ← componentes shadcn/ui
│   └── preload/                       ← bridge main↔renderer
├── resources/
│   ├── whisper/
│   │   ├── whisper-cli-mac            ← binario universal Mac
│   │   └── whisper-cli-win.exe        ← binario Windows
│   └── icons/
└── scripts/
    ├── download-whisper-cli.js        ← bajar binarios en setup
    └── download-model.js              ← bajar ggml-base.bin
```

---

## 8. Cómo empezar

Tres archivos en este paquete:

1. **README.md** — este documento, contexto completo del proyecto.
2. **ARCHITECTURE.md** — detalle técnico de cada módulo (qué hace, qué libs usa, qué API expone).
3. **PROMPT_MASTER_CLAUDE_CODE.md** — **el prompt** que copias en Claude Code para arrancar Fase 0. Cada fase tiene su propio sub-prompt continuador.

**Flujo recomendado:**

```bash
# 1. En tu Mac/PC
mkdir cleevoice && cd cleevoice
git init

# 2. Abre Claude Code en esta carpeta
claude

# 3. Pega el contenido de PROMPT_MASTER_CLAUDE_CODE.md
# 4. Claude Code construye Fase 0 + Fase 1
# 5. Pruebas, commit, pasas al siguiente prompt de fase
```

Cada fase es un commit/PR. No avances a la siguiente sin probar la anterior. Eso te asegura que en cualquier punto tienes una app que funciona.

---

## 9. Referencias open-source en las que apoyarnos

Estos proyectos ya resolvieron mucho de lo que vamos a construir. **Leerlos antes de codear ahorra días:**

- **OpenWhispr** — https://github.com/OpenWhispr/openwhispr — Electron + React + whisper.cpp, MIT, multiplataforma. **Es lo más cercano a CleeVoice.** Estudiar su estructura.
- **Whispering** — https://github.com/braden-w/whispering — Tauri (alternativa más liviana), buen UX, también MIT.
- **whisper.cpp** — https://github.com/ggerganov/whisper.cpp — el motor de inferencia local.
- **faster-whisper** — https://github.com/SYSTRAN/faster-whisper — alternativa Python si decidiéramos un backend separado (no es el plan, pero útil de referencia).
- **node-global-key-listener** — https://github.com/LaunchMenu/node-global-key-listener — para push-to-talk verdadero (detectar key-up).

**Estrategia inteligente:** fork OpenWhispr → rebrand a CleeVoice → quitar lo que no usamos (meeting transcription, agente, calendar) → ajustar prompts y diccionario al ecosistema JoinsClee. **Esto recorta el roadmap de 10 días a ~4-5 días.**

Esta decisión te la dejo abierta. El roadmap de 10 días asume construcción desde cero (más control, sin acoplamiento a su roadmap). El fork asume velocidad máxima.

---

## 10. Resumen ejecutivo

- **Qué:** App de dictado por voz multiplataforma para JoinsClee y posiblemente como producto público.
- **Nombre:** **CleeVoice** (alternativas: Cleeko, Cleespeak).
- **Stack:** Electron + React + whisper.cpp + Groq (cloud gratis).
- **Costo Y1:** $0 funcional / hasta $499 firmado.
- **Tiempo:** 10-11 días desde cero con Claude Code, o 4-5 días forkeando OpenWhispr.
- **Próximo paso:** abrir Claude Code en una carpeta vacía y pegar **PROMPT_MASTER_CLAUDE_CODE.md**.
