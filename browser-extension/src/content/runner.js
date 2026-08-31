import { adapters } from '../sites/index.js'
import { watchReload } from '../shared/reload.js'

;(() => {
  const adapter = Object.values(adapters).find(item => item.hosts.includes(location.hostname))
  if (!adapter) return

  async function report(type, data = {}) {
    return chrome.runtime.sendMessage({ type, siteId: adapter.id, ...data })
  }

  const ctx = {
    async askAgent(imageUrl, prompt) {
      const response = await report('ASK_AGENT', { imageUrl, prompt })
      if (!response?.ok) throw new Error(response?.error || 'MoviePilot Agent 请求失败')
      return response.text
    }
  }

  async function run() {
    const task = await report('SITE_READY')
    if (!task || task.state !== 'pending') return

    try {
      const step = await adapter.run(task, ctx)

      if (step.action === 'success') {
        await report('SITE_SUCCESS', { result: step.result })
        return
      }

      if (step.action === 'navigate') {
        await report('SITE_STEP', { step: 'navigate' })
        location.assign(step.url)
        return
      }

      if (step.action === 'reload') {
        await report('SITE_STEP', { step: 'reload' })
        location.reload()
        return
      }

      if (step.action === 'wait') {
        await report('SITE_STEP', { step: step.step || 'wait' })
        setTimeout(run, step.delay || 1200)
        return
      }

      await report('SITE_FAILURE', { error: step.error || '签到失败' })
    } catch (error) {
      await report('SITE_FAILURE', { error: error.message })
    }
  }

  run().catch(error => console.error('[PT Extension]', error))

  if (__DEV__) {
    watchReload(() => {
      chrome.runtime.sendMessage({ type: 'DEV_RELOAD' }).catch(() => {})
    })
  }
})()
