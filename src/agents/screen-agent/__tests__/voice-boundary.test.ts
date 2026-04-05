import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from '@jest/globals'
import { globSync } from 'glob'

const SCREEN_AGENT_ROOT = join(__dirname, '..')
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

function productionTsFiles(): string[] {
  const rel = globSync('**/*.ts', {
    cwd: SCREEN_AGENT_ROOT,
    ignore: ['**/__tests__/**'],
    nodir: true,
    posix: true,
  })
  return rel.map((r) => join(SCREEN_AGENT_ROOT, r))
}

function readProductionSources(): Array<{ path: string; text: string; lines: string[] }> {
  const out: Array<{ path: string; text: string; lines: string[] }> = []
  for (const file of productionTsFiles()) {
    const text = readFileSync(file, 'utf8')
    out.push({ path: file, text, lines: text.split(/\r?\n/) })
  }
  return out
}

const FORBIDDEN_IMPORT_TOKENS: readonly string[] = [
  'elevenlabs',
  "from '../voice",
  "from '../../services/tts",
  "from '../../services/stt",
  "from '../../services/elevenlabs",
  "require('elevenlabs",
  "require('../voice",
]

const DIRECT_VOICE_CALL_PATTERNS: readonly string[] = [
  '.speak(',
  '.synthesize(',
  '.playAudio(',
  'ttsService.',
  'voiceService.',
  'elevenlabsClient.',
]

/** Lines may use `this.emit('jarvis:speak'` or `this.emit("jarvis:speak"`. */
function lineUsesAllowedJarvisSpeakEmit(line: string): boolean {
  return /\bthis\.emit\s*\(\s*['"]jarvis:speak['"]/.test(line)
}

function findMatchesWithLines(
  lines: string[],
  predicate: (line: string, lineNumber: number) => boolean,
): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = []
  lines.forEach((text, i) => {
    if (predicate(text, i + 1)) {
      hits.push({ line: i + 1, text })
    }
  })
  return hits
}

describe('Voice boundary — static analysis (screen agent)', () => {
  it('screen agent imports no voice/TTS/ElevenLabs services', () => {
    const violations: string[] = []
    for (const file of productionTsFiles()) {
      const text = readFileSync(file, 'utf8')
      const lower = text.toLowerCase()
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        const hit = token === 'elevenlabs' ? lower.includes('elevenlabs') : text.includes(token)
        if (hit) {
          violations.push(`${relative(REPO_ROOT, file)} — forbidden substring: ${JSON.stringify(token)}`)
        }
      }
    }
    if (violations.length > 0) {
      console.error(violations.join('\n'))
    }
    expect(violations).toEqual([])
  })

  it('screen agent speaks only via jarvis:speak event — never direct call', () => {
    const violations: Array<{ file: string; line: number; pattern: string; text: string }> = []
    for (const { path: file, lines } of readProductionSources()) {
      for (const pattern of DIRECT_VOICE_CALL_PATTERNS) {
        const hits = findMatchesWithLines(lines, (line) => {
          if (!line.includes(pattern)) {
            return false
          }
          if (lineUsesAllowedJarvisSpeakEmit(line)) {
            return false
          }
          return true
        })
        for (const h of hits) {
          violations.push({
            file: relative(REPO_ROOT, file),
            line: h.line,
            pattern,
            text: h.text.trim(),
          })
        }
      }
    }
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`${v.file}:${v.line} — matched ${JSON.stringify(v.pattern)} — ${v.text}`)
      }
    }
    expect(violations).toEqual([])
  })

  // eslint-disable-next-line sonarjs/cognitive-complexity -- test validates source-level voice boundary across all production files; multi-pass inspection is inherent
  it('jarvis:speak is the only voice output mechanism in screen agent', () => {
    let jarvisSpeakThisEmitCount = 0
    let jarvisSpeakEmitterEmitCount = 0

    const extraVoiceEmitViolations: string[] = []

    for (const { path: file, lines } of readProductionSources()) {
      for (const line of lines) {
        if (/\bthis\.emit\s*\(\s*['"]jarvis:speak['"]/.test(line)) {
          jarvisSpeakThisEmitCount += 1
        }
        if (/\bthis\.emitter\.emit\s*\(\s*['"]jarvis:speak['"]/.test(line)) {
          jarvisSpeakEmitterEmitCount += 1
        }
      }
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!
        if (/^\s*\/\//.test(line) || /\/\*/.test(line)) {
          continue
        }
        if (lineUsesAllowedJarvisSpeakEmit(line)) {
          continue
        }
        if (/\bthis\.emitter\.emit\s*\(\s*['"]jarvis:speak['"]/.test(line)) {
          continue
        }
        const suspicious =
          /\.emit\s*\(\s*['"](tts|voice|audio|speech)/i.test(line) ||
          /\bnew\s+Audio\s*\(/i.test(line) ||
          /\bspeechSynthesis\b/i.test(line)
        if (suspicious) {
          extraVoiceEmitViolations.push(
            `${relative(REPO_ROOT, file)}:${i + 1} — unexpected voice/audio emission pattern: ${line.trim()}`,
          )
        }
      }
    }

    console.info(
      `[voice-boundary] this.emit('jarvis:speak'…) count: ${String(jarvisSpeakThisEmitCount)}; this.emitter.emit('jarvis:speak'…) count: ${String(jarvisSpeakEmitterEmitCount)}`,
    )

    expect(jarvisSpeakThisEmitCount + jarvisSpeakEmitterEmitCount).toBeGreaterThanOrEqual(1)
    expect(extraVoiceEmitViolations).toEqual([])
  })

  it('voice agent files exist and have not been deleted', () => {
    const voiceDir = join(REPO_ROOT, 'src', 'agents', 'voice')
    expect(existsSync(voiceDir)).toBe(true)
    const tsFiles: string[] = []
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name)
        if (ent.isDirectory()) {
          walk(p)
        } else if (ent.name.endsWith('.ts')) {
          tsFiles.push(relative(REPO_ROOT, p))
        }
      }
    }
    walk(voiceDir)
    console.info(`[voice-boundary] src/agents/voice/ .ts files: ${tsFiles.join(', ') || '(none)'}`)
    expect(tsFiles.length).toBeGreaterThanOrEqual(1)
  })

  it('screen agent folder structure is complete', () => {
    const expected = [
      'src/agents/screen-agent/types.ts',
      'src/agents/screen-agent/config.ts',
      'src/agents/screen-agent/python-bridge.ts',
      'src/agents/screen-agent/state-manager.ts',
      'src/agents/screen-agent/significance-detector.ts',
      'src/agents/screen-agent/advice-generator.ts',
      'src/agents/screen-agent/safety-gate.ts',
      'src/agents/screen-agent/goal-executor.ts',
      'src/agents/screen-agent/index.ts',
    ]
    const missing: string[] = []
    for (const rel of expected) {
      const abs = join(REPO_ROOT, rel)
      if (!existsSync(abs)) {
        missing.push(rel)
      }
    }
    if (missing.length > 0) {
      console.error(`Missing screen-agent files:\n${missing.join('\n')}`)
    }
    expect(missing).toEqual([])
  })
})
