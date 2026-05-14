import { useEffect, useRef, useState } from 'react'

/**
 * Overlay flotante "🎤 Grabando…" → "⚙️ Transcribiendo…" → texto final.
 *
 * Estados visuales (Fase 3):
 *   - idle:         label "CleeVoice", overlay casi invisible
 *   - recording:    label "🎤 Grabando mm:ss", punto rojo pulsando
 *   - processing:   label "⚙️ Procesando…", punto ámbar pulsando
 *   - transcribing: label "📝 Transcribiendo…", punto violeta pulsando
 *   - result:       muestra el texto transcrito (con scroll si es largo)
 */

type UiState = 'idle' | 'recording' | 'processing' | 'transcribing' | 'result' | 'error'

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
          // No reseteamos a 'idle' acá: el main decide el siguiente estado
          // (transcribing → result/error → idle).
        }
      }

      recorderRef.current = recorder
      recorder.start(250)
      startedAtRef.current = performance.now()
      setUiState('recording')
      setElapsedMs(0)
      setResultText('')
      setErrorMsg('')
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
    if (rec.state !== 'inactive') {
      rec.stop()
    }
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
      setUiState('result')
      setElapsedMs(0)
    })

    const offError = window.api.onTranscribeError((message) => {
      setErrorMsg(message)
      setUiState('error')
      setElapsedMs(0)
    })

    return () => {
      offToggle()
      offStart()
      offStop()
      offTranscribing()
      offTranscribed()
      offError()
      clearTimer()
      releaseStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recording = uiState === 'recording'
  const processing = uiState === 'processing'
  const transcribing = uiState === 'transcribing'
  const showResult = uiState === 'result'
  const showError = uiState === 'error'

  let label: string
  if (recording) label = `🎤 Grabando ${formatTime(elapsedMs)}`
  else if (processing) label = '⚙️ Procesando audio…'
  else if (transcribing) label = '📝 Transcribiendo…'
  else if (showResult) label = resultText || '(sin texto detectado)'
  else if (showError) label = `⚠️ ${errorMsg}`
  else label = 'CleeVoice'

  const dotClass = recording
    ? 'bg-red-500'
    : processing
      ? 'bg-amber-400'
      : transcribing
        ? 'bg-violet-400'
        : showError
          ? 'bg-red-400'
          : showResult
            ? 'bg-emerald-400'
            : 'bg-neutral-500'

  const haloClass = recording
    ? 'bg-red-400'
    : processing
      ? 'bg-amber-400'
      : transcribing
        ? 'bg-violet-400'
        : ''

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-3">
      <div
        className={
          'flex max-w-full items-center gap-3 rounded-2xl border px-5 py-3 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 ' +
          (recording
            ? 'scale-100 border-red-500/30 bg-neutral-900/85 opacity-100'
            : processing
              ? 'scale-100 border-amber-400/30 bg-neutral-900/85 opacity-100'
              : transcribing
                ? 'scale-100 border-violet-400/30 bg-neutral-900/85 opacity-100'
                : showResult
                  ? 'scale-100 border-emerald-400/30 bg-neutral-900/90 opacity-100'
                  : showError
                    ? 'scale-100 border-red-400/40 bg-neutral-900/90 opacity-100'
                    : 'scale-95 border-white/10 bg-neutral-900/70 opacity-80')
        }
      >
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
          {haloClass && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${haloClass}`} />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
        </span>
        <span
          className={
            'text-sm font-medium tabular-nums tracking-wide ' +
            (showResult ? 'line-clamp-2 text-left leading-snug' : '')
          }
          title={showResult ? resultText : undefined}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
