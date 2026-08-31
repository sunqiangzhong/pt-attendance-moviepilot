import { getNextRun, parseCron } from '../shared/cron.js'
import { loadConfig, saveConfig } from '../shared/config.js'
import { watchReload } from '../shared/reload.js'

const elements = {
  siteEnabled: document.getElementById('site-enabled'),
  siteCron: document.getElementById('site-cron'),
  nextRun: document.getElementById('next-run'),
  result: document.getElementById('site-result'),
  resultText: document.getElementById('result-text'),
  mpEnabled: document.getElementById('mp-enabled'),
  mpUrl: document.getElementById('mp-url'),
  mpKey: document.getElementById('mp-key'),
  runSite: document.getElementById('run-site'),
  save: document.getElementById('save'),
  saveState: document.getElementById('save-state')
}

function showNextRun() {
  try {
    elements.nextRun.textContent = getNextRun(elements.siteCron.value).toLocaleString('zh-CN', { hour12: false })
    elements.siteCron.setCustomValidity('')
  } catch (error) {
    elements.nextRun.textContent = error.message
    elements.siteCron.setCustomValidity(error.message)
  }
}

function showResult(result) {
  elements.result.dataset.state = result?.state || 'idle'
  if (!result) {
    elements.resultText.textContent = '暂无执行记录'
    return
  }

  const time = new Date(result.time).toLocaleString('zh-CN', { hour12: false })
  elements.resultText.textContent = `${result.message} · ${time}`
}

async function loadPage() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  const config = state.config
  elements.siteEnabled.checked = config.sites.hddolby.enabled
  elements.siteCron.value = config.sites.hddolby.cron
  elements.mpEnabled.checked = config.moviePilot.enabled
  elements.mpUrl.value = config.moviePilot.baseUrl
  elements.mpKey.value = config.moviePilot.apiKey
  showResult(state.results.hddolby)
  showNextRun()
}

elements.siteCron.addEventListener('input', showNextRun)

elements.save.addEventListener('click', async () => {
  try {
    parseCron(elements.siteCron.value)
    const config = await loadConfig()
    config.sites.hddolby = {
      enabled: elements.siteEnabled.checked,
      cron: elements.siteCron.value.trim()
    }
    config.moviePilot = {
      enabled: elements.mpEnabled.checked,
      baseUrl: elements.mpUrl.value.trim(),
      apiKey: elements.mpKey.value.trim()
    }
    await saveConfig(config)
    elements.saveState.textContent = '已保存'
    setTimeout(() => { elements.saveState.textContent = '配置保存在当前浏览器' }, 1800)
  } catch (error) {
    elements.saveState.textContent = error.message
  }
})

elements.runSite.addEventListener('click', async () => {
  elements.runSite.disabled = true
  elements.runSite.textContent = '正在打开签到页…'
  try {
    await chrome.runtime.sendMessage({ type: 'RUN_SITE', siteId: 'hddolby' })
    showResult({ state: 'running', message: '签到任务已启动', time: Date.now() })
  } finally {
    elements.runSite.disabled = false
    elements.runSite.textContent = '立即签到'
  }
})

chrome.storage.onChanged.addListener(changes => {
  if (changes.results?.newValue) showResult(changes.results.newValue.hddolby)
})

loadPage().catch(error => { elements.saveState.textContent = error.message })

if (__DEV__) {
  watchReload(() => {
    chrome.runtime.sendMessage({ type: 'DEV_RELOAD' }).catch(() => {})
  })
}
