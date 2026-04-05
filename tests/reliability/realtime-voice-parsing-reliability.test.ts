import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  parseRealtimeVoiceToolArgs,
  parseRealtimeVoiceWsMessage,
} from '../../src/hooks/useRealtimeVoice'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('realtime voice parsing degraded-path telemetry', () => {
  it('warns and returns empty args when tool arguments payload is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseRealtimeVoiceToolArgs({ not: 'json' }, 'browser_action')

    expect(parsed).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RealtimeVoice] Tool arguments payload was not a string; using empty args fallback.'),
      expect.objectContaining({ toolName: 'browser_action' }),
    )
  })

  it('warns and returns empty args when tool arguments JSON is malformed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseRealtimeVoiceToolArgs('{bad-json', 'web_search')

    expect(parsed).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RealtimeVoice] Tool arguments parsing failed; using empty args fallback.'),
      expect.objectContaining({ toolName: 'web_search' }),
    )
  })

  it('warns and returns empty args when decoded tool args are not an object', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseRealtimeVoiceToolArgs('[1,2,3]', 'tune_in')

    expect(parsed).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RealtimeVoice] Tool arguments payload did not decode to an object; using empty args fallback.'),
      expect.objectContaining({ toolName: 'tune_in' }),
    )
  })

  it('warns and drops malformed realtime websocket payloads', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseRealtimeVoiceWsMessage('{"type":')

    expect(parsed).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RealtimeVoice] WebSocket message parsing failed; dropping message.'),
      expect.any(Error),
    )
  })

  it('warns and drops websocket payloads when raw data is not a string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseRealtimeVoiceWsMessage({ type: 'response.create' })

    expect(parsed).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RealtimeVoice] WebSocket message payload was not a string; dropping message.'),
      expect.objectContaining({ rawData: { type: 'response.create' } }),
    )
  })
})
