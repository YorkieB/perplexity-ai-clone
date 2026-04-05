import { useEffect, useCallback } from 'react'
import { XIcon, HandWavingIcon, VideoCameraIcon, MicrophoneIcon, MicrophoneSlashIcon } from '@phosphor-icons/react'
import { useRealtimeVoice, VoicePipelineState } from '@/hooks/useRealtimeVoice'
import { useVision } from '@/hooks/useVision'
import { useTuneInControl } from '@/contexts/TuneInControlContext'
import { useBrowserControl, useBrowserGuideMode, useBrowserAutomating, useBrowserAgentSteps } from '@/contexts/BrowserControlContext'
import { useMediaCanvas, useMediaCanvasGenerating } from '@/contexts/MediaCanvasContext'
import { useCodeEditor } from '@/contexts/useCodeEditorHooks'
import { useMusicPlayer, useMusicPlayerGenerating } from '@/contexts/MusicPlayerContext'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { UserSettings } from '@/lib/types'
import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import { cn } from '@/lib/utils'
import { setRendererVoiceModeOpen } from '@/lib/voice-mode-ui'

interface VoiceModeProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onResponse?: (userText: string, aiText: string) => void
}

export function VoiceMode({ open, onClose, onResponse }: VoiceModeProps) {
  const { context: visionCtx } = useVision(open)
  const tuneInControl = useTuneInControl()
  const browserControl = useBrowserControl()
  const { guideMode: browserGuideMode } = useBrowserGuideMode()
  const { setAutomating } = useBrowserAutomating()
  const { addAgentStep, clearAgentSteps } = useBrowserAgentSteps()
  const mediaCanvasControl = useMediaCanvas()
  const { setGenerating: setMediaGenerating, setGeneratingLabel: setMediaGeneratingLabel } = useMediaCanvasGenerating()
  const codeEditorControl = useCodeEditor()
  const musicPlayerControl = useMusicPlayer()
  const { setGenerating: setMusicGenerating, setGeneratingLabel: setMusicGeneratingLabel } = useMusicPlayerGenerating()
  const [settings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)

  const pipeline = useRealtimeVoice({
    onResponse,
    ttsProvider: 'elevenlabs',
    visionContext: visionCtx,
    tuneInControl,
    browserControl,
    browserGuideMode,
    onBrowserAutomating: (on) => { if (on) { clearAgentSteps() } setAutomating(on) },
    onBrowserStep: (step) => { addAgentStep(step) },
    mediaCanvasControl,
    onMediaGenerating: setMediaGenerating,
    onMediaGeneratingLabel: setMediaGeneratingLabel,
    codeEditorControl,
    musicPlayerControl,
    onMusicGenerating: setMusicGenerating,
    onMusicGeneratingLabel: setMusicGeneratingLabel,
    voiceRegistry: settings?.voiceRegistry ?? null,
    enableVoiceAnalysis: settings?.enableVoiceAnalysis ?? false,
    userSettings: settings,
  })

  const handleBargeIn = useCallback(() => {
    pipeline.bargeIn()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.bargeIn])

  useEffect(() => {
    setRendererVoiceModeOpen(open)
    const ipc = typeof window !== 'undefined' ? window.electronAPI?.setVoiceModeActive : undefined
    if (typeof ipc === 'function') {
      ipc(open).catch(() => {})
    }
    if (open) {
      pipeline.open()
    } else {
      pipeline.close()
    }
    return () => {
      setRendererVoiceModeOpen(false)
      if (typeof ipc === 'function') {
        ipc(false).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      globalThis.addEventListener('keydown', handleKeyDown)
      return () => globalThis.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  // Duck radio volume while Jarvis is speaking, restore when done
  useEffect(() => {
    if (!tuneInControl) return
    if (pipeline.state === 'speaking') {
      tuneInControl.duck()
    } else {
      tuneInControl.unduck()
    }
  }, [pipeline.state, tuneInControl])

  // Ensure volume is restored when Voice Mode closes
  useEffect(() => {
    if (!open && tuneInControl) {
      tuneInControl.unduck()
    }
  }, [open, tuneInControl])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center voice-mode-backdrop">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close voice mode"
      >
        <XIcon size={24} />
      </button>

      {/* Vision status indicator */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
        <VideoCameraIcon size={16} className={visionCtx.connected ? 'text-white/60' : 'text-white/20'} />
        <span className={cn(
          'w-2 h-2 rounded-full',
          visionStatusClass(visionCtx),
        )} />
        {visionCtx.cameraConnected && visionCtx.facesRecognized > 0 && (
          <span className="text-white/40 text-xs">{visionCtx.facesRecognized} face{visionCtx.facesRecognized === 1 ? '' : 's'}</span>
        )}
      </div>

      {/* State label */}
      <p className="absolute top-8 left-1/2 -translate-x-1/2 z-10 text-white/50 text-xs uppercase tracking-widest select-none">
        {stateLabel(pipeline.state)}
      </p>

      {/* Orb */}
      <div className="relative flex items-center justify-center mb-10">
        <Orb state={pipeline.state} onClick={pipeline.state === 'speaking' ? handleBargeIn : undefined} />
      </div>

      {/* Transcript / response text area */}
      <div className="w-full max-w-lg px-8 flex flex-col items-center gap-4 min-h-[120px]">
        {(pipeline.interimTranscript || pipeline.transcript) && pipeline.state === 'listening' && (
          <div className="text-center">
            {pipeline.transcript && (
              <p className="text-white/80 text-base">{pipeline.transcript}</p>
            )}
            {pipeline.interimTranscript && (
              <p className="text-white/40 text-base italic">{pipeline.interimTranscript}</p>
            )}
          </div>
        )}

        {(pipeline.state === 'thinking' || pipeline.state === 'speaking') && pipeline.aiText && (
          <p className="text-white/90 text-base text-center leading-relaxed max-h-40 overflow-y-auto">
            {pipeline.aiText}
          </p>
        )}

        {pipeline.state === 'speaking' && (
          <button
            onClick={handleBargeIn}
            className="flex items-center gap-2 mt-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-sm transition-all"
          >
            <HandWavingIcon size={16} />
            <span>Tap to interrupt</span>
          </button>
        )}

        {pipeline.errorMessage && (
          <p className="text-red-400 text-sm text-center">{pipeline.errorMessage}</p>
        )}

        {!pipeline.isSupported && (
          <p className="text-amber-400 text-sm text-center">
            Voice requires microphone access and MediaRecorder support.
          </p>
        )}
      </div>

      {/* Mic mute toggle */}
      <button
        onClick={pipeline.toggleMicMute}
        className={cn(
          'absolute bottom-6 left-6 z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all',
          pipeline.micMuted
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
        )}
        aria-label={pipeline.micMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {pipeline.micMuted ? <MicrophoneSlashIcon size={18} /> : <MicrophoneIcon size={18} />}
        <span>{pipeline.micMuted ? 'Muted' : 'Mic on'}</span>
      </button>

      {/* Bottom hint */}
      <p className="absolute bottom-8 text-white/30 text-xs select-none">
        {bottomHint(pipeline.state)}
      </p>

      <style>{`
        .voice-mode-backdrop {
          background: radial-gradient(ellipse at center, #0d0d1a 0%, #000008 100%);
        }

        /* ── Orb animations ── */
        @keyframes orb-idle-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%       { transform: scale(1.04); opacity: 1; }
        }
        @keyframes orb-listen-ripple {
          0%   { transform: scale(1); opacity: 0.9; }
          50%  { transform: scale(1.12); opacity: 0.6; }
          100% { transform: scale(1); opacity: 0.9; }
        }
        @keyframes orb-think-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes orb-speak-wave {
          0%, 100% { transform: scaleY(1); }
          25%      { transform: scaleY(1.18); }
          75%      { transform: scaleY(0.85); }
        }
        @keyframes ripple-out {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ─── Orb ─────────────────────────────────────────────────────────────────────

function Orb({ state, onClick }: Readonly<{ state: VoicePipelineState; onClick?: () => void }>) {
  const rippleColor = state === 'listening' ? 'rgba(99,102,241,' : 'rgba(16,185,129,'
  const rippleDelays = ['0s', '0.6s', '1.2s'] as const
  const rippleOpacities = [0.4, 0.3, 0.2] as const

  const content = (
    <>
      {(state === 'listening' || state === 'speaking') &&
        rippleDelays.map((delay, i) => (
          <span
            key={delay}
            className="absolute inset-0 rounded-full"
            style={{
              animation: `ripple-out 1.8s ease-out ${delay} infinite`,
              backgroundColor: `${rippleColor}${rippleOpacities[i]})`,
            }}
          />
        ))}

      <div
        className="relative z-10 rounded-full flex items-center justify-center"
        style={{
          width: 128,
          height: 128,
          background: orbGradient(state),
          boxShadow: orbGlow(state),
          animation: orbAnimation(state),
        }}
      >
        {state === 'thinking' && <ThinkingRing />}
        {state === 'speaking' && <WaveformBars />}
        {state === 'listening' && <MicDot />}
        {state === 'idle' && <IdleDot />}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className="relative cursor-pointer bg-transparent border-none p-0" onClick={onClick} aria-label="Interrupt">
        {content}
      </button>
    )
  }

  return <div className="relative">{content}</div>
}

function ThinkingRing() {
  return (
    <div
      className="w-16 h-16 rounded-full border-2 border-transparent"
      style={{
        borderTopColor: 'rgba(255,255,255,0.9)',
        borderRightColor: 'rgba(255,255,255,0.3)',
        animation: 'orb-think-spin 1s linear infinite',
      }}
    />
  )
}

const WAVEFORM_BARS = [
  { id: 'w0', scale: 0.6 },
  { id: 'w1', scale: 1 },
  { id: 'w2', scale: 0.75 },
  { id: 'w3', scale: 1.15 },
  { id: 'w4', scale: 0.8 },
  { id: 'w5', scale: 1 },
  { id: 'w6', scale: 0.55 },
] as const

function WaveformBars() {
  return (
    <div className="flex items-center gap-1">
      {WAVEFORM_BARS.map((bar, i) => (
        <div
          key={bar.id}
          className="w-1 rounded-full bg-white"
          style={{
            height: 20,
            animation: `orb-speak-wave ${0.5 + i * 0.07}s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
            transformOrigin: 'center',
            transform: `scaleY(${bar.scale})`,
          }}
        />
      ))}
    </div>
  )
}

