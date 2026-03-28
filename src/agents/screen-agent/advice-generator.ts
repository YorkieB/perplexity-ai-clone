import type { ScreenState } from './types'

export class AdviceGenerator {
  constructor(private readonly _llmClient: unknown) {}

  async generate(_state: ScreenState): Promise<string | null> {
    return null
  }
}
