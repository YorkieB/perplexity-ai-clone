import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface MusicTrack {
  id: string
  audioUrl: string
  title: string
  tags?: string
  duration?: number
  prompt: string
  createdAt: number
}

export interface MusicPlayerControl {
  showTrack: (track: MusicTrack) => void
  isOpen: () => boolean
  openPlayer: () => void
}

interface MusicPlayerContextValue {
  control: MusicPlayerControl | null
  register: (control: MusicPlayerControl) => void
  unregister: () => void
  tracks: MusicTrack[]
  addTrack: (track: MusicTrack) => void
  activeTrackId: string | null
  setActiveTrackId: (id: string | null) => void
  generating: boolean
  setGenerating: (on: boolean) => void
  generatingLabel: string
  setGeneratingLabel: (label: string) => void
}

const noop: MusicPlayerContextValue = {
  control: null,
  register: () => {},
  unregister: () => {},
  tracks: [],
  addTrack: () => {},
  activeTrackId: null,
  setActiveTrackId: () => {},
  generating: false,
  setGenerating: () => {},
  generatingLabel: '',
  setGeneratingLabel: () => {},
}

const MusicPlayerContext = createContext<MusicPlayerContextValue>(noop)

export function MusicPlayerProvider({ children }: { readonly children: ReactNode }) {
  const controlRef = useRef<MusicPlayerControl | null>(null)
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')

  const register = useCallback((ctrl: MusicPlayerControl) => { controlRef.current = ctrl }, [])
  const unregister = useCallback(() => { controlRef.current = null }, [])

  const addTrack = useCallback((track: MusicTrack) => {
    setTracks(prev => [...prev, track])
    setActiveTrackId(track.id)
  }, [])

  const value = useMemo<MusicPlayerContextValue>(() => ({
    get control() { return controlRef.current },
    register,
    unregister,
    tracks,
    addTrack,
    activeTrackId,
    setActiveTrackId,
    generating,
    setGenerating,
    generatingLabel,
    setGeneratingLabel,
  }), [register, unregister, tracks, addTrack, activeTrackId, generating, generatingLabel])

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayerRegister() {
  const { register, unregister } = useContext(MusicPlayerContext)
  return { register, unregister }
}

export function useMusicPlayer(): MusicPlayerControl | null {
  const { control } = useContext(MusicPlayerContext)
  return control
}

export function useMusicPlayerItems() {
  const { tracks, addTrack, activeTrackId, setActiveTrackId } = useContext(MusicPlayerContext)
  return { tracks, addTrack, activeTrackId, setActiveTrackId }
}

export function useMusicPlayerGenerating() {
  const { generating, setGenerating, generatingLabel, setGeneratingLabel } = useContext(MusicPlayerContext)
  return { generating, setGenerating, generatingLabel, setGeneratingLabel }
}
