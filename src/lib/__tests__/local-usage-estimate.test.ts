import { estimateLocalQuota, estimateLocalUsage } from '@/lib/local-usage-estimate'

describe('estimateLocalUsage', () => {
  it('counts recent message characters and token estimate', () => {
    const usage = estimateLocalUsage(
      [
        { content: 'hello' },
        { content: 'world!' },
      ],
      12,
    )
    expect(usage.recentMessageCount).toBe(2)
    expect(usage.recentCharacterCount).toBe(11)
    expect(usage.estimatedTokenCount).toBe(3)
  })

  it('respects recent message limit', () => {
    const usage = estimateLocalUsage(
      [
        { content: 'first' },
        { content: 'second' },
      ],
      1,
    )
    expect(usage.recentMessageCount).toBe(1)
    expect(usage.recentCharacterCount).toBe(6)
  })
})

describe('estimateLocalQuota', () => {
  it('computes context usage percent for known models', () => {
    const quota = estimateLocalQuota('gpt-4o-mini', 1280)
    expect(quota.contextWindow).toBe(128000)
    expect(quota.estimatedUsagePercent).toBeCloseTo(1, 4)
  })

  it('returns null usage for unknown models', () => {
    const quota = estimateLocalQuota('replicate:owner/model', 1000)
    expect(quota.contextWindow).toBeNull()
    expect(quota.estimatedUsagePercent).toBeNull()
  })
})
