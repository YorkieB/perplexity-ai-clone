/** Renderer-only: whether the Voice Mode overlay is open (for gating proactive TTS, etc.). */

let voiceModeOpen = false

export function setRendererVoiceModeOpen(open: boolean): void {
  voiceModeOpen = open
}

export function isRendererVoiceModeOpen(): boolean {
  return voiceModeOpen
}
