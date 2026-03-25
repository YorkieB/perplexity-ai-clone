import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface MediaItem {
  id: string
  type: 'image' | 'video'
  dataUrl: string
  prompt?: string
  timestamp: number
}

export interface MediaCanvasControl {
  showImage: (base64DataUrl: string, prompt?: string) => void
  showVideo: (blobUrl: string, prompt?: string) => void
  applyEdit: (editedBase64: string) => void
  getCurrentImageBase64: () => string | null
  isOpen: () => boolean
  openCanvas: () => void
}

export interface MediaCanvasFilters {
  contrast: number
  brightness: number
  saturation: number
}

interface MediaCanvasContextValue {
  control: MediaCanvasControl | null
  register: (control: MediaCanvasControl) => void
  unregister: () => void
  items: MediaItem[]
  addItem: (item: MediaItem) => void
  activeItemId: string | null
  setActiveItemId: (id: string | null) => void
  generating: boolean
  setGenerating: (on: boolean) => void
  generatingLabel: string
  setGeneratingLabel: (label: string) => void
}

const noop: MediaCanvasContextValue = {
  control: null,
  register: () => {},
  unregister: () => {},
  items: [],
  addItem: () => {},
  activeItemId: null,
  setActiveItemId: () => {},
  generating: false,
  setGenerating: () => {},
  generatingLabel: '',
  setGeneratingLabel: () => {},
}

const MediaCanvasContext = createContext<MediaCanvasContextValue>(noop)

export function MediaCanvasProvider({ children }: { readonly children: ReactNode }) {
  const controlRef = useRef<MediaCanvasControl | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')

  const register = useCallback((ctrl: MediaCanvasControl) => {
    controlRef.current = ctrl
  }, [])

  const unregister = useCallback(() => {
    controlRef.current = null
  }, [])

  const addItem = useCallback((item: MediaItem) => {
    setItems(prev => [...prev, item])
    setActiveItemId(item.id)
  }, [])

  const value = useMemo<MediaCanvasContextValue>(() => ({
    get control() { return controlRef.current },
    register,
    unregister,
    items,
    addItem,
    activeItemId,
    setActiveItemId,
    generating,
    setGenerating,
    generatingLabel,
    setGeneratingLabel,
  }), [register, unregister, items, addItem, activeItemId, generating, generatingLabel])

  return (
    <MediaCanvasContext.Provider value={value}>
      {children}
    </MediaCanvasContext.Provider>
  )
}

export function useMediaCanvasRegister() {
  const { register, unregister } = useContext(MediaCanvasContext)
  return { register, unregister }
}

export function useMediaCanvas(): MediaCanvasControl | null {
  const { control } = useContext(MediaCanvasContext)
  return control
}

export function useMediaCanvasItems() {
  const { items, addItem, activeItemId, setActiveItemId } = useContext(MediaCanvasContext)
  return { items, addItem, activeItemId, setActiveItemId }
}

export function useMediaCanvasGenerating() {
  const { generating, setGenerating, generatingLabel, setGeneratingLabel } = useContext(MediaCanvasContext)
  return { generating, setGenerating, generatingLabel, setGeneratingLabel }
}
