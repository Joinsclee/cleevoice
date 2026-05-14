# ROADMAP.md — CleeVoice

Construcción incremental. Cada fase termina con una app funcional que se puede commitear y probar.

**Regla de oro:** no avanzar a la siguiente fase sin que la actual pase el criterio de éxito.

---

## Fase 0 — Setup base ⏱ 4h

**Objetivo:** Electron + React + TS arrancando, "Hello CleeVoice" visible.

**Tareas:**
- [ ] `npm init -y`, instalar deps base
- [ ] Configurar Vite + electron-vite (template oficial)
- [ ] TypeScript strict mode
- [ ] Tailwind v4 + shadcn/ui init
- [ ] Estructura de carpetas según `ARCHITECTURE.md`
- [ ] Script `npm run dev` → app abre con título "CleeVoice"
- [ ] Script `npm run build` → genera ejecutable

**Criterio de éxito:** corres `npm run dev`, se abre una ventana de Electron con texto "CleeVoice — Listo para construir". No errores en consola.

**Commit:** `feat: project skeleton with electron-vite + react + ts + tailwind`

---

## Fase 1 — Tray + Hotkey + Overlay ⏱ 8h

**Objetivo:** App vive en tray. Hotkey global muestra overlay temporal.

**Tareas:**
- [ ] Implementar `main/tray.ts` con icono y menú [Settings, Quit]
- [ ] `main/hotkey.ts` registra `CommandOrControl+Shift+Space`
- [ ] Crear ventana de overlay (`frame: false, transparent: true, alwaysOnTop: true`)
- [ ] Al disparar hotkey, mostrar overlay con texto "🎤 Escuchando..." por 2s
- [ ] Ocultar `dock` en Mac (`app.dock.hide()`), `skipTaskbar: true` en ventanas
- [ ] Cerrar ventana ≠ cerrar app (queremos que viva en tray)

**Criterio de éxito:** en Windows y en Mac, abro Notepad/Notes, presiono el hotkey, aparece el overlay flotante centrado abajo. Cierro la ventana del overlay manualmente y la app sigue viva en tray.

**Commit:** `feat: tray icon, global hotkey, floating overlay`

---

## Fase 2 — Captura de audio ⏱ 6h

**Objetivo:** El hotkey graba audio del mic y guarda un WAV.

**Tareas:**
- [ ] En el renderer del overlay, usar `getUserMedia` para abrir el mic
- [ ] `MediaRecorder` graba mientras el hotkey está activo (toggle)
- [ ] Al parar, mandar el blob al main via IPC
- [ ] Main: convertir webm→wav 16kHz mono con `ffmpeg-static` y `fluent-ffmpeg`
- [ ] Guardar en `app.getPath('temp')/cleevoice-${ts}.wav`
- [ ] Log de ruta y duración

**Criterio de éxito:** dicto "uno dos tres prueba de audio", la app guarda un WAV reproducible que dice eso.

**Commit:** `feat: audio capture and wav conversion`

---

## Fase 3 — Whisper local ⏱ 12h

**Objetivo:** El WAV se transcribe automáticamente con whisper.cpp local.

**Tareas:**
- [ ] Compilar/descargar binarios `whisper-cli` para Mac (universal) y Windows (x64)
- [ ] Empaquetarlos en `resources/whisper/` con `extraResources` de electron-builder
- [ ] Script `scripts/download-model.js` baja `ggml-base.bin` al primer uso → `userData/models/`
- [ ] UI: barra de progreso para la descarga del modelo (~140MB)
- [ ] `main/whisper.ts` wrapper con `child_process.spawn`
- [ ] Después de grabar, transcribe y muestra el texto en el overlay por 3s
- [ ] Manejar errores (modelo no existe, binario falta, audio corrupto)

**Criterio de éxito:** dicto cinco frases en español de complejidad creciente, las cinco se transcriben con error razonable (>90% palabras correctas para frases comunes). Tiempo de procesamiento <3s para clips de 10s en Mac M1 / Win i5.

**Commit:** `feat: local whisper.cpp transcription`

---

## Fase 4 — Inyección de texto ⏱ 4h

**Objetivo:** El texto transcrito se pega automáticamente donde está el cursor.

**Tareas:**
- [ ] `main/paste.ts` — implementación por plataforma
- [ ] Mac: AppleScript via `child_process.exec`
- [ ] Win: `@nut-tree-fork/nut-js` para simular Ctrl+V
- [ ] Restaurar clipboard previo después de 1s
- [ ] Onboarding: pantalla pidiendo permiso de accesibilidad en Mac (con screenshot)
- [ ] Fallback: si la inyección falla, mostrar notificación "texto en portapapeles, presiona Ctrl+V"

**Criterio de éxito:** abro Gmail, Notepad, ChatGPT, VSCode. Dicto en cada uno. El texto aparece donde estaba el cursor. Sin perder el clipboard que tenía antes.

**Commit:** `feat: cross-platform text injection at cursor`

---

## Fase 5 — Settings UI ⏱ 8h

**Objetivo:** Ventana de configuración funcional.

**Tareas:**
- [ ] Ventana Settings (800x600), abre desde tray menu
- [ ] Tab "General": idioma, comportamiento al iniciar (autostart)
- [ ] Tab "Modelo": elegir tiny/base/small/medium, ver tamaño, descargar bajo demanda
- [ ] Tab "Atajos": cambiar hotkey con KeyCapture component
- [ ] Tab "Diccionario": agregar términos personalizados (Skool, GoHighLevel, Hormozi, JoinsClee, CLEE, MétodoCLEE, etc.)
- [ ] Persistir todo con `electron-store`
- [ ] Re-registrar hotkey al cambiarlo

