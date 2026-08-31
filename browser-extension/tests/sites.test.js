import { describe, expect, it } from 'vitest'
import { sites } from '../src/sites/catalog.js'
import { adapters } from '../src/sites/index.js'

describe('站点注册', () => {
  it('每个站点都有内容适配器', () => {
    expect(Object.keys(adapters).sort()).toEqual(Object.keys(sites).sort())
  })

  it('适配器域名由站点清单覆盖', () => {
    for (const [siteId, site] of Object.entries(sites)) {
      expect(adapters[siteId].id).toBe(siteId)
      expect(adapters[siteId].hosts.sort()).toEqual(site.hosts.sort())
    }
  })
})
