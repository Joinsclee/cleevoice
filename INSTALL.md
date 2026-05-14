# Instalación de CleeVoice — Equipo JoinsClee

Esta es la guía corta para que cualquier persona del equipo instale CleeVoice en su Mac o Windows y empiece a dictar en menos de 5 minutos.

---

## macOS (Apple Silicon — M1, M2, M3, M4)

> **Importante:** esta build es **solo para Mac con chip Apple Silicon**. Si tenés un Mac Intel, avisanos para que generemos otra build.

### 1. Descargar e instalar

1. Bajá el archivo `CleeVoice-0.1.0-arm64.dmg` que te compartió Cristhian.
2. Doble click en el DMG → arrastrá **CleeVoice** dentro de la carpeta **Applications**.
3. Ejectá el DMG.

### 2. Primera apertura (importante)

Como esta app no está firmada con un Apple Developer ID (la firma cuesta $99/año, no la usamos para distribución interna), macOS la va a bloquear la primera vez con un mensaje tipo *"no se puede verificar el desarrollador"*.

**Para abrirla:**

- **Opción A (más fácil):** click derecho sobre `CleeVoice.app` en `/Applications` → **"Abrir"** → en el diálogo "no se pudo verificar", click en **"Abrir"** otra vez. Solo hay que hacerlo la primera vez.
- **Opción B (si "Abrir" no aparece):** abrí Preferencias del Sistema → Privacidad y seguridad → bajá hasta abajo, vas a ver *"CleeVoice fue bloqueada"* → click **"Abrir igualmente"**.

### 3. Permisos macOS (vienen en orden cuando la usás por primera vez)

CleeVoice pide **dos permisos** del sistema:

1. **Micrófono** — cuando dictes por primera vez. Aceptá el diálogo.
2. **Accesibilidad** — necesario para que el texto se pegue automáticamente donde está tu cursor. macOS te va a mostrar un panel cuando lo necesite. Activá el toggle de **CleeVoice** en Preferencias del Sistema → Privacidad y seguridad → Accesibilidad.

Si saltás el de accesibilidad, igual funciona: el texto queda en el portapapeles y vos hacés `Cmd+V` manual. El overlay te lo recuerda.

### 4. Empezar a dictar

- CleeVoice vive en la **menubar** (esquina superior derecha, junto a la hora). NO aparece en el Dock — eso es intencional.
- **Hotkey por defecto:** `⌘ + Shift + Espacio`
- Estando en cualquier app (Gmail, Slack, Notion, Skool, GoHighLevel…), presioná el hotkey → habla → presionalo de nuevo → el texto aparece pegado donde estabas escribiendo.

### 5. Primer arranque: descarga del modelo

La primera vez que dictes, CleeVoice baja **`ggml-small.bin` (~460MB)** desde Hugging Face. Esto pasa una sola vez. Mientras baja, vas a ver una notificación "CleeVoice: descargando modelo". Esperá 1-2 minutos según tu conexión.

Después de eso, **todo es local** — el audio nunca sale de tu Mac. Privado y gratis.

---

## Windows 10/11 (x64)

### 1. Descargar e instalar

1. Bajá `CleeVoice-0.1.0-x64.exe`.
2. Doble click → SmartScreen va a mostrar *"Windows protegió tu PC"* → click en **"Más información"** → **"Ejecutar de todas formas"**. Esto es porque el .exe no está firmado con un certificado de code-signing (idem caso Mac).
3. El instalador te deja elegir directorio. Cuando termine, marcá *"Crear acceso directo en escritorio"* si querés.

### 2. Permisos

Windows no tiene permiso de accesibilidad como macOS. Sí te va a pedir **acceso al micrófono** la primera vez (un toast en la esquina inferior derecha). Aceptá.

### 3. Empezar a dictar

- El ícono aparece en la **bandeja del sistema** (junto al reloj).
- **Hotkey por defecto:** `Ctrl + Shift + Espacio`
- Misma lógica que Mac.

### 4. Primer arranque: descarga del modelo

Idem Mac — la primera vez se baja el modelo `ggml-small.bin` (~460MB) a `%APPDATA%\cleevoice\models\`.

---

## Configurarla (opcional pero recomendado)

Click en el ícono → **Settings** → tenés 7 pestañas:

| Pestaña | Para qué |
|---|---|
| **General** | Idioma de transcripción, autostart, notificaciones |
| **Modelo** | Cambiar entre tiny/base/small/medium. Default es `small` que da buen balance velocidad/calidad para español |
| **Cloud** | (Opcional) Pegá una API key de Groq gratis para tener cloud engine — ~3× más rápido y aún mejor calidad que local |
| **Limpieza IA** | Activa para que Llama 3.3 le quite muletillas al texto antes de pegarlo. Requiere Cloud key configurado |
| **Atajos** | Cambiar el hotkey si choca con otra cosa |
| **Diccionario** | Términos que CleeVoice respeta con su capitalización (Skool, JoinsClee, GoHighLevel, MétodoCLEE, etc — ya vienen precargados) |
| **Historial** | Todas tus transcripciones quedan acá. Buscador full-text + stats de tiempo ahorrado |

### Cómo obtener una API key de Groq (gratis)

1. Andá a [console.groq.com/keys](https://console.groq.com/keys)
2. Creá una cuenta (login con Google está OK)
3. **Create API Key** → copiala
4. Pegala en CleeVoice → Settings → Cloud → Probar → Guardar

Limite gratis: ~14,400 segundos de audio por día (suficiente para uso normal). Si lo superás, vuelve a engine local automáticamente.

---

## Troubleshooting

| Síntoma | Solución |
|---|---|
| No veo el ícono en la menubar | Es muy chiquito (16px). Mirá bien junto a la hora. Si tu Mac tiene notch + muchos íconos, podés moverlos con `⌘+drag` |
| Dicto pero no aparece texto | Revisá permiso de Accesibilidad (Mac) o del Micrófono. Settings de CleeVoice → tab Historial — si está guardado pero no pegó, es accesibilidad |
| Hotkey no responde | Otra app puede estar capturándolo. Settings → Atajos → probá `Ctrl+Alt+D` u otra combinación |
| Quiero pasar más rápido | Activá Cloud (Groq) en Settings — tarda ~1s en vez de ~2s y la calidad es notablemente mejor |
| Whisper escucha mal mis términos | Settings → Diccionario → agregá los nombres/términos que mencionás seguido |

---

## Reportar problemas

Cualquier bug, mandale screenshot + descripción a Cristhian. Los logs detallados están en:

- **macOS:** `~/Library/Logs/cleevoice/main.log`
- **Windows:** `%APPDATA%\cleevoice\logs\main.log`
