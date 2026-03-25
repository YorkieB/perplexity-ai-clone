import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'

export interface TuneInControl {
  searchAndPlay: (query: string) => Promise<{ success: boolean; stationName?: string; error?: string }>
  pause: () => void
  resume: () => void
  getStatus: () => { playing: boolean; stationName?: string; nowPlaying?: string }
  /** Lower radio volume so Jarvis can be heard over music. */
  duck: () => void
  /** Restore radio volume to normal after Jarvis finishes speaking. */
  unduck: () => void
}

interface TuneInControlContextValue {
  control: TuneInControl | null
  register: (control: TuneInControl) => void
  unregister: () => void
}

const noop: TuneInControlContextValue = {
  control: null,
  register: () => {},
  unregister: () => {},
}

const TuneInControlContext = createContext<TuneInControlContextValue>(noop)

export function TuneInControlProvider({ children }: { readonly children: ReactNode }) {
  const controlRef = useRef<TuneInControl | null>(null)

  const register = useCallback((ctrl: TuneInControl) => {
    controlRef.current = ctrl
  }, [])

  const unregister = useCallback(() => {
    controlRef.current = null
  }, [])

  const value = useMemo<TuneInControlContextValue>(() => ({
    get control() { return controlRef.current },
    register,
    unregister,
  }), [register, unregister])

  return (
    <TuneInControlContext.Provider value={value}>
      {children}
    </TuneInControlContext.Provider>
  )
}

/** Used by TuneInModuleCard to register its control functions. */
export function useTuneInControlRegister() {
  const { register, unregister } = useContext(TuneInControlContext)
  return { register, unregister }
}

/** Used by VoiceMode / useRealtimeVoice to access TuneIn controls. */
export function useTuneInControl(): TuneInControl | null {
  const { control } = useContext(TuneInControlContext)
  return control
}
