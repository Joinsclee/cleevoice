import { useEffect, useRef, useState } from 'react'

/**
 * Overlay flotante: 🎤 grabando → ⚙️ procesando → 📝 transcribiendo → ⌨️ pegando → ✓
 *
 * Estados (Fase 4):
 *   - idle / recording / processing / transcribing  (igual que Fase 3)
 *   - pasting:        breve "⌨️ Pegando…" mientras se hace Cmd+V sintético
 *   - pasted-ok:      "✓ Pegado" en verde durante 1.5s
 *   - pasted-fallback el texto a la vista + "presioná Cmd+V" — más tiempo
 *   - error:          rojo con mensaje
 */

type UiState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'transcribing'
  | 'pasting'
  | 'pasted-ok'
  | 'pasted-fallback'
  | 'error'

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ]
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m
    }
  }
  return ''
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function OverlayApp(): React.JSX.Element {
  const [uiState, setUiState] = useState<UiState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [resultText, setResultText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [pasteReason, setPasteReason] = useState<string | undefined>()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeRef = useRef<string>('')

  function clearTimer(): void {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function releaseStream(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function beginCapture(): Promise<void> {
    try {
      const mime = pickMimeType()
      if (!mime) {
        window.api.audioError('Ningún codec de audio soportado en este navegador')
        return
      }
      mimeRef.current = mime

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onerror = (e) => {
        window.api.audioError(`MediaRecorder error: ${String(e)}`)
      }
      recorder.onstop = async () => {
        clearTimer()
        releaseStream()
        setUiState('processing')

        try {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current })
          const buffer = await blob.arrayBuffer()
          await window.api.audioReady({ buffer, mimeType: mimeRef.current })
        } catch (err) {
          window.api.audioError(`Fallo enviando audio al main: ${String(err)}`)
        } finally {
          chunksRef.current = []
          recorderRef.current = null
        }
      }

      recorderRef.current = recorder
      recorder.start(250)
      startedAtRef.current = performance.now()
      setUiState('recording')
      setElapsedMs(0)
      setResultText('')
      setErrorMsg('')
      setPasteReason(undefined)
      clearTimer()
      timerRef.current = setInterval(() => {
        setElapsedMs(performance.now() - startedAtRef.current)
      }, 100)
    } catch (err) {
      window.api.audioError(`No se pudo acceder al micrófono: ${String(err)}`)
      setUiState('idle')
    }
  }

  function endCapture(): void {
    const rec = recorderRef.current
    if (!rec) {
      setUiState('idle')
      return
    }
    if (rec.state !== 'inactive') rec.stop()
  }

  useEffect(() => {
    if (!window.api) return

    const offToggle = window.api.onToggleRecording((p) => {
      if (!p.active && uiState === 'recording') endCapture()
    })

    const offStart = window.api.onStartRecording(() => {
      void beginCapture()
    })

    const offStop = window.api.onStopRecording(() => {
      endCapture()
    })

    const offTranscribing = window.api.onTranscribingStarted(() => {
      setUiState('transcribing')
    })

    const offTranscribed = window.api.onTranscribed((payload) => {
      setResultText(payload.text)
    })

    const offError = window.api.onTranscribeError((message) => {
      setErrorMsg(message)
      setUiState('error')
      setElapsedMs(0)
    })

    const offPasting = window.api.onPastingStarted(() => {
      setUiState('pasting')
    })

    const offPasted = window.api.onPasted(({ ok, reason }) => {
      setPasteReason(reason)
      setUiState(ok ? 'pasted-ok' : 'pasted-fallback')
    })

    return () => {
      offToggle()
      offStart()
      offStop()
      offTranscribing()
      offTranscribed()
      offError()
      offPasting()
      offPasted()
      clearTimer()
      releaseStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recording = uiState === 'recording'
  const processing = uiState === 'processing'
  const transcribing = uiState === 'transcribing'
  const pasting = uiState === 'pasting'
  const pastedOk = uiState === 'pasted-ok'
  const pastedFallback = uiState === 'pasted-fallback'
  const showError = uiState === 'error'

  let label: string
  if (recording) label = `🎤 Grabando ${formatTime(elapsedMs)}`
  else if (processing) label = '⚙️ Procesando audio…'
  else if (transcribing) label = '📝 Transcribiendo…'
  else if (pasting) label = '⌨️ Pegando…'
  else if (pastedOk) label = '✓ Pegado'
  else if (pastedFallback) {
    const tip =
      pasteReason === 'no-accessibility'
        ? 'Activá Accesibilidad → Cmd+V para pegar'
        : 'Texto en portapapeles · Cmd+V para pegar'
    label = `${tip}  ·  "${resultText}"`
  } else if (showError) label = `⚠️ ${errorMsg}`
  else label = 'CleeVoice'

  const dotClass = recording
    ? 'bg-red-500'
    : processing
      ? 'bg-amber-400'
      : transcribing
        ? 'bg-violet-400'
        : pasting
          ? 'bg-sky-400'
          : pastedOk
            ? 'bg-emerald-400'
            : pastedFallback
              ? 'bg-yellow-400'
              : showError
                ? 'bg-red-400'
                : 'bg-neutral-500'

  const haloClass = recording
    ? 'bg-red-400'
    : processing
      ? 'bg-amber-400'
      : transcribing
        ? 'bg-violet-400'
        : pasting
          ? 'bg-sky-400'
          : ''

  const borderClass = recording
    ? 'border-red-500/30'
    : processing
      ? 'border-amber-400/30'
      : transcribing
        ? 'border-violet-400/30'
        : pasting
          ? 'border-sky-400/30'
          : pastedOk
            ? 'border-emerald-400/40'
            : pastedFallback
              ? 'border-yellow-400/40'
              : showError
                ? 'border-red-400/40'
                : 'border-white/10'

  const opacityScaleClass =
    uiState === 'idle' ? 'scale-95 opacity-80' : 'scale-100 opacity-100'

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-3">
      <div
        className={`flex max-w-full items-center gap-3 rounded-2xl border bg-neutral-900/85 px-5 py-3 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 ${borderClass} ${opacityScaleClass}`}
      >
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
          {haloClass && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${haloClass}`}
            />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
        </span>
        <span
          className={
            'text-sm font-medium tabular-nums tracking-wide ' +
            (pastedFallback ? 'line-clamp-2 text-left leading-snug' : '')
          }
          title={pastedFallback || pastedOk ? resultText : undefined}
        >
          {label}
        </span>
        {/*
          No agregamos botón aquí: el overlay tiene setIgnoreMouseEvents(true)
          (click-through para no robar foco). El main abre el panel de
          Accesibilidad automáticamente la primera vez que falta el permiso.
        */}
      </div>
    </div>
  )
}
