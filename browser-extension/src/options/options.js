import { getNextRun, parseCron } from '../shared/cron.js'
import { loadConfig, saveConfig } from '../shared/config.js'
import { watchReload } from '../shared/reload.js'
import { sites } from '../sites/catalog.js'

const siteList = document.getElementById('site-list')
const save = document.getElementById('save')
const saveState = document.getElementById('save-state')
const mpEnabled = document.getElementById('mp-enabled')
const mpUrl = document.getElementById('mp-url')
const mpKey = document.getElementById('mp-key')
const agentPath = document.getElementById('agent-path')
const agentToken = document.getElementById('agent-token')
const siteFields = new Map()

function createSite(site, idx) {
  const card = document.createElement('article')
  card.className = 'card site-card'
  card.innerHTML = `
    <div class="card-head">
      <div><span class="tag">SITE ${String(idx + 1).padStart(2, '0')}</span><h2>${site.name}</h2></div>
      <label class="switch"><input data-field="enabled" type="checkbox"><span></span></label>
    </div>
    <label class="field">
      <span>Cron 计划</span>
      <input data-field="cron" value="0 8 * * *" spellcheck="false">
      <small>分 时 日 月 周，例如每天 08:00：0 8 * * *</small>
    </label>
    ${site.hasPrompt ? '<label class="field"><span>本站 Agent Prompt</span><textarea data-field="prompt"></textarea></label>' : ''}
    <div class="readout"><span>下次执行</span><strong data-field="next">--</strong></div>
    <div class="result" data-field="result" data-state="idle">
      <span class="lamp"></span><div><small>最近结果</small><strong data-field="result-text">暂无执行记录</strong></div>
    </div>
    <button class="btn ghost" data-field="run" type="button">立即签到</button>`
  siteList.appendChild(card)

  const fields = Object.fromEntries(Array.from(card.querySelectorAll('[data-field]')).map(element => [element.dataset.field, element]))
  siteFields.set(site.id, fields)
  fields.cron.addEventListener('input', () => showNext(site.id))
  fields.run.addEventListener('click', () => runSite(site.id))
}

function showNext(siteId) {
  const fields = siteFields.get(siteId)
  try {
    fields.next.textContent = getNextRun(fields.cron.value).toLocaleString('zh-CN', { hour12: false })
    fields.cron.setCustomValidity('')
  } catch (error) {
    fields.next.textContent = error.message
    fields.cron.setCustomValidity(error.message)
  }
}

function showResult(siteId, result) {
  const fields = siteFields.get(siteId)
  if (!fields) return
  fields.result.dataset.state = result?.state || 'idle'
  fields['result-text'].textContent = result
    ? `${result.message} · ${new Date(result.time).toLocaleString('zh-CN', { hour12: false })}`
    : '暂无执行记录'
}

async function runSite(siteId) {
  const fields = siteFields.get(siteId)
  fields.run.disabled = true
  fields.run.textContent = '正在打开签到页…'
  try {
    await chrome.runtime.sendMessage({ type: 'RUN_SITE', siteId })
    showResult(siteId, { state: 'running', message: '签到任务已启动', time: Date.now() })
  } finally {
    fields.run.disabled = false
    fields.run.textContent = '立即签到'
  }
}

for (const [idx, site] of Object.values(sites).entries()) createSite(site, idx)

async function loadPage() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  for (const site of Object.values(sites)) {
    const setting = state.config.sites[site.id]
    const fields = siteFields.get(site.id)
    fields.enabled.checked = setting.enabled
    fields.cron.value = setting.cron
    if (fields.prompt) fields.prompt.value = setting.prompt || ''
    showResult(site.id, state.results[site.id])
    showNext(site.id)
  }
  mpEnabled.checked = state.config.moviePilot.enabled
  mpUrl.value = state.config.moviePilot.baseUrl
  mpKey.value = state.config.moviePilot.apiKey
  agentPath.value = state.config.moviePilot.agentPath
  agentToken.value = state.config.moviePilot.agentToken
}

save.addEventListener('click', async () => {
  try {
    const config = await loadConfig()
    for (const site of Object.values(sites)) {
      const fields = siteFields.get(site.id)
      parseCron(fields.cron.value)
      config.sites[site.id] = {
        ...config.sites[site.id],
        enabled: fields.enabled.checked,
        cron: fields.cron.value.trim(),
        ...(fields.prompt ? { prompt: fields.prompt.value.trim() } : {})
      }
    }
    config.moviePilot = {
      enabled: mpEnabled.checked,
      baseUrl: mpUrl.value.trim(),
      apiKey: mpKey.value.trim(),
      agentPath: agentPath.value.trim(),
      agentToken: agentToken.value.trim()
    }
    await saveConfig(config)
    saveState.textContent = '已保存'
    setTimeout(() => { saveState.textContent = '配置保存在当前浏览器' }, 1800)
  } catch (error) {
    saveState.textContent = error.message
  }
})

chrome.storage.onChanged.addListener(changes => {
  if (!changes.results?.newValue) return
  for (const site of Object.values(sites)) showResult(site.id, changes.results.newValue[site.id])
})

loadPage().catch(error => { saveState.textContent = error.message })

if (__DEV__) {
  watchReload(() => chrome.runtime.sendMessage({ type: 'DEV_RELOAD' }).catch(() => {}))
}
