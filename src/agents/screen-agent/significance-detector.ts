import type { ScreenState, SignificanceResult } from './types'

export class SignificanceDetector {
  detect(_curr: ScreenState, _prev: ScreenState | null): SignificanceResult {
    return { score: 0, reason: '', shouldSpeak: false }
  }

  private isOnCooldown(_reason: string): boolean {
    return false
  }

  private resetCooldown(_reason: string): void {
    /* stub */
  }
}
