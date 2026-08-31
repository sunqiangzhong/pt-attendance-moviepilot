import { getMinuteKey, matchesCron } from '../shared/cron.js'
import { loadConfig } from '../shared/config.js'
import { sites } from '../sites/catalog.js'

const ALARM_NAME = 'pt-scheduler'
const TASK_TTL = 10 * 60 * 1000

async function getStore(key, fallback) {
  const data = await chrome.storage.local.get(key)
  return data[key] ?? fallback
}

async function setStore(key, value) {
  await chrome.storage.local.set({ [key]: value })
}

async function notifyMoviePilot(site, status, result = {}, error = '') {
  const config = await loadConfig()
  const mp = config.moviePilot
  if (!mp.enabled || !mp.baseUrl.trim() || !mp.apiKey.trim()) return

  const title = `【${error ? '❌' : '✅'}  ${site.name}${status}】`
  const lines = ['📢 执行结果', '', `🕐 时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, `✨ 状态：${status}`]
  if (result.bonus) lines.push(`🎁 获得: ${result.bonus}`)
  if (error) lines.push(`⚠️ 原因：${error}`)

  const base = mp.baseUrl.trim().replace(/\/+$/, '')
  const url = `${base}/api/v1/plugin/MsgNotify/send_json?apikey=${encodeURIComponent(mp.apiKey.trim())}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text: lines.join('\n'), url: site.attendanceUrl })
  })

  if (!response.ok) throw new Error(`MoviePilot 通知 HTTP ${response.status}`)
}

async function saveResult(siteId, value) {
  const results = await getStore('results', {})
  results[siteId] = { ...value, time: Date.now() }
  await setStore('results', results)
}

async function openSite(site, source) {
  const tasks = await getStore('tasks', {})
  tasks[site.id] = {
    siteId: site.id,
    source,
    state: 'pending',
    reloads: 0,
    startedAt: Date.now()
  }
  await setStore('tasks', tasks)
  await saveResult(site.id, { state: 'running', message: '正在打开签到页' })

  const tabs = await chrome.tabs.query({ url: site.matches })
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { url: site.attendanceUrl, active: false })
  } else {
    await chrome.tabs.create({ url: site.attendanceUrl, active: false })
  }
}

async function runSite(siteId, source = 'manual') {
  const site = sites[siteId]
  if (!site) throw new Error(`未知站点：${siteId}`)
  await openSite(site, source)
}

async function tick() {
  const now = new Date()
  const minute = getMinuteKey(now)
  const config = await loadConfig()
  const runs = await getStore('runs', {})

  for (const site of Object.values(sites)) {
    const setting = config.sites[site.id]
    if (!setting?.enabled) continue

    try {
      if (!matchesCron(setting.cron, now) || runs[site.id] === minute) continue
      runs[site.id] = minute
      await setStore('runs', runs)
      await runSite(site.id, 'cron')
    } catch (error) {
      await saveResult(site.id, { state: 'failure', message: error.message })
    }
  }
}

async function ensureAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAME)
  if (!alarm) await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 })
  await tick()
}

async function getTask(siteId) {
  const tasks = await getStore('tasks', {})
  const task = tasks[siteId]
  if (!task || task.state !== 'pending') return null
  if (Date.now() - task.startedAt <= TASK_TTL) return task

  task.state = 'failure'
  await setStore('tasks', tasks)
  await saveResult(siteId, { state: 'failure', message: '签到任务已超时' })
  return null
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (message.type === 'RUN_SITE') {
      await runSite(message.siteId)
      sendResponse({ ok: true })
      return
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ config: await loadConfig(), results: await getStore('results', {}) })
      return
    }

    if (message.type === 'SITE_READY') {
      sendResponse(await getTask(message.siteId))
      return
    }

    const tasks = await getStore('tasks', {})
    const task = tasks[message.siteId]
    if (!task) return sendResponse(null)

    if (message.type === 'SITE_STEP') {
      if (message.step === 'reload') task.reloads = (task.reloads || 0) + 1
      task.tabId = sender.tab?.id
      await setStore('tasks', tasks)
      sendResponse(task)
      return
    }

    const site = sites[message.siteId]
    if (message.type === 'SITE_SUCCESS') {
      task.state = 'success'
      task.result = message.result
      await setStore('tasks', tasks)
      await saveResult(site.id, { state: 'success', message: message.result.status, bonus: message.result.bonus })
      await notifyMoviePilot(site, message.result.status, message.result).catch(console.error)
    }

    if (message.type === 'SITE_FAILURE') {
      task.state = 'failure'
      task.error = message.error
      await setStore('tasks', tasks)
      await saveResult(site.id, { state: 'failure', message: message.error })
      await notifyMoviePilot(site, '签到失败', {}, message.error).catch(console.error)
    }

    sendResponse({ ok: true })
  })().catch(error => sendResponse({ ok: false, error: error.message }))

  return true
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) tick().catch(console.error)
})

chrome.runtime.onInstalled.addListener(() => ensureAlarm().catch(console.error))
chrome.runtime.onStartup.addListener(() => ensureAlarm().catch(console.error))
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage())

ensureAlarm().catch(console.error)
