import { describe, expect, it } from 'vitest'
import { getMinuteKey, getNextRun, matchesCron, parseCron } from '../src/shared/cron.js'

describe('Cron', () => {
  it('matches a scheduled minute', () => {
    const date = new Date(2026, 7, 31, 10, 8, 0)
    expect(matchesCron('8 10 * * *', date)).toBe(true)
    expect(getMinuteKey(date)).toBe('2026-08-31 10:08')
  })

  it('finds the next scheduled minute', () => {
    const date = new Date(2026, 7, 31, 10, 8, 20)
    expect(getNextRun('9 10 * * *', date).getMinutes()).toBe(9)
  })

  it('rejects invalid expressions', () => {
    expect(() => parseCron('8 10 * *')).toThrow('Cron 必须为 5 段')
  })
})
