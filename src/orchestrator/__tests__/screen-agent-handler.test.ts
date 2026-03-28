import EventEmitter from 'eventemitter3'

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { AgentMode } from '@/agents/screen-agent/types'

import { ScreenAgentHandler } from '../screen-agent-handler'

describe('ScreenAgentHandler', () => {
  let globalEmitter: EventEmitter
  let setMode: jest.Mock
  let queryScreen: jest.Mock
  let stop: jest.Mock
  let on: jest.Mock
  let off: jest.Mock
  let emit: jest.Mock

  beforeEach(() => {
    globalEmitter = new EventEmitter()
    setMode = jest.fn(async () => {})
    queryScreen = jest.fn(async () => 'answer')
    stop = jest.fn()
    on = jest.fn()
    off = jest.fn()
    emit = jest.fn()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function makeHandler(): ScreenAgentHandler {
    const screenAgent = {
      setMode,
      queryScreen,
      stop,
      on,
      off,
      emit,
    }
    return new ScreenAgentHandler(screenAgent as never, globalEmitter)
  }

  it('routes jarvis.screen.watch → setMode(WATCH)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.watch' })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.WATCH)
    h.destroy()
  })

  it('routes jarvis.screen.advise → setMode(ADVISE)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.advise' })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.ADVISE)
    h.destroy()
  })

  it('routes jarvis.screen.act with goal → setMode(ACT, goal)', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.act',
      slots: { goal: 'open notepad' },
    })
    await Promise.resolve()
    expect(setMode).toHaveBeenCalledWith(AgentMode.ACT, 'open notepad')
    h.destroy()
  })

  it('routes jarvis.screen.query → queryScreen', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', {
      intent: 'jarvis.screen.query',
      slots: { question: 'what app is focused?' },
    })
    await Promise.resolve()
    expect(queryScreen).toHaveBeenCalledWith('what app is focused?')
    h.destroy()
  })

  it('routes jarvis.screen.stop → stop()', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.stop' })
    await Promise.resolve()
    expect(stop).toHaveBeenCalled()
    h.destroy()
  })

  it('forwards jarvis:user:confirmed → screen emit user:confirmed', () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('jarvis:user:confirmed')
    expect(emit).toHaveBeenCalledWith('user:confirmed')
    h.destroy()
  })

  it('forwards jarvis:user:cancelled → screen emit user:cancelled', () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('jarvis:user:cancelled')
    expect(emit).toHaveBeenCalledWith('user:cancelled')
    h.destroy()
  })

  it('forwards jarvis:speak from ScreenAgent to globalEmitter', () => {
    const h = makeHandler()
    h.init()
    const speakHandler = on.mock.calls.find((c) => c[0] === 'jarvis:speak')?.[1] as (
      p: { text: string; priority: 'low' | 'normal' | 'high' },
    ) => void
    expect(speakHandler).toBeDefined()
    const spy = jest.spyOn(globalEmitter, 'emit')
    speakHandler({ text: 'hi', priority: 'normal' })
    expect(spy).toHaveBeenCalledWith('jarvis:speak', { text: 'hi', priority: 'normal' })
    h.destroy()
  })

  it('destroy() unhooks intent and voice listeners', () => {
    const h = makeHandler()
    h.init()
    const intentsBefore = globalEmitter.listenerCount('intent:resolved')
    expect(intentsBefore).toBeGreaterThan(0)
    h.destroy()
    expect(globalEmitter.listenerCount('intent:resolved')).toBe(0)
    expect(globalEmitter.listenerCount('jarvis:user:confirmed')).toBe(0)
  })

  it('unknown intent does not call setMode', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'something.else' })
    await Promise.resolve()
    expect(setMode).not.toHaveBeenCalled()
    h.destroy()
  })

  it('jarvis.screen.act without goal logs and skips setMode', async () => {
    const h = makeHandler()
    h.init()
    globalEmitter.emit('intent:resolved', { intent: 'jarvis.screen.act', slots: {} })
    await Promise.resolve()
    expect(setMode).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
    h.destroy()
  })
})