function MicDot() {
  return <div className="w-5 h-5 rounded-full bg-white/90" />
}

function IdleDot() {
  return (
    <div
      className="w-5 h-5 rounded-full bg-white/60"
      style={{ animation: 'orb-idle-pulse 3s ease-in-out infinite' }}
    />
  )
}

// ─── State helpers ────────────────────────────────────────────────────────────

function visionStatusClass(ctx: { cameraConnected: boolean; connected: boolean }): string {
  if (ctx.cameraConnected) return 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
  if (ctx.connected) return 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
  return 'bg-white/20'
}

function bottomHint(state: VoicePipelineState): string {
  switch (state) {
    case 'listening': return 'Speak now…'
    case 'thinking':  return 'Thinking…'
    case 'speaking':  return 'AI is speaking'
    default:          return ''
  }
}

function stateLabel(state: VoicePipelineState): string {
  switch (state) {
    case 'listening': return 'Listening'
    case 'thinking':  return 'Processing'
    case 'speaking':  return 'Speaking'
    default:          return 'Voice'
  }
}

function orbGradient(state: VoicePipelineState): string {
  switch (state) {
    case 'listening':
      return 'radial-gradient(circle at 35% 35%, #818cf8, #4f46e5 60%, #312e81)'
    case 'thinking':
      return 'radial-gradient(circle at 35% 35%, #a78bfa, #7c3aed 60%, #3b0764)'
    case 'speaking':
      return 'radial-gradient(circle at 35% 35%, #6ee7b7, #059669 60%, #064e3b)'
    default:
      return 'radial-gradient(circle at 35% 35%, #475569, #1e293b 60%, #0f172a)'
  }
}

function orbGlow(state: VoicePipelineState): string {
  switch (state) {
    case 'listening':
      return '0 0 40px 12px rgba(99,102,241,0.5), 0 0 80px 24px rgba(99,102,241,0.2)'
    case 'thinking':
      return '0 0 40px 12px rgba(139,92,246,0.5), 0 0 80px 24px rgba(139,92,246,0.2)'
    case 'speaking':
      return '0 0 40px 12px rgba(16,185,129,0.5), 0 0 80px 24px rgba(16,185,129,0.2)'
    default:
      return '0 0 20px 4px rgba(100,116,139,0.2)'
  }
}

function orbAnimation(state: VoicePipelineState): string {
  switch (state) {
    case 'listening': return 'orb-listen-ripple 1.4s ease-in-out infinite'
    case 'thinking':  return 'none'
    case 'speaking':  return 'orb-listen-ripple 0.8s ease-in-out infinite'
    default:          return 'orb-idle-pulse 3s ease-in-out infinite'
  }
}
