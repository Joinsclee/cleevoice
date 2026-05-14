import { useEffect, useRef, useState } from 'react'

/**
 * Overlay flotante "🎤 Grabando…".
 *
 * Fase 2: el main controla los comandos start-recording / stop-recording.
 * Este componente:
 *   - Abre el micrófono con getUserMedia al recibir 'start-recording'.
 *   - Graba con MediaRecorder (webm/opus).
 *   - Al recibir 'stop-recording' detiene, junta chunks y manda el ArrayBuffer
 *     al main vía audioReady() para que lo convierta a WAV.
 *   - Mantiene un timer mm:ss y un estado visual idle/recording/processing.
 */

type UiState = 'idle' | 'recording' | 'processing'

function pickMimeType(): string {
  // Preferimos opus que es lo que mejor consume whisper.cpp tras la conversión.
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
          setElapsedMs(0)
          setUiState('idle')
        }
      }

      recorderRef.current = recorder
      // Pedimos chunks de 250ms para que onstop tenga el último intervalo listo.
      recorder.start(250)
      startedAtRef.current = performance.now()
      setUiState('recording')
      setElapsedMs(0)
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
      // El toggle es informativo (sincroniza UI si el main decide cambiar estado
      // sin pasar por start/stop explícitos). Los comandos reales viajan abajo.
      if (!p.active && uiState === 'recording') {
        endCapture()
      }
    })

    const offStart = window.api.onStartRecording(() => {
      void beginCapture()
    })

    const offStop = window.api.onStopRecording(() => {
      endCapture()
    })

    return () => {
      offToggle()
      offStart()
      offStop()
      clearTimer()
      releaseStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recording = uiState === 'recording'
  const processing = uiState === 'processing'
  const label = recording
    ? `🎤 Grabando ${formatTime(elapsedMs)}`
    : processing
      ? '⚙️ Procesando…'
      : 'CleeVoice'

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <div
        className={
          'flex items-center gap-3 rounded-2xl border px-5 py-3 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 ' +
          (recording
            ? 'scale-100 border-red-500/30 bg-neutral-900/85 opacity-100'
            : processing
              ? 'scale-100 border-amber-400/30 bg-neutral-900/85 opacity-100'
              : 'scale-95 border-white/10 bg-neutral-900/70 opacity-80')
        }
      >
        <span className="relative inline-flex h-2.5 w-2.5">
          {recording && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          )}
          {processing && (
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-amber-400 opacity-75" />
          )}
          <span
            className={
              'relative inline-flex h-2.5 w-2.5 rounded-full ' +
              (recording
                ? 'bg-red-500'
                : processing
                  ? 'bg-amber-400'
                  : 'bg-neutral-500')
            }
          />
        </span>
        <span className="text-sm font-medium tabular-nums tracking-wide">{label}</span>
      </div>
    </div>
  )
}