**Criterio de éxito:** cambio el hotkey a `Cmd+Opt+D`, cierro Settings, presiono el nuevo hotkey en cualquier app → funciona. Reinicio la app → la config persiste.

**Commit:** `feat: settings window with hotkey, model, dictionary configuration`

---

## Fase 6 — Groq cloud fallback ⏱ 6h

**Objetivo:** Modo cloud con Groq como alternativa más rápida y precisa.

**Tareas:**
- [ ] Settings → tab "Cloud": campo para API key de Groq
- [ ] Cifrar la key con `safeStorage.encryptString` antes de guardar
- [ ] Toggle "Usar cloud en vez de local"
- [ ] `main/groq.ts` implementa llamada a `whisper-large-v3-turbo`
- [ ] Manejar errores de red, rate limit, key inválida
- [ ] Mostrar engine activo en el tray menu

**Criterio de éxito:** pego mi key de Groq, activo cloud, dicto. La transcripción tarda <1s (vs ~2s local) y la calidad es notablemente mejor en frases largas/complejas.

**Commit:** `feat: groq cloud transcription as alternative engine`

---

## Fase 7 — Limpieza con LLM ⏱ 6h

**Objetivo:** Texto transcrito pasa por Llama 3.3 para limpiar muletillas y formato.

**Tareas:**
- [ ] `main/llm-cleanup.ts` con prompt configurable
- [ ] Detectar app activa con `active-win` npm
- [ ] Construir contexto dinámico: "estás en Gmail" / "estás en Slack" / "estás en Cursor"
- [ ] Toggle en Settings: "Limpiar texto automáticamente"
- [ ] Settings → tab "Prompt personalizado": permitir editar el system prompt
- [ ] Prompt por defecto en español incluye instrucciones del Método CLEE para mantener consistencia con la voz del usuario

**Criterio de éxito:** dicto "eh este o sea quería decirte que la propuesta este la mando mañana". Con limpieza off: aparece tal cual. Con limpieza on: aparece "Quería decirte que la propuesta la mando mañana."

**Commit:** `feat: llm cleanup with groq llama 3.3 and app-aware context`

---

## Fase 8 — Historial y diccionario ⏱ 6h

**Objetivo:** Persistir transcripciones y aplicar diccionario personalizado.

**Tareas:**
- [ ] `main/db.ts` con better-sqlite3 y schema de `transcriptions`, `dictionary`
- [ ] Cada transcripción se guarda con: timestamp, app activa, texto raw, texto limpio, engine
- [ ] Settings → tab "Historial": lista buscable con copy/eliminar
- [ ] Diccionario: pre-cargar términos JoinsClee (`Skool`, `GoHighLevel`, `MétodoCLEE`, `Hormozi`, `Cialdini`, `Schwartz`, `JoinsClee`, `Cristhian`, etc.)
- [ ] Pasar diccionario a Whisper via flag `--prompt "Términos clave: Skool, GoHighLevel, ..."`
- [ ] Post-procesar: reemplazar variantes mal escuchadas con el término del diccionario

**Criterio de éxito:** dicto "voy a publicar esto en mi comunidad de skul gohailevel" → aparece "voy a publicar esto en mi comunidad de Skool GoHighLevel". El historial muestra mis últimas 50 transcripciones.

**Commit:** `feat: transcription history and custom dictionary with joinsclee terms`

---

## Fase 9 — Pulido y empaquetado ⏱ 12h

**Objetivo:** Instaladores firmados listos para distribuir.

**Tareas:**
- [ ] Auto-updater con `electron-updater` apuntando a release de GitHub
- [ ] Icono final de CleeVoice (16x16, 32x32, 256x256, 1024x1024)
- [ ] Splash/onboarding pulido con branding JoinsClee
- [ ] electron-builder: DMG firmado y notarizado para Mac (requiere Apple Developer ID, $99/año)
- [ ] electron-builder: NSIS para Windows (firma opcional)
- [ ] README público con instrucciones de instalación
- [ ] Landing simple en `cleevoice.joinsclee.com` (Vercel, Astro o HTML estático)
- [ ] Telemetría opt-in muy básica (instalaciones, errores) — Sentry tier gratis

**Criterio de éxito:** un usuario sin contexto descarga el DMG/EXE desde la landing, doble click, hace onboarding, dicta su primer texto en menos de 3 minutos.

**Commit:** `release: v1.0.0 — public installers for mac and windows`

---

## Resumen de tiempos

| Fase | Horas estimadas |
|---|---|
| 0. Setup | 4h |
| 1. Tray + Hotkey | 8h |
| 2. Audio | 6h |
| 3. Whisper local | 12h |
| 4. Inyección texto | 4h |
| 5. Settings UI | 8h |
| 6. Groq cloud | 6h |
| 7. LLM cleanup | 6h |
| 8. Historial + dict | 6h |
| 9. Empaquetado | 12h |
| **TOTAL** | **72h** |

A 6-7h productivas por día con Claude Code asistiendo = **~10-11 días hábiles**.

Forkeando OpenWhispr y rebrand = **~30-40h** = **5-6 días**.

---

## Backlog (post-v1, no entra en alcance inicial)

- Streaming transcription en tiempo real (palabra a palabra mientras hablas)
- Atajo por contexto: distinto hotkey según app activa
- Plantillas de prompts ("modo email", "modo Slack", "modo VSL CLEE")
- Integración directa con n8n para que CleeVoice dispare workflows post-transcripción
- Sincronización opcional de historial con Supabase del ecosistema JoinsClee
- Versión "Team" donde los miembros comparten diccionario y plantillas
- Modo "comandos": "compón un correo a Camilo diciéndole que..." → genera y pega un email completo, no solo transcripción
