import { describe, it, expect } from 'vitest'
import { parseNowTvBookmarksEnv, NOWTV_DEFAULT_BOOKMARKS } from '../src/lib/nowtv-bookmarks'

describe('parseNowTvBookmarksEnv', () => {
  it('returns null for empty or undefined', () => {
    expect(parseNowTvBookmarksEnv(undefined)).toBeNull()
    expect(parseNowTvBookmarksEnv('')).toBeNull()
    expect(parseNowTvBookmarksEnv('   ')).toBeNull()
  })

  it('parses valid JSON array with href and clamps progress', () => {
    const rows = parseNowTvBookmarksEnv(
      JSON.stringify([
        { title: 'Show A', meta: 'S1 · E1', progress: 50, href: 'https://www.nowtv.com/movies' },
        { title: 'Show B', progress: 200 },
        { title: 'Show C', meta: '', progress: -5, href: 'not-a-url' },
      ])
    )
    expect(rows).not.toBeNull()
    expect(rows!.length).toBe(3)
    expect(rows![0]).toMatchObject({
      title: 'Show A',
      meta: 'S1 · E1',
      progress: 50,
      href: 'https://www.nowtv.com/movies',
    })
    expect(rows![1].progress).toBe(100)
    expect(rows![2].meta).toBe('—')
    expect(rows![2].progress).toBe(0)
    expect(rows![2].href).toBeUndefined()
  })

  it('returns null for non-array JSON', () => {
    expect(parseNowTvBookmarksEnv('{}')).toBeNull()
    expect(parseNowTvBookmarksEnv('"x"')).toBeNull()
  })

  it('skips rows without title', () => {
    const rows = parseNowTvBookmarksEnv(JSON.stringify([{ meta: 'x' }, { title: 'Ok', meta: 'm', progress: 1 }]))
    expect(rows?.length).toBe(1)
    expect(rows![0].title).toBe('Ok')
  })

  it('default bookmarks have three sample rows', () => {
    expect(NOWTV_DEFAULT_BOOKMARKS.length).toBe(3)
  })
})
