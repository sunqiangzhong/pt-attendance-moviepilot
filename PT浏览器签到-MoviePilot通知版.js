// ==UserScript==
// @name         PT 自动签到 · MoviePilot AI
// @namespace    https://archers.cc.cd/
// @version      0.9.3
// @description  HHCLUB / HDDolby / HDSky / OpenCD / U2 Cron签到、MoviePilot通知与验证码识别
// @updateURL    https://raw.githubusercontent.com/sunqiangzhong/pt-attendance-moviepilot/main/PT%E6%B5%8F%E8%A7%88%E5%99%A8%E7%AD%BE%E5%88%B0-MoviePilot%E9%80%9A%E7%9F%A5%E7%89%88.js
// @downloadURL  https://raw.githubusercontent.com/sunqiangzhong/pt-attendance-moviepilot/main/PT%E6%B5%8F%E8%A7%88%E5%99%A8%E7%AD%BE%E5%88%B0-MoviePilot%E9%80%9A%E7%9F%A5%E7%89%88.js
//
// @match        https://hhanclub.net/*
// @match        https://www.hddolby.com/*
// @match        https://hdsky.me/*
// @match        https://www.hdsky.me/*
// @match        https://open.cd/*
// @match        https://www.open.cd/*
// @match        https://u2.dmhy.org/*
// @match        http://192.168.5.6:3000/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
//
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

;(async function () {
  'use strict'

  if (window.top !== window.self) {
    return
  }

  /************************************************************
   * 基础配置
   ************************************************************/

  const VERSION = '0.9.3'

  const SETTINGS_KEY = 'pt_attendance_settings_v7'

  const LAST_AI_IMAGE_KEY = 'pt_attendance_last_ai_image_v3'

  const LAST_ATTENDANCE_SUCCESS_KEY = 'pt_attendance_last_success_v1'

  const LAST_NOTIFY_PREFIX = 'pt_attendance_last_notify_'

  const LAST_CREDENTIAL_WARNING_PREFIX = 'pt_attendance_credential_warning_'

  const MP_PROXY_ORIGIN = 'http://192.168.5.6:3000'

  const MP_AGENT_TOKEN_KEY = 'pt_attendance_mp_proxy_agent_token_v1'

  const LAST_SCHEDULER_CHECK_KEY = 'pt_attendance_scheduler_check_v4'

  const LAST_TRIGGER_KEY = 'pt_attendance_last_trigger_v4'

  const OPENCD_PENDING_REFRESH_KEY = 'pt_attendance_opencd_pending_refresh'

  const PENDING_ATTENDANCE_KEY = 'pt_attendance_pending_signin'

  const PANEL_ICON_POSITION_KEY = 'pt_attendance_panel_icon_position_v1'

  const SCHEDULER_INTERVAL = 20 * 1000

  const DEFAULT_CONFIG = {
    autoAttendance: false,

    cron: '0 8 * * *',

    moviePilot: {
      enabled: true,

      baseUrl: '',

      apiKey: '',

      agentEnabled: true,

      agentPath: '/api/v1/message/agent/stream',

      agentToken: '',

      sessionPrefix: 'pt-attendance',

      aiPrompts: {},

      /*
       * 卡片里可以直接修改。
       */
      aiPrompt: ['请识别图片中的验证码。', '只输出验证码本身，不要添加解释、标点或 Markdown。'].join('\n')
    },

    logoUrl: 'https://img.archers.cc.cd/file/1788021141853_5855043a-7458-4d39-997a-be28825d12e4.png'
  }

  /************************************************************
   * GM Storage
   ************************************************************/

  async function gmGet(key, defaultValue) {
    return await GM_getValue(key, defaultValue)
  }

  async function gmSet(key, value) {
    return await GM_setValue(key, value)
  }

  async function gmDelete(key) {
    return await GM_deleteValue(key)
  }

  const storedConfig = await gmGet(SETTINGS_KEY, {})

  const {
    imgBed: _legacyImgBed,

    screenshot: _legacyScreenshot,

    ...activeStoredConfig
  } = storedConfig

  let CONFIG = {
    ...DEFAULT_CONFIG,
    ...activeStoredConfig,

    moviePilot: {
      ...DEFAULT_CONFIG.moviePilot,
      ...(storedConfig.moviePilot || {})
    }
  }

  async function syncMPProxyAgentToken() {
    try {
      const raw = localStorage.getItem('auth')

      if (!raw) {
        await gmDelete(MP_AGENT_TOKEN_KEY)

        return false
      }

      let auth

      try {
        auth = JSON.parse(raw)
      } catch {
        auth = raw
      }

      const token = typeof auth === 'string' ? auth : auth?.access_token || auth?.token || ''

      if (!token) {
        await gmDelete(MP_AGENT_TOKEN_KEY)

        return false
      }

      await gmSet(MP_AGENT_TOKEN_KEY, token)

      console.log('[PT MP] Agent Token 已同步')

      return true
    } catch (error) {
      console.error('[PT MP] 同步 Agent Token 失败', error)

      return false
    }
  }

  /*
   * 当前页面如果就是 MoviePilot，
   * 自动同步登录 Token。
   */
  if (location.origin === MP_PROXY_ORIGIN) {
    await syncMPProxyAgentToken()
  }

  /************************************************************
   * 通用工具
   ************************************************************/

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function formatDateTime(timestamp) {
    if (!timestamp) {
      return '-'
    }

    const date = new Date(timestamp)

    const pad = value => String(value).padStart(2, '0')

    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      ' ',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes()),
      ':',
      pad(date.getSeconds())
    ].join('')
  }

  function formatCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000))

    const hours = Math.floor(totalSeconds / 3600)

    const minutes = Math.floor((totalSeconds % 3600) / 60)

    const seconds = totalSeconds % 60

    const pad = value => String(value).padStart(2, '0')

    return [pad(hours), ':', pad(minutes), ':', pad(seconds)].join('')
  }

  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/+$/, '')
  }

  function getAIImageKey() {
    return `${LAST_AI_IMAGE_KEY}_${site.id}`
  }

  function getSitePrompt() {
    return CONFIG.moviePilot.aiPrompts?.[site.id] || DEFAULT_CONFIG.moviePilot.aiPrompt
  }

  function setSitePrompt(prompt) {
    CONFIG.moviePilot.aiPrompts = {
      ...(CONFIG.moviePilot.aiPrompts || {}),

      [site.id]: String(prompt || '').trim()
    }
  }

  function getCurrentAIPrompt() {
    const input = document.getElementById('pt-ai-card-prompt')

    return input?.value?.trim() || getSitePrompt()
  }

  function isToday(timestamp) {
    if (!timestamp) {
      return false
    }

    const date = new Date(timestamp)

    const now = new Date()

    return (
      date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
    )
  }

  function getTodayKey() {
    const now = new Date()

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-')
  }

  function filenameDate(date = new Date()) {
    const pad = value => String(value).padStart(2, '0')

    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('')
  }

  /************************************************************
   * HTTP
   ************************************************************/

  function gmRequest({ method = 'GET', url, headers = {}, data, responseType, timeout = 30000 }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data,
        responseType,
        timeout,

        onload: response => resolve(response),

        onerror: error => reject(new Error(error?.error || error?.message || '网络请求失败')),

        ontimeout: () => reject(new Error(`请求超时：${url}`))
      })
    })
  }

  function parseJsonSafe(text, fallback = null) {
    try {
      return JSON.parse(text)
    } catch {
      return fallback
    }
  }

  /************************************************************
   * Cron
   ************************************************************/

  function parseCronPart(part, min, max) {
    const values = new Set()

    const segments = String(part)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    for (const segment of segments) {
      if (segment === '*') {
        for (let value = min; value <= max; value++) {
          values.add(value)
        }

        continue
      }

      const stepMatch = segment.match(/^(.+)\/(\d+)$/)

      if (stepMatch) {
        const base = stepMatch[1]

        const step = Number(stepMatch[2])

        if (!step || step <= 0) {
          throw new Error(`Cron 步长无效：${segment}`)
        }

        let start = min

        let end = max

        if (base !== '*') {
          const range = base.split('-')

          start = Number(range[0])

          end = range.length > 1 ? Number(range[1]) : max
        }

        for (let value = start; value <= end; value += step) {
          if (value >= min && value <= max) {
            values.add(value)
          }
        }

        continue
      }

      const rangeMatch = segment.match(/^(\d+)-(\d+)$/)

      if (rangeMatch) {
        const start = Number(rangeMatch[1])

        const end = Number(rangeMatch[2])

        for (let value = start; value <= end; value++) {
          if (value >= min && value <= max) {
            values.add(value)
          }
        }

        continue
      }

      const value = Number(segment)

      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Cron 数值无效：${segment}`)
      }

      values.add(value)
    }

    return values
  }

  function parseCron(expression) {
    const parts = String(expression || '')
      .trim()
      .split(/\s+/)

    if (parts.length !== 5) {
      throw new Error('Cron 必须为 5 段，例如：0 8 * * *')
    }

    return {
      minute: parseCronPart(parts[0], 0, 59),

      hour: parseCronPart(parts[1], 0, 23),

      day: parseCronPart(parts[2], 1, 31),

      month: parseCronPart(parts[3], 1, 12),

      week: parseCronPart(parts[4], 0, 7)
    }
  }

  function cronMatches(cron, date) {
    const week = date.getDay()

    const weekMatches = cron.week.has(week) || (week === 0 && cron.week.has(7))

    return (
      cron.minute.has(date.getMinutes()) &&
      cron.hour.has(date.getHours()) &&
      cron.day.has(date.getDate()) &&
      cron.month.has(date.getMonth() + 1) &&
      weekMatches
    )
  }

  function getNextOccurrence(expression, from = new Date()) {
    const cron = parseCron(expression)

    let current = new Date(from.getTime())

    current.setSeconds(0, 0)

    current = new Date(current.getTime() + 60000)

    const max = 366 * 24 * 60

    for (let i = 0; i < max; i++) {
      if (cronMatches(cron, current)) {
        return current
      }

      current = new Date(current.getTime() + 60000)
    }

    throw new Error('未来366天没有 Cron 匹配时间')
  }

  function findOccurrence(expression, from, to) {
    if (!from || !to || from >= to) {
      return null
    }

    const cron = parseCron(expression)

    let cursor = new Date(from)

    cursor.setSeconds(0, 0)

    cursor = new Date(cursor.getTime() + 60000)

    const end = new Date(to)

    const max = 48 * 60

    for (let i = 0; i < max && cursor <= end; i++) {
      if (cronMatches(cron, cursor)) {
        return cursor
      }

      cursor = new Date(cursor.getTime() + 60000)
    }

    return null
  }

  /************************************************************
   * HDSky
   ************************************************************/

  function getHDSkyCaptchaImage() {
    return document.querySelector('#showupimg')
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)

        return
      } catch (error) {
        console.warn('[PT Clipboard] Clipboard API 不可用，尝试兼容方式', error)
      }
    }

    const textarea = document.createElement('textarea')

    textarea.value = text

    textarea.style.position = 'fixed'

    textarea.style.opacity = '0'

    document.body.appendChild(textarea)

    textarea.select()

    const copied = document.execCommand('copy')

    textarea.remove()

    if (!copied) {
      throw new Error('浏览器拒绝了剪贴板操作')
    }
  }

  function getHDSkyCaptchaImageUrl() {
    const image = getHDSkyCaptchaImage()

    const imageHash =
      image?.closest('.layui-layer.layui-layer-page')?.querySelector('input[name="imagehash"]')?.value?.trim() ||
      document.querySelector('input[name="imagehash"]')?.value?.trim() ||
      ''

    if (imageHash) {
      return 'https://hdsky.me/image.php' + '?action=regimage' + `&imagehash=${encodeURIComponent(imageHash)}`
    }

    if (!image) {
      return ''
    }

    try {
      const url = new URL(image.getAttribute('src') || image.src, 'https://hdsky.me/')

      const hash = url.searchParams.get('imagehash') || ''

      if (!hash) {
        return ''
      }

      return 'https://hdsky.me/image.php' + '?action=regimage' + `&imagehash=${encodeURIComponent(hash)}`
    } catch (error) {
      console.error('[PT HDSky] 解析验证码图片地址失败', error)

      return ''
    }
  }

  function describeCron(expression) {
    const parts = String(expression || '')
      .trim()
      .split(/\s+/)

    if (parts.length !== 5) {
      return '请输入 5 段 Cron 表达式'
    }

    parseCron(expression)

    const [minute, hour, day, month, week] = parts

    const pad = value => String(value).padStart(2, '0')

    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*' && week === '*') {
      return `执行周期：每天 ${pad(hour)}:${pad(minute)}`
    }

    if (/^\*\/\d+$/.test(minute) && hour === '*' && day === '*' && month === '*' && week === '*') {
      return `执行周期：每 ${minute.slice(2)} 分钟一次`
    }

    if (/^\d+$/.test(minute) && /^\*\/\d+$/.test(hour) && day === '*' && month === '*' && week === '*') {
      return `执行周期：每 ${hour.slice(2)} 小时，在第 ${minute} 分钟执行`
    }

    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(day) && month === '*' && week === '*') {
      return `执行周期：每月 ${day} 日 ${pad(hour)}:${pad(minute)}`
    }

    const weekNames = {
      0: '星期日',
      1: '星期一',
      2: '星期二',
      3: '星期三',
      4: '星期四',
      5: '星期五',
      6: '星期六',
      7: '星期日'
    }

    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*' && weekNames[week]) {
      return `执行周期：每周${weekNames[week]} ${pad(hour)}:${pad(minute)}`
    }

    return `执行周期：按 Cron 表达式 ${parts.join(' ')} 执行`
  }

  function getHDSkyShowupModal() {
    const image = getHDSkyCaptchaImage()

    if (!image) {
      return null
    }

    return image.closest('.layui-layer.layui-layer-page')
  }

  function getHDSkyInput() {
    return document.querySelector('#imagestring')
  }

  function focusHDSkyInput() {
    const input = getHDSkyInput()

    if (!input) {
      return false
    }

    input.scrollIntoView({
      behavior: 'smooth',

      block: 'center'
    })

    input.focus()

    return true
  }

  let hdskySuccessHandling = false

  function getHDSkySuccessResult() {
    const dialogs = document.querySelectorAll('.layui-layer.layui-layer-dialog')

    for (const dialog of dialogs) {
      const title = dialog.querySelector('.layui-layer-title')?.textContent?.trim() || ''

      const content = dialog.querySelector('.layui-layer-content')?.textContent?.replace(/\s+/g, ' ').trim() || ''

      if (!/签到|show\s*up/i.test(title) || !/成功|success/i.test(content)) {
        continue
      }

      const days = content.match(/连续签到\s*(\d+)\s*天/i)?.[1]

      const bonus = content.match(/魔力值加\s*(\d+)/i)?.[1]

      return {
        found: true,

        checked: true,

        status: days ? `成功，已连续签到${days}天` : '签到成功',

        bonus: bonus ? `${bonus} 魔力值` : '',

        element: dialog
      }
    }

    return null
  }

  function watchHDSkySuccessDialog() {
    if (site.id !== 'hdsky') {
      return
    }

    const check = async () => {
      if (hdskySuccessHandling) {
        return
      }

      const result = site?.detectSuccess?.()

      if (!result) {
        return
      }

      hdskySuccessHandling = true

      try {
        updateAttendanceUI(result)

        await handleSuccess(result)
      } catch (error) {
        console.error('[PT HDSky success]', error)
      } finally {
        hdskySuccessHandling = false
      }
    }

    const observer = new MutationObserver(check)

    observer.observe(document.body, {
      childList: true,

      subtree: true,

      characterData: true
    })

    check()
  }

  function waitForHDSkyCaptchaImage(timeout = 10000) {
    return new Promise((resolve, reject) => {
      let done = false

      let interval = null

      let timer = null

      let observer = null

      function cleanup() {
        if (interval) {
          clearInterval(interval)
        }

        if (timer) {
          clearTimeout(timer)
        }

        observer?.disconnect()
      }

      function finish(image) {
        if (done) {
          return
        }

        done = true

        cleanup()

        resolve(image)
      }

      function check() {
        const image = getHDSkyCaptchaImage()

        if (!image) {
          return
        }

        const rect = image.getBoundingClientRect()

        if (rect.width <= 0 || rect.height <= 0) {
          return
        }

        if (image.complete && image.naturalWidth > 0) {
          finish(image)
        }
      }

      check()

      if (done) {
        return
      }

      observer = new MutationObserver(check)

      observer.observe(document.body, {
        childList: true,

        subtree: true,

        attributes: true
      })

      interval = setInterval(check, 100)

      timer = setTimeout(() => {
        if (done) {
          return
        }

        done = true

        cleanup()

        reject(new Error('等待 HDSky 签到验证码弹窗超时'))
      }, timeout)
    })
  }

  /************************************************************
   * OpenCD（皇后）
   ************************************************************/

  function getOpenCDSignInButton() {
    return (
      Array.from(document.querySelectorAll('a[onclick*="signin"]')).find(element =>
        /^[\s\[\]]*[簽签]到[\s\[\]]*$/.test(element.textContent || '')
      ) || null
    )
  }

  function getOpenCDSignInFrame() {
    return document.getElementById('i_signin')
  }

  function getOpenCDFrameDocument() {
    try {
      return getOpenCDSignInFrame()?.contentDocument || null
    } catch (error) {
      console.error('[PT OpenCD] 无法访问签到 iframe', error)

      return null
    }
  }

  function getOpenCDCaptchaImage() {
    return getOpenCDFrameDocument()?.querySelector('#frmSignin img[src*="image.php"]') || null
  }

  function getOpenCDCaptchaInput() {
    return getOpenCDFrameDocument()?.getElementById('imagestring') || null
  }

  function getOpenCDCaptchaImageUrl() {
    const frameDocument = getOpenCDFrameDocument()

    if (!frameDocument) {
      return ''
    }

    /*
     * 优先从隐藏字段读取 imagehash。
     *
     * <input
     *   type="hidden"
     *   name="imagehash"
     *   value="..."
     * >
     */
    const imageHash = frameDocument.querySelector('#frmSignin input[name="imagehash"]')?.value?.trim() || ''

    if (imageHash) {
      return 'https://open.cd/image.php' + '?action=regimage' + `&imagehash=${encodeURIComponent(imageHash)}`
    }

    const image = getOpenCDCaptchaImage()

    if (!image) {
      return ''
    }

    try {
      const url = new URL(image.getAttribute('src') || image.src, 'https://open.cd/')

      const hash = url.searchParams.get('imagehash') || ''

      if (!hash) {
        return ''
      }

      return 'https://open.cd/image.php' + '?action=regimage' + `&imagehash=${encodeURIComponent(hash)}`
    } catch (error) {
      console.error('[PT OpenCD] 解析验证码图片地址失败', error)

      return ''
    }
  }

  function waitForOpenCDCaptcha(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now()

      const timer = setInterval(() => {
        const image = getOpenCDCaptchaImage()

        const input = getOpenCDCaptchaInput()

        if (image && input && image.complete && image.naturalWidth > 0) {
          clearInterval(timer)

          resolve({
            frame: getOpenCDSignInFrame(),

            image,

            input
          })

          return
        }

        if (Date.now() - startedAt >= timeout) {
          clearInterval(timer)

          reject(new Error('等待 OpenCD 签到 iframe 或验证码超时'))
        }
      }, 100)
    })
  }

  async function openOpenCDSignInAndFocus() {
    if (!getOpenCDSignInFrame()) {
      const button = getOpenCDSignInButton()

      if (!button) {
        throw new Error('未找到 OpenCD 签到入口')
      }

      button.click()
    }

    const { input } = await waitForOpenCDCaptcha()

    input.scrollIntoView({
      behavior: 'smooth',

      block: 'center'
    })

    input.focus()
    input.select()

    setRunStatus('OpenCD 验证码已加载，请手动输入后签到', 'warning')

    return true
  }

  let openCDSuccessHandling = false

  let openCDRefreshTimer = null

  function watchOpenCDSuccessState() {
    if (site.id !== 'opencd') {
      return
    }

    const check = async () => {
      if (openCDSuccessHandling) {
        return
      }

      const result = site.detectSuccess()

      if (!result?.checked) {
        return
      }

      openCDSuccessHandling = true

      try {
        if (openCDRefreshTimer) {
          clearTimeout(openCDRefreshTimer)

          openCDRefreshTimer = null
        }

        updateAttendanceUI(result)
        await handleSuccess(result)

        if (sessionStorage.getItem(OPENCD_PENDING_REFRESH_KEY) === '1') {
          sessionStorage.removeItem(OPENCD_PENDING_REFRESH_KEY)

          location.reload()
        }
      } catch (error) {
        console.error('[PT OpenCD success]', error)
      } finally {
        openCDSuccessHandling = false
      }
    }

    const observer = new MutationObserver(check)

    observer.observe(document.body, {
      childList: true,

      subtree: true,

      characterData: true
    })

    check()
  }

  /************************************************************
   * Site Map
   ************************************************************/

  const SITE_MAP = {
    'hhanclub.net': {
      id: 'hhclub',

      name: 'HHCLUB',

      attendanceUrl: 'https://hhanclub.net/attendance.php',

      detect() {
        const today = new Date().getDate()

        const items = document.querySelectorAll('#day-register .calender-sub')

        for (const item of items) {
          const day = item.querySelector('.day-content')

          if (!day) {
            continue
          }

          if (day.classList.contains('last-month-day') || day.classList.contains('next-month-day')) {
            continue
          }

          const displayedDay = Number.parseInt(day.textContent.replace(/\D/g, ''), 10)

          if (displayedDay !== today) {
            continue
          }

          const checkin = item.querySelector('.checkin')

          const button = checkin?.querySelector('button, input[type="button"], input[type="submit"], a') || null

          const buttonText = (button?.textContent || button?.value || '').replace(/\s+/g, '').trim()

          const checkinText = checkin?.textContent?.replace(/\s+/g, '').trim() || ''

          const checked = /(?:已领取|已签到|领取成功)/.test(`${buttonText}${checkinText}`)

          const bonus = item.querySelector('.bonus-info > p')?.textContent?.trim() || ''

          return {
            found: true,

            checked,

            status: checked ? '已签到' : '未签到',

            bonus,

            element: item,

            signInButton: button
          }
        }

        return {
          found: false,

          checked: false,

          status: '未找到今日签到项',

          bonus: ''
        }
      }
    },

    'www.hddolby.com': {
      id: 'hddolby',

      name: 'HDDolby',

      attendanceUrl: 'https://www.hddolby.com/attendance.php',

      detect() {
        const text = document.body?.innerText || ''

        const already = text.includes('您今天已经签到过了，请勿重复刷新。')

        const bonusMatch = text.match(/签到已得\s*(\d+(?:\.\d+)?)/)

        if (already || bonusMatch) {
          return {
            found: true,

            checked: true,

            status: '今日已签到',

            bonus: bonusMatch?.[1] || ''
          }
        }

        return {
          found: Boolean(bonusMatch),

          checked: false,

          status: '未检测到明确签到成功状态',

          bonus: bonusMatch?.[1] || ''
        }
      }
    },

    'u2.dmhy.org': {
      id: 'u2',

      name: 'U2',

      attendanceUrl: 'https://u2.dmhy.org/showup.php',

      detect() {
        const infoBlock = document.querySelector('#info_block')

        const signinLink = infoBlock?.querySelector('a[href*="showup.php"]')

        if (signinLink) {
          const linkText = signinLink.textContent?.trim() || ''

          const checked = /已[簽签]到/.test(linkText)

          return {
            found: true,

            checked: checked,

            status: checked ? '今日已签到' : '今日未签到',

            bonus: '',

            element: signinLink
          }
        }

        const captchaImage = document.querySelector('#showup img[alt="captcha"]')

        if (captchaImage) {
          return {
            found: true,

            checked: false,

            status: '等待验证',

            bonus: '',

            element: captchaImage
          }
        }

        const pageText = document.body?.innerText || ''

        const successText = pageText.match(/(?:签到成功|已(?:经)?签到|今日已签到|成功签到)[^\n]*/i)?.[0]?.trim() || ''

        if (successText) {
          return {
            found: true,

            checked: true,

            status: successText,

            bonus: ''
          }
        }

        return {
          found: false,

          checked: false,

          status: '未找到 U2 签到状态',

          bonus: ''
        }
      }
    },

    'open.cd': {
      id: 'opencd',

      name: 'OpenCD（皇后）',

      attendanceUrl: 'https://open.cd/',

      detect() {
        const infoBars = Array.from(document.querySelectorAll('.infos-bar'))

        const checkedElement = infoBars.find(element => /已[簽签]到/.test(element.textContent || ''))

        const recordLink = getOpenCDSignInRecordLink()

        if (checkedElement || recordLink) {
          return {
            found: true,

            checked: true,

            status: '今日已签到',

            bonus: '',

            element: checkedElement || recordLink
          }
        }

        const frame = getOpenCDSignInFrame()

        if (frame) {
          return {
            found: true,

            checked: false,

            status: '等待输入验证码',

            bonus: '',

            element: frame
          }
        }

        const button = getOpenCDSignInButton()

        if (button) {
          return {
            found: true,

            checked: false,

            status: '等待签到',

            bonus: '',

            element: button
          }
        }

        return {
          found: false,

          checked: false,

          status: '未找到签到入口',

          bonus: ''
        }
      }
    },

    'hdsky.me': {
      id: 'hdsky',

      name: 'HDSky',

      attendanceUrl: 'https://hdsky.me/index.php',

      detect() {
        const userInfoElements = document.querySelectorAll('td.bottom span.medium')

        const checkedElement = Array.from(userInfoElements).find(element =>
          /\[\s*已签到\s*\]/.test(element.textContent || '')
        )

        if (checkedElement) {
          return {
            found: true,

            checked: true,

            status: '今日已签到',

            bonus: '',

            element: checkedElement
          }
        }

        const captcha = getHDSkyCaptchaImage()

        if (captcha) {
          return {
            found: true,

            checked: false,

            status: '等待验证',

            bonus: '',

            element: getHDSkyShowupModal()
          }
        }

        const button = document.querySelector('#showup')

        if (button) {
          return {
            found: true,

            checked: false,

            status: '等待签到',

            bonus: '',

            element: button
          }
        }

        return {
          found: false,

          checked: false,

          status: '未找到签到入口',

          bonus: ''
        }
      },

      async prepareCaptcha() {
        let modal = getHDSkyShowupModal()

        if (modal) {
          await waitForHDSkyCaptchaImage(10000)

          return modal
        }

        const button = document.querySelector('#showup')

        if (!button) {
          throw new Error('未找到 HDSky 签到入口 #showup')
        }

        console.log('[PT AI] 点击 HDSky #showup')

        button.click()

        await waitForHDSkyCaptchaImage(10000)

        modal = getHDSkyShowupModal()

        if (!modal) {
          throw new Error('验证码图片已出现，但未找到签到弹窗')
        }

        await sleep(300)

        return modal
      }
    }
  }

  SITE_MAP['www.open.cd'] = SITE_MAP['open.cd']

  SITE_MAP['www.hdsky.me'] = SITE_MAP['hdsky.me']

  function createHHClubStrategy() {
    const base = SITE_MAP['hhanclub.net']

    return {
      ...base,

      requiresCaptcha: false,

      captcha: null,

      detectStatus() {
        return base.detect()
      },

      async prepareSignin() {
        if (!location.pathname.toLowerCase().endsWith('/attendance.php')) {
          location.href = base.attendanceUrl

          return
        }

        await completePendingHHClubAttendance()
      },

      detectSuccess() {
        const result = base.detect()

        return result.checked ? result : null
      }
    }
  }

  function createHDDolbyStrategy() {
    const base = SITE_MAP['www.hddolby.com']

    return {
      ...base,

      requiresCaptcha: false,

      captcha: null,

      detectStatus() {
        return base.detect()
      },

      async prepareSignin() {
        if (location.href !== base.attendanceUrl) {
          location.href = base.attendanceUrl

          return
        }

        location.reload()
      },

      detectSuccess() {
        const result = base.detect()

        return result.checked ? result : null
      }
    }
  }

  function createU2Strategy() {
    const base = SITE_MAP['u2.dmhy.org']

    let selectedConfirmBtn = null

    const getCaptchaOptions = () =>
      Array.from(document.querySelectorAll('#showup input[type="submit"][name^="captcha_"]'))

    return {
      ...base,

      requiresCaptcha: true,

      captcha: {
        useAI: true,

        get aiPrompt() {
          const options = getCaptchaOptions().map(option => option.value)

          return [
            '识别图片中圆点所在位置对应的动画作品。',
            '只能从以下候选项中选择一个，并且只返回候选项的完整原文，不要解释：',
            ...options.map((option, index) => `${index + 1}. ${option}`)
          ].join('\n')
        },

        async getImageUrl() {
          const image = document.querySelector('#showup img[alt="captcha"]')

          return image?.src ? new URL(image.getAttribute('src'), location.href).href : ''
        },

        getInput() {
          return document.querySelector('textarea[name="message"]')
        },

        captcha(text) {
          const response = String(text || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/["'`]/g, '')
            .trim()

          if (
            !response ||
            /\b(?:error|failed|failure|exception|traceback|429|quota)\b/i.test(response) ||
            /(?:调用失败|请求失败|识别失败|服务异常)/.test(response)
          ) {
            selectedConfirmBtn = null

            return ''
          }

          const options = getCaptchaOptions()

          selectedConfirmBtn =
            options.find(option => response.includes(option.value.trim())) ||
            options.find(option =>
              option.value
                .split('/')
                .map(value => value.trim())
                .filter(value => value.length >= 3)
                .some(value => response.includes(value))
            ) ||
            null

          return selectedConfirmBtn ? '11111111' : ''
        },

        getConfirmBtn() {
          return selectedConfirmBtn
        }
      },

      detectStatus() {
        return base.detect()
      },

      async prepareSignin() {
        if (document.querySelector('#showup img[alt="captcha"]')) {
          return
        }

        const signinLink = document.querySelector('#info_block a[href*="showup.php"]')

        if (signinLink) {
          sessionStorage.setItem(PENDING_ATTENDANCE_KEY, base.id)

          signinLink.click()

          return
        }

        if (!location.pathname.toLowerCase().endsWith('/showup.php')) {
          sessionStorage.setItem(PENDING_ATTENDANCE_KEY, base.id)

          location.href = base.attendanceUrl
        }
      },

      detectSuccess() {
        const result = base.detect()

        return result.checked ? result : null
      }
    }
  }

  function createHDSkyStrategy() {
    const base = SITE_MAP['hdsky.me']

    return {
      ...base,

      requiresCaptcha: true,

      captcha: {
        useAI: true,

        get aiPrompt() {
          return getCurrentAIPrompt()
        },

        async getImageUrl() {
          const imageUrl = getHDSkyCaptchaImageUrl()

          if (!/^https:\/\/hdsky\.me\/image\.php\?[^#]*\bimagehash=/i.test(imageUrl)) {
            throw new Error(`HDSky 验证码地址无效：${imageUrl}`)
          }

          return imageUrl
        },

        getInput() {
          return getHDSkyInput()
        },

        captcha(text) {
          return extractCaptcha(text)
        },

        getConfirmBtn() {
          return document.getElementById('showupbutton')
        }
      },

      detectStatus() {
        return base.detect()
      },

      async prepareSignin() {
        await base.prepareCaptcha()
      },

      detectSuccess() {
        return getHDSkySuccessResult()
      }
    }
  }

  function createOpenCDStrategy() {
    const base = SITE_MAP['open.cd']

    return {
      ...base,

      requiresCaptcha: true,

      captcha: {
        useAI: true,

        get aiPrompt() {
          return getCurrentAIPrompt()
        },

        async getImageUrl() {
          return getOpenCDCaptchaImageUrl()
        },

        getInput() {
          return getOpenCDCaptchaInput()
        },

        captcha(text) {
          return extractCaptcha(text)
        },

        getConfirmBtn() {
          const input = getOpenCDCaptchaInput()

          return input?.parentElement?.querySelector('button#ok') || null
        }
      },

      detectStatus() {
        return base.detect()
      },

      async prepareSignin() {
        if (!getOpenCDSignInFrame()) {
          const entry = getOpenCDSignInButton()

          if (!entry) {
            throw new Error('未找到 OpenCD 签到入口')
          }

          entry.click()
        }

        await waitForOpenCDCaptcha(15000)
      },

      detectSuccess() {
        const result = base.detect()

        return result.checked ? result : null
      }
    }
  }

  const SITE_FACTORY_MAP = {
    'hhanclub.net': createHHClubStrategy,

    'www.hddolby.com': createHDDolbyStrategy,

    'u2.dmhy.org': createU2Strategy,

    'hdsky.me': createHDSkyStrategy,

    'www.hdsky.me': createHDSkyStrategy,

    'open.cd': createOpenCDStrategy,

    'www.open.cd': createOpenCDStrategy
  }

  function validateSiteStrategy(strategy) {
    const requiredMethods = ['detectStatus', 'prepareSignin', 'detectSuccess']

    for (const method of requiredMethods) {
      if (typeof strategy?.[method] !== 'function') {
        throw new Error(`[PT] 站点策略缺少 ${method}()`)
      }
    }

    if (strategy.requiresCaptcha) {
      const requiredCaptchaMethods = ['getImageUrl', 'getInput', 'captcha', 'getConfirmBtn']

      for (const method of requiredCaptchaMethods) {
        if (typeof strategy.captcha?.[method] !== 'function') {
          throw new Error(`[PT] ${strategy.name || strategy.id} 验证码策略缺少 ${method}()`)
        }
      }
    }

    return strategy
  }

  const siteFactory = SITE_FACTORY_MAP[location.hostname]

  const site = siteFactory ? validateSiteStrategy(siteFactory()) : null

  if (!site) {
    return
  }

  function notifyMoviePilot(title, text) {
    const base = normalizeBaseUrl(CONFIG.moviePilot.baseUrl)

    const key = CONFIG.moviePilot.apiKey.trim()

    if (!base || !key) {
      return Promise.reject(new Error('MoviePilot 配置不完整'))
    }

    return gmRequest({
      method: 'POST',

      url: `${base}/api/v1/plugin/MsgNotify/send_json` + `?apikey=${encodeURIComponent(key)}`,

      headers: {
        'Content-Type': 'application/json'
      },

      data: JSON.stringify({
        title,
        text,
        url: location.href
      }),

      timeout: 15000
    }).then(response => {
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`MoviePilot 通知 HTTP ${response.status}`)
      }

      return true
    })
  }

  async function notifyManualSignin(result) {
    const checked = Boolean(result?.checked)

    await notifyMoviePilot(
      `📅 ${site.name} 立即签到`,
      [
        `站点：${site.name}`,
        `当前状态：${checked ? '已签到' : '未签到'}`,
        checked ? '处理：无需重复签到' : '处理：已开始执行立即签到',
        `时间：${formatDateTime(Date.now())}`
      ].join('\n')
    )
  }

  async function notifyCredentialIssue(type, detail, affectsFlow) {
    const warningKey = `${LAST_CREDENTIAL_WARNING_PREFIX}${type}_${getTodayKey()}`

    if (await gmGet(warningKey, false)) {
      return false
    }

    try {
      await notifyMoviePilot(
        affectsFlow ? '🚨 PT 签到脚本凭据异常' : '⚠️ PT 签到脚本凭据告警',
        [`站点：${site.name}`, `类型：${type}`, `详情：${detail}`, `时间：${formatDateTime(Date.now())}`].join('\n')
      )

      await gmSet(warningKey, true)

      return true
    } catch (error) {
      console.error('[PT Credential warning notify]', error)

      return false
    }
  }

  /************************************************************
   * MoviePilot Agent
   ************************************************************/

  function extractAgentText(value) {
    if (value == null) {
      return ''
    }

    if (typeof value === 'string') {
      return value
    }

    if (Array.isArray(value)) {
      return value.map(extractAgentText).filter(Boolean).join('')
    }

    if (typeof value !== 'object') {
      return ''
    }

    for (const key of ['delta', 'text', 'content', 'message', 'answer', 'output']) {
      if (value[key] != null) {
        const text = extractAgentText(value[key])

        if (text) {
          return text
        }
      }
    }

    for (const key of ['data', 'result', 'event']) {
      if (value[key] != null) {
        const text = extractAgentText(value[key])

        if (text) {
          return text
        }
      }
    }

    return ''
  }

  function parseAgentResponse(raw) {
    const source = String(raw || '').trim()

    if (!source) {
      throw new Error('MoviePilot Agent 返回为空')
    }

    console.log('[PT AI RAW]', source)

    if (!source.includes('data:')) {
      try {
        const json = JSON.parse(source)

        return {
          text: extractAgentText(json) || source,

          raw: source
        }
      } catch {
        return {
          text: source,

          raw: source
        }
      }
    }

    const chunks = []

    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim()

      if (!trimmed.startsWith('data:')) {
        continue
      }

      const payload = trimmed.slice(5).trim()

      if (!payload || payload === '[DONE]') {
        continue
      }

      try {
        const json = JSON.parse(payload)

        const text = extractAgentText(json)

        if (text) {
          chunks.push(text)
        }
      } catch {
        chunks.push(payload)
      }
    }

    const clean = []

    for (const item of chunks) {
      if (clean[clean.length - 1] !== item) {
        clean.push(item)
      }
    }

    return {
      text: clean.join('') || 'Agent 已返回，但未解析到文本，请查看控制台。',

      raw: source
    }
  }

  function askMoviePilotAI(imageUrl, prompt) {
    return new Promise((resolve, reject) => {
      const base = normalizeBaseUrl(CONFIG.moviePilot.baseUrl)

      if (!base) {
        reject(new Error('MoviePilot 地址为空'))

        return
      }

      let path = CONFIG.moviePilot.agentPath.trim()

      if (!path.startsWith('/')) {
        path = `/${path}`
      }

      const sessionId = `${CONFIG.moviePilot.sessionPrefix}-${site.id}-${randomId()}`

      const body = {
        session_id: sessionId,

        text: prompt,

        images: [imageUrl]
      }

      const headers = {
        'Content-Type': 'application/json',

        Accept: 'text/event-stream'
      }

      if (CONFIG.moviePilot.agentToken) {
        headers.Authorization = `Bearer ${CONFIG.moviePilot.agentToken}`
      }

      console.log('[PT AI REQUEST]', {
        url: `${base}${path}`,

        prompt,

        imageUrl,

        body
      })

      GM_xmlhttpRequest({
        method: 'POST',

        url: `${base}${path}`,

        headers,

        data: JSON.stringify(body),

        timeout: 120000,

        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            if (response.status === 401 || response.status === 403) {
              gmDelete(MP_AGENT_TOKEN_KEY)

              applyAutomaticToken('mp', '')

              notifyCredentialIssue('MP Agent Token 已失效', `Agent 接口返回 HTTP ${response.status}`, true)
            }

            reject(new Error(`MoviePilot Agent HTTP ${response.status}\n${response.responseText}`))

            return
          }

          try {
            resolve(parseAgentResponse(response.responseText))
          } catch (error) {
            reject(error)
          }
        },

        onerror() {
          reject(new Error('MoviePilot Agent 网络请求失败'))
        },

        ontimeout() {
          reject(new Error('MoviePilot Agent 请求超时'))
        }
      })
    })
  }

  function getOpenCDSignInRecordLink() {
    return (
      Array.from(document.querySelectorAll('a[href*="plugin_sign-in.php"]')).find(element =>
        /查看[簽签]到[記记][錄录]/.test(element.textContent || '')
      ) || null
    )
  }

  function extractCaptcha(text) {
    const value = String(text || '').trim()

    if (
      /\b(?:error|failed|failure|exception|traceback)\b/i.test(value) ||
      /\b(?:429|quota|rate[ -]?limit|too many requests)\b/i.test(value) ||
      /(?:执行失败|调用失败|请求失败|识别失败|发生错误|服务异常)/.test(value)
    ) {
      return ''
    }

    const cleaned = value
      .replace(/```[\s\S]*?```/g, match => match.replace(/```[\w]*\n?/g, '').replace(/```/g, ''))
      .replace(/验证码(?:是|为)?[：:\s]*/gi, '')
      .replace(/["'`]/g, '')
      .trim()

    return cleaned.match(/[a-zA-Z0-9]+/)?.[0] || ''
  }

  function clickSigninButton() {
    const button = site.captcha?.getConfirmBtn()

    if (!button) {
      return false
    }

    button.click()

    if (site.id === 'opencd') {
      sessionStorage.setItem(OPENCD_PENDING_REFRESH_KEY, '1')

      openCDRefreshTimer = setTimeout(() => location.reload(), 2000)
    }

    return true
  }

  async function runCaptchaRecognition() {
    if (!site.requiresCaptcha || !site.captcha) {
      throw new Error(`${site.name} 不需要验证码`)
    }

    if (!site.captcha.useAI) {
      throw new Error(`${site.name} 未开启 AI 验证码识别`)
    }

    await saveSettings(false)

    const button = document.getElementById('pt-ai-shot')

    try {
      button.disabled = true
      button.textContent = '🧩 获取验证码...'

      await site.prepareSignin()

      const imageUrl = await site.captcha.getImageUrl()

      if (!imageUrl) {
        throw new Error('未获取到验证码图片地址')
      }

      const prompt = site.captcha.aiPrompt

      let record = {
        url: imageUrl,

        direct: true,

        site: site.id,

        createdAt: Date.now(),

        aiStatus: 'analyzing',

        aiPrompt: prompt,

        aiResult: '',

        aiUpdatedAt: Date.now()
      }

      await gmSet(getAIImageKey(), record)

      await refreshImageCards()

      button.textContent = '🤖 AI分析中...'

      const response = await askMoviePilotAI(imageUrl, prompt)

      const captcha = site.captcha.captcha(response.text)

      if (!captcha) {
        throw new Error('AI 未返回有效验证码，已停止签到')
      }

      record = {
        ...record,
        aiStatus: 'success',
        aiResult: response.text,
        aiRaw: response.raw,
        aiUpdatedAt: Date.now()
      }

      await gmSet(getAIImageKey(), record)

      await refreshImageCards()

      const input = site.captcha.getInput()

      if (!input) {
        throw new Error('未找到验证码输入框')
      }

      input.value = captcha

      input.dispatchEvent(new Event('input', { bubbles: true }))

      input.dispatchEvent(new Event('change', { bubbles: true }))

      if (!clickSigninButton()) {
        throw new Error('未找到验证码确认按钮')
      }

      setRunStatus('验证码识别完成')

      return record
    } catch (error) {
      const current = await gmGet(getAIImageKey(), null)

      if (current) {
        await gmSet(getAIImageKey(), {
          ...current,
          aiStatus: 'error',
          aiResult: error.message,
          aiUpdatedAt: Date.now()
        })

        await refreshImageCards()
      }

      throw error
    } finally {
      button.disabled = false
      button.textContent = '🧩 验证码图片'
    }
  }

  /************************************************************
   * CSS
   ************************************************************/

  function injectStyle() {
    const style = document.createElement('style')

    style.textContent = `
#pt-attendance-panel,
#pt-attendance-panel * {
    box-sizing: border-box;
}

#pt-attendance-panel {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 2147483646;

    width: 410px;
    max-height: calc(100vh - 36px);

    padding: 15px;

    overflow-y: auto;

    border: 1px solid #eadfd3;
    border-radius: 16px;

    background: rgba(253,248,240,.98);

    box-shadow:
        0 18px 55px
        rgba(40,25,10,.15);

    color: #48372b;

    font-family:
        "PingFang SC",
        "Microsoft YaHei",
        sans-serif;
}

#pt-attendance-panel.pt-collapsed {
    width: 52px;
    height: 52px;
    max-height: none;

    padding: 0;
    overflow: visible;

    border: 0;

    background: transparent;
    box-shadow: none;
}

#pt-attendance-panel.pt-collapsed >
    :not(.pt-collapsed-icon) {
    display: none;
}

.pt-collapsed-icon {
    display: none;
    align-items: center;
    justify-content: center;

    width: 52px;
    height: 52px;

    border: 2px solid rgba(255,255,255,.9);
    border-radius: 50%;

    background:
        linear-gradient(
            135deg,
            #f3a34a,
            #e27d25
        );

    box-shadow:
        0 8px 24px
        rgba(73,45,18,.28);

    cursor: grab;
    object-fit: cover;
    touch-action: none;
    user-select: none;
    -webkit-user-drag: none;
}

#pt-attendance-panel.pt-collapsed
    .pt-collapsed-icon {
    display: block;
}

.pt-collapsed-icon:active {
    cursor: grabbing;
}

.pt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-bottom: 10px;
}

.pt-collapse-btn {
    width: 28px;
    height: 28px;

    padding: 0;

    border: 1px solid #decfbe;
    border-radius: 8px;

    background: white;
    color: #856e5a;

    cursor: pointer;
    font-size: 14px;
}

.pt-title {
    font-size: 15px;
    font-weight: 800;
}

.pt-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pt-title-logo {
    width: 30px;
    height: 30px;

    border-radius: 50%;

    object-fit: cover;
}

.pt-version {
    margin-top: 3px;

    color: #ad9682;

    font-size: 9px;
}

.pt-status {
    padding: 5px 9px;

    border-radius: 99px;

    background: #edf8e9;

    color: #55963f;

    font-size: 9px;
    font-weight: 700;
}

.pt-status[data-type="warning"] {
    background: #fff4e4;
    color: #ca8738;
}

.pt-status[data-type="error"] {
    background: #ffeded;
    color: #cf5650;
}

.pt-grid {
    display: grid;

    grid-template-columns:
        1fr 1fr 1fr;

    gap: 7px;
}

.pt-stat {
    padding: 9px;

    border: 1px solid #eadfd3;
    border-radius: 9px;

    background: white;
}

.pt-stat small {
    display: block;

    color: #aa927f;

    font-size: 8px;
}

.pt-stat strong {
    display: block;

    margin-top: 4px;

    overflow: hidden;

    white-space: nowrap;
    text-overflow: ellipsis;

    font-size: 10px;
}

.pt-countdown {
    margin-top: 8px;
    padding: 10px;

    border-radius: 10px;

    background:
        linear-gradient(
            135deg,
            #fff2de,
            #f7e1c2
        );

    text-align: center;
}

.pt-countdown small {
    color: #9a8069;

    font-size: 8px;
}

.pt-countdown strong {
    display: block;

    margin-top: 2px;

    color: #d78231;

    font-size: 23px;
}

.pt-section {
    margin-top: 9px;
    padding: 11px;

    border: 1px solid #eadfd3;
    border-radius: 11px;

    background: white;
}

.pt-section-title {
    margin-bottom: 8px;

    font-size: 10px;
    font-weight: 800;
}

.pt-label {
    display: block;

    margin: 7px 0 4px;

    color: #967e6b;

    font-size: 8px;
}

.pt-checkbox {
    display: flex;
    align-items: center;
    gap: 7px;

    margin-bottom: 9px;

    color: #6e5745;

    cursor: pointer;
    font-size: 10px;
}

.pt-checkbox input {
    width: 15px;
    height: 15px;

    margin: 0;

    accent-color: #d78231;
}

.pt-input,
.pt-textarea,
.pt-ai-card-prompt {
    width: 100%;

    border: 1px solid #dfd2c4;
    border-radius: 7px;

    outline: none;

    background: white;

    color: #49372a;

    font-size: 10px;
}

.pt-input {
    height: 33px;

    padding: 0 9px;
}

.pt-textarea,
.pt-ai-card-prompt {
    min-height: 70px;

    padding: 8px;

    resize: vertical;

    line-height: 1.5;
}

.pt-ai-card-prompt {
    border-color: #d9d0f1;

    color: #514675;
}

.pt-row {
    display: grid;

    grid-template-columns:
        1fr 1fr;

    gap: 7px;
}

.pt-actions {
    display: grid;

    grid-template-columns:
        1fr 1fr;

    gap: 7px;

    margin-top: 10px;
}

.pt-btn {
    min-height: 34px;

    border: 1px solid #decfbe;
    border-radius: 8px;

    background: #faf4ec;

    color: #7e6754;

    cursor: pointer;

    font-size: 9px;
    font-weight: 700;
}

.pt-btn:disabled {
    cursor: default;

    opacity: .55;
}

.pt-primary {
    border: none;

    background:
        linear-gradient(
            135deg,
            #f3a34a,
            #e68a30
        );

    color: white;
}

.pt-ai {
    border: none;

    background:
        linear-gradient(
            135deg,
            #7355de,
            #5940bb
        );

    color: white;
}

.pt-result {
    margin-top: 9px;
    padding: 10px;

    border: 1px solid #e7dbce;
    border-radius: 10px;

    background: white;
}

.pt-result.ai {
    border-color: #ddd6f5;

    background: #faf8ff;
}

.pt-result-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.pt-copy-image-url {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #ddd6f5;
    border-radius: 7px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
}

.pt-copy-image-url:hover {
    background: #f0ebff;
}

.pt-result img {
    display: block;

    width: 100%;
    max-height: 210px;

    margin-top: 7px;

    border-radius: 7px;

    object-fit: contain;

    cursor: pointer;
}

.pt-url {
    margin-top: 7px;
    padding: 6px;

    overflow: hidden;

    border-radius: 6px;

    background: #f5efe8;

    white-space: nowrap;
    text-overflow: ellipsis;

    font-family: monospace;
    font-size: 8px;
}

.pt-result-actions,
.pt-ai-card-actions {
    display: flex;

    gap: 5px;

    margin-top: 6px;
}

.pt-small-btn {
    flex: 1;

    min-height: 28px;

    border: 1px solid #ddcfc0;
    border-radius: 6px;

    background: white;

    color: #7e6856;

    cursor: pointer;

    font-size: 8px;
}

.pt-ai-label {
    margin: 9px 0 4px;

    color: #75679a;

    font-size: 9px;
    font-weight: 800;
}

.pt-ai-output {
    max-height: 180px;

    margin-top: 4px;
    padding: 9px;

    border: 1px solid #e2dbf7;
    border-radius: 7px;

    background: white;

    color: #514675;

    font-size: 10px;
    line-height: 1.65;

    overflow-y: auto;

    white-space: pre-wrap;
    word-break: break-word;
}

.pt-icon-btn {
    min-width: 34px;
    padding: 7px 9px;
    font-size: 16px;
    line-height: 1;
}

.pt-cron-description {
    display: block;
    margin-top: 6px;
    color: #667085;
    font-size: 12px;
    line-height: 1.45;
}

.pt-cron-description.pt-error {
    color: #d92d20;
}

.pt-captcha-test {
    display: flex;
    gap: 6px;

    margin-top: 5px;
}

.pt-captcha-test .pt-input {
    flex: 1;
    min-width: 0;
}

.pt-captcha-test .pt-small-btn {
    flex: 0 0 62px;
}
        `

    document.head.appendChild(style)
  }

  /************************************************************
   * UI
   ************************************************************/

  function bindPanelCollapseAndDrag(panel) {
    const collapseButton = panel.querySelector('#pt-collapse-panel')

    const icon = panel.querySelector('#pt-collapsed-icon')

    let iconPosition = null

    let dragging = false

    let moved = false

    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0

    const positionReady = gmGet(PANEL_ICON_POSITION_KEY, null).then(value => {
      if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) {
        iconPosition = value
      }
    })

    const applyPosition = position => {
      const maxLeft = Math.max(0, window.innerWidth - 52)

      const maxTop = Math.max(0, window.innerHeight - 52)

      const left = Math.min(maxLeft, Math.max(0, position?.left ?? maxLeft - 18))

      const top = Math.min(maxTop, Math.max(0, position?.top ?? 18))

      panel.style.left = `${left}px`

      panel.style.top = `${top}px`

      panel.style.right = 'auto'

      iconPosition = {
        left,
        top
      }
    }

    const expandPanel = () => {
      panel.classList.remove('pt-collapsed')

      panel.style.left = 'auto'

      panel.style.top = '18px'

      panel.style.right = '18px'
    }

    collapseButton.onclick = async () => {
      await positionReady

      panel.classList.add('pt-collapsed')

      applyPosition(iconPosition)
    }

    icon.addEventListener('pointerdown', event => {
      dragging = true

      moved = false

      startX = event.clientX

      startY = event.clientY

      const rect = panel.getBoundingClientRect()

      originLeft = rect.left

      originTop = rect.top

      icon.setPointerCapture(event.pointerId)

      event.preventDefault()
    })

    icon.addEventListener('pointermove', event => {
      if (!dragging) {
        return
      }

      const deltaX = event.clientX - startX

      const deltaY = event.clientY - startY

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        moved = true
      }

      applyPosition({
        left: originLeft + deltaX,

        top: originTop + deltaY
      })
    })

    const finishDrag = async event => {
      if (!dragging) {
        return
      }

      dragging = false

      if (icon.hasPointerCapture(event.pointerId)) {
        icon.releasePointerCapture(event.pointerId)
      }

      if (moved) {
        await gmSet(PANEL_ICON_POSITION_KEY, iconPosition)

        return
      }

      expandPanel()
    }

    icon.addEventListener('pointerup', finishDrag)

    icon.addEventListener('pointercancel', finishDrag)
  }

  function createPanel() {
    document.getElementById('pt-attendance-panel')?.remove()

    const panel = document.createElement('div')

    panel.id = 'pt-attendance-panel'

    panel.innerHTML = `
<img
    id="pt-collapsed-icon"
    class="pt-collapsed-icon"
    src="${escapeHtml(CONFIG.logoUrl)}"
    alt="PT 助手"
    draggable="false"
    title="点击展开，拖动调整位置"
/>

<div class="pt-header">

    <div class="pt-title-row">

        <img
            class="pt-title-logo"
            src="${escapeHtml(CONFIG.logoUrl)}"
            alt="PT 助手"
        />

        <div>

        <div class="pt-title">
            ${escapeHtml(site.name)} PT助手
        </div>

        <div class="pt-version">
            v${VERSION}
        </div>

        </div>

    </div>

    <div
        id="pt-run-status"
        class="pt-status"
    >
        初始化
    </div>

    <button
        id="pt-collapse-panel"
        class="pt-collapse-btn"
        type="button"
        title="收起卡片"
    >
        −
    </button>

</div>
<div class="pt-grid">

    <div class="pt-stat">
        <small>签到状态</small>

        <strong id="pt-today-status">
            未签到
        </strong>
    </div>

    <div class="pt-stat">
        <small>奖励</small>

        <strong id="pt-bonus">
            -
        </strong>
    </div>

    <div class="pt-stat">
        <small>下次执行</small>

        <strong id="pt-next-run">
            -
        </strong>
    </div>

</div>


<div class="pt-countdown">

    <small>
        距离下一次 Cron
    </small>

    <strong id="pt-countdown">
        --:--:--
    </strong>

</div>


<div class="pt-section">

    <div class="pt-section-title">
        ⏰ Cron
    </div>

    <label class="pt-checkbox">
        <input
            id="pt-auto-attendance"
            type="checkbox"
            ${CONFIG.autoAttendance ? 'checked' : ''}
        />

        自动签到
    </label>

    <input
        id="pt-cron"
        class="pt-input"
        value="${escapeHtml(CONFIG.cron)}"
    />

    <small
        id="pt-cron-description"
        class="pt-cron-description"
    ></small>

</div>


<div class="pt-section">

    <div class="pt-section-title">
        🤖 MoviePilot
    </div>

    <label class="pt-label">
        地址
    </label>

    <input
        id="pt-mp-url"
        class="pt-input"
        value="${escapeHtml(CONFIG.moviePilot.baseUrl)}"
    />

    <label class="pt-label">
        Agent Path
    </label>

    <input
        id="pt-agent-path"
        class="pt-input"
        value="${escapeHtml(CONFIG.moviePilot.agentPath)}"
    />

    <label class="pt-label">
        Agent Bearer Token
    </label>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;">
        <input
            id="pt-agent-token"
            class="pt-input"
            type="text"
            readonly
            placeholder=""
            value="${CONFIG.moviePilot.agentToken ? '✅ 获取成功' : ''}"
        />

        <button
            id="pt-sync-mp-token"
            class="pt-small-btn pt-icon-btn"
            type="button"
            title="同步 Agent Token"
            aria-label="同步 Agent Token"
        >
            🔄
        </button>
    </div>

    <label class="pt-label">
        MsgNotify API Key
    </label>

    <input
        id="pt-mp-key"
        class="pt-input"
        type="password"
        value="${escapeHtml(CONFIG.moviePilot.apiKey)}"
    />

</div>


<div class="pt-actions">

    <button
        id="pt-save"
        class="pt-btn pt-primary"
    >
        💾 保存
    </button>

    <button
        id="pt-sign-now"
        class="pt-btn pt-primary"
    >
        ✍️ 立刻签到
    </button>

    ${
      site.requiresCaptcha
        ? `
    <button
        id="pt-ai-shot"
        class="pt-btn pt-ai"
    >
        🧩 验证码图片
    </button>
              `
        : ''
    }

</div>


${site.requiresCaptcha ? '<div id="pt-ai-result"></div>' : ''}
        `

    document.body.appendChild(panel)

    bindPanelCollapseAndDrag(panel)

    bindEvents()

    updateCronDescription()
  }

  function setRunStatus(text, type = 'success') {
    const element = document.getElementById('pt-run-status')

    if (!element) {
      return
    }

    element.textContent = text

    element.dataset.type = type
  }

  function updateAttendanceUI(result) {
    const status = document.getElementById('pt-today-status')

    const bonus = document.getElementById('pt-bonus')

    status.textContent = result.checked ? '已签到' : '未签到'

    bonus.textContent = result.bonus || '-'
  }

  function updateNextRun() {
    const nextRunElement = document.getElementById('pt-next-run')

    const countdownElement = document.getElementById('pt-countdown')

    if (!nextRunElement || !countdownElement) {
      return
    }

    try {
      const next = getNextOccurrence(CONFIG.cron)

      nextRunElement.textContent = formatDateTime(next)

      countdownElement.textContent = formatCountdown(next.getTime() - Date.now())
    } catch (error) {
      nextRunElement.textContent = 'Cron 无效'

      countdownElement.textContent = '--:--:--'

      console.error('[PT Cron countdown]', error)
    }
  }

  function updateCronDescription() {
    const input = document.getElementById('pt-cron')

    const description = document.getElementById('pt-cron-description')

    if (!input || !description) {
      return
    }

    try {
      description.textContent = describeCron(input.value)

      description.classList.remove('pt-error')
    } catch (error) {
      description.textContent = `执行周期：Cron 表达式无效（${error.message}）`

      description.classList.add('pt-error')
    }
  }

  /************************************************************
   * Settings
   ************************************************************/

  async function saveSettings(alertUser = true) {
    CONFIG.autoAttendance = document.getElementById('pt-auto-attendance').checked

    CONFIG.cron = document.getElementById('pt-cron').value.trim()

    parseCron(CONFIG.cron)

    CONFIG.moviePilot.baseUrl = document.getElementById('pt-mp-url').value.trim()

    CONFIG.moviePilot.agentPath = document.getElementById('pt-agent-path').value.trim()

    CONFIG.moviePilot.apiKey = document.getElementById('pt-mp-key').value.trim()

    /*
     * 如果 AI 卡片已经渲染，
     * 同时保存卡片 Prompt。
     */
    const prompt = document.getElementById('pt-ai-card-prompt')

    if (prompt?.value != null) {
      setSitePrompt(prompt.value)
    }

    await gmSet(SETTINGS_KEY, CONFIG)

    updateNextRun()

    if (alertUser) {
      alert('设置已保存')
    }
  }

  /************************************************************
   * Result Cards
   ************************************************************/

  async function refreshImageCards() {
    if (!site.requiresCaptcha) {
      return
    }

    const ai = await gmGet(getAIImageKey(), null)

    renderImageCard('pt-ai-result', ai?.site === site.id ? ai : null, true)
  }

  function renderImageCard(containerId, image, isAI) {
    const box = document.getElementById(containerId)

    if (!box) {
      return
    }

    /*
     * AI 卡片即使暂时没图片，
     * 也显示 Prompt。
     */
    if (isAI && !image) {
      box.innerHTML = `
<div class="pt-result ai">

    <strong>
        🤖 AI 设置
    </strong>

    <div class="pt-ai-label">
        AI Prompt
    </div>

    <textarea
        id="pt-ai-card-prompt"
        class="pt-ai-card-prompt"
    >${escapeHtml(site.captcha?.aiPrompt || getSitePrompt())}</textarea>

    <div class="pt-ai-card-actions">

        <button
            data-action="save-prompt"
            class="pt-small-btn"
        >
            💾 保存 Prompt
        </button>

        ${
          site.requiresCaptcha
            ? `
        <button
            data-action="focus-input"
            class="pt-small-btn"
        >
            ⌨ 聚焦输入框
        </button>
                `
            : ''
        }

    </div>

</div>
            `

      bindAICardActions(box)

      return
    }

    if (!image?.url) {
      box.innerHTML = ''

      return
    }

    box.innerHTML = `
<div class="pt-result ${isAI ? 'ai' : ''}">

    <div class="pt-result-title">
        <strong>
            🧩 验证码图片
        </strong>

        <button
            data-action="copy-image-url"
            class="pt-copy-image-url"
            type="button"
            title="复制验证码图片 URL"
            aria-label="复制验证码图片 URL"
        >
            📋
        </button>
    </div>

    <img
        src="${escapeHtml(image.url)}"
        alt="验证码图片"
    />

    ${
      isAI
        ? `
<div class="pt-ai-label">
    AI Prompt
</div>

<textarea
    id="pt-ai-card-prompt"
    class="pt-ai-card-prompt"
>${escapeHtml(image.aiPrompt || getSitePrompt())}</textarea>

<div class="pt-ai-card-actions">

    <button
        data-action="save-prompt"
        class="pt-small-btn"
    >
        💾 保存 Prompt
    </button>

    ${
      site.requiresCaptcha
        ? `
    <button
        data-action="focus-input"
        class="pt-small-btn"
    >
        ⌨ 聚焦输入框
    </button>
            `
        : ''
    }

</div>


<div class="pt-ai-label">
    AI 返回
</div>

<div class="pt-ai-output">${escapeHtml(
            image.aiStatus === 'analyzing' ? 'MoviePilot AI 分析中……' : image.aiResult || '暂无 AI 结果'
          )}</div>

<div class="pt-ai-label">
    验证码
</div>

<div class="pt-captcha-test">
    <input
        id="pt-ai-captcha"
        class="pt-input"
        type="text"
        autocomplete="off"
        placeholder="AI 提取或手动输入"
        value="${escapeHtml(image.aiStatus === 'success' ? extractCaptcha(image.aiResult) : '')}"
    />

    <button
        data-action="confirm-captcha"
        class="pt-small-btn"
    >
        确定
    </button>
</div>
            `
        : ''
    }

</div>
        `

    if (isAI) {
      bindAICardActions(box)
    }
  }

  function bindAICardActions(box) {
    const copyImageUrl = box.querySelector('[data-action="copy-image-url"]')

    if (copyImageUrl) {
      copyImageUrl.onclick = async () => {
        const imageUrl = box.querySelector('img')?.src || ''

        if (!imageUrl) {
          setRunStatus('未找到验证码图片 URL', 'error')

          return
        }

        try {
          await copyTextToClipboard(imageUrl)

          copyImageUrl.textContent = '✅'

          setRunStatus('图片 URL 已复制')

          setTimeout(() => {
            copyImageUrl.textContent = '📋'
          }, 1200)
        } catch (error) {
          console.error('[PT Copy image URL]', error)

          setRunStatus('复制图片 URL 失败', 'error')
        }
      }
    }

    const savePrompt = box.querySelector('[data-action="save-prompt"]')

    if (savePrompt) {
      savePrompt.onclick = async () => {
        const textarea = box.querySelector('#pt-ai-card-prompt')

        if (!textarea) {
          return
        }

        setSitePrompt(textarea.value)

        await gmSet(SETTINGS_KEY, CONFIG)

        setRunStatus('Prompt 已保存')
      }
    }

    const focus = box.querySelector('[data-action="focus-input"]')

    if (focus) {
      focus.onclick = async () => {
        try {
          await site.prepareSignin()

          const input = site.captcha?.getInput()

          if (!input) {
            throw new Error('未找到验证码输入框')
          }

          input.scrollIntoView({
            behavior: 'smooth',

            block: 'center'
          })

          input.focus()
          input.select()
        } catch (error) {
          alert(error.message)
        }
      }
    }

    const confirmCaptcha = box.querySelector('[data-action="confirm-captcha"]')

    if (confirmCaptcha) {
      confirmCaptcha.onclick = () => {
        const captcha = box.querySelector('#pt-ai-captcha')?.value.trim() || ''

        if (!captcha) {
          setRunStatus('验证码为空，已停止签到', 'error')

          alert('验证码为空，请先输入有效验证码')

          return
        }

        const siteInput = site.captcha?.getInput()

        if (!siteInput) {
          setRunStatus('未找到验证码输入框', 'error')

          return
        }

        siteInput.value = captcha

        siteInput.dispatchEvent(
          new Event('input', {
            bubbles: true
          })
        )

        siteInput.dispatchEvent(
          new Event('change', {
            bubbles: true
          })
        )

        if (clickSigninButton()) {
          setRunStatus('已点击签到按钮')
        } else {
          setRunStatus('未找到签到按钮', 'error')
        }
      }
    }
  }

  function applyAutomaticToken(_kind, token) {
    const value = String(token || '').trim()

    CONFIG.moviePilot.agentToken = value

    const input = document.getElementById('pt-agent-token')

    if (input) {
      input.value = value
    }
  }

  function bindAutomaticTokenListeners() {
    if (typeof GM_addValueChangeListener === 'undefined') {
      return
    }

    GM_addValueChangeListener(MP_AGENT_TOKEN_KEY, (_key, _oldValue, newValue) => {
      applyAutomaticToken('mp', newValue)
    })
  }

  async function refreshAutomaticToken(kind) {
    const origin = MP_PROXY_ORIGIN

    const storageKey = MP_AGENT_TOKEN_KEY

    /*
     * 先发起旧值清理，再在第一个 await 之前打开页面，
     * 既避免新页面写入的 Token 被随后删除，
     * 也避免浏览器把窗口当作弹窗拦截。
     */
    const clearStoredToken = gmDelete(storageKey)

    window.open(origin, '_blank', 'noopener')

    await clearStoredToken

    applyAutomaticToken(kind, '')

    setRunStatus('正在从 MP 代理同步 Token……')

    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(1000)

      const token = await gmGet(storageKey, '')

      if (token) {
        applyAutomaticToken(kind, token)

        setRunStatus('MP Agent Token 同步成功')

        return true
      }
    }

    const type = 'MP Agent Token 未获取到'

    setRunStatus(`${type}，请确认源站已登录`)

    await notifyCredentialIssue(type, '刷新同步后仍未从 localStorage.auth 取得 Token', true)

    return false
  }

  /************************************************************
   * Events
   ************************************************************/

  function bindEvents() {
    document.getElementById('pt-cron').addEventListener('input', updateCronDescription)

    document.getElementById('pt-sync-mp-token').onclick = () => {
      refreshAutomaticToken('mp')
    }

    document.getElementById('pt-save').onclick = async () => {
      try {
        await saveSettings()
      } catch (error) {
        alert(error.message)
      }
    }

    document.getElementById('pt-sign-now').onclick = async () => {
      try {
        await saveSettings(false)

        const result = await applyAttendanceCache(site.detectStatus())

        updateAttendanceUI(result)

        let notified = false

        try {
          await notifyManualSignin(result)

          notified = true
        } catch (error) {
          console.error('[PT Manual signin notify]', error)

          setRunStatus(`立即签到通知失败：${error.message}`, 'error')

          alert(`立即签到通知失败：${error.message}\n将继续执行签到。`)
        }

        if (result.checked) {
          setRunStatus(notified ? '已签到，状态通知已发送' : '已签到，但状态通知失败', notified ? 'success' : 'error')

          return
        }

        setRunStatus('正在打开签到入口', 'warning')

        if (site.requiresCaptcha) {
          await site.prepareSignin()

          setRunStatus('签到验证码已打开', 'warning')

          return
        }

        if (site.id === 'hhclub') {
          sessionStorage.setItem(PENDING_ATTENDANCE_KEY, site.id)
        }

        await site.prepareSignin()
      } catch (error) {
        setRunStatus(`立即签到失败：${error.message}`, 'error')

        alert(`立即签到失败：${error.message}`)
      }
    }

    const aiButton = document.getElementById('pt-ai-shot')

    if (aiButton) {
      aiButton.onclick = async () => {
        try {
          await runCaptchaRecognition()
        } catch (error) {
          alert(`验证码识别失败：${error.message}`)
        }
      }
    }
  }

  /************************************************************
   * Attendance
   ************************************************************/

  async function cacheAttendanceSuccess(result) {
    const cache = await gmGet(LAST_ATTENDANCE_SUCCESS_KEY, {})

    cache[site.id] = {
      date: getTodayKey(),

      timestamp: Date.now(),

      status: result.status || '今日已签到',

      bonus: result.bonus || ''
    }

    await gmSet(LAST_ATTENDANCE_SUCCESS_KEY, cache)
  }

  async function applyAttendanceCache(result) {
    if (result.checked || result.found) {
      return result
    }

    const cache = await gmGet(LAST_ATTENDANCE_SUCCESS_KEY, {})

    const cached = cache?.[site.id]

    if (!cached || cached.date !== getTodayKey() || !isToday(cached.timestamp)) {
      return result
    }

    return {
      found: true,

      checked: true,

      status: '今日已签到（缓存）',

      bonus: cached.bonus || '',

      cached: true,

      timestamp: cached.timestamp
    }
  }

  async function completePendingHHClubAttendance() {
    if (
      site.id !== 'hhclub' ||
      !location.pathname.toLowerCase().endsWith('/attendance.php') ||
      sessionStorage.getItem(PENDING_ATTENDANCE_KEY) !== site.id
    ) {
      return false
    }

    try {
      let result = site.detectStatus()

      if (result.checked) {
        updateAttendanceUI(result)

        await handleSuccess(result)

        return true
      }

      const signInButton = result.signInButton || result.element?.querySelector('.checkin button')

      if (!signInButton) {
        throw new Error('未找到 HHCLUB 今日签到按钮')
      }

      setRunStatus('正在执行 HHCLUB 签到', 'warning')

      signInButton.click()

      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(500)

        result = site.detectStatus()

        if (result.checked) {
          updateAttendanceUI(result)

          await handleSuccess(result)

          return true
        }
      }

      /*
       * HHCLUB 的签到请求可能只更新服务端，
       * 而不更新当前日历 DOM。刷新后由 init()
       * 重新读取服务端状态并进入成功通知流程。
       */
      setRunStatus('正在刷新确认 HHCLUB 签到结果', 'warning')

      sessionStorage.removeItem(PENDING_ATTENDANCE_KEY)

      location.reload()

      return true
    } finally {
      sessionStorage.removeItem(PENDING_ATTENDANCE_KEY)
    }
  }

  async function completePendingCaptchaAttendance() {
    if (!site.requiresCaptcha || sessionStorage.getItem(PENDING_ATTENDANCE_KEY) !== site.id) {
      return false
    }

    try {
      const result = site.detectStatus()

      if (result.checked) {
        await handleSuccess(result)

        return true
      }

      setRunStatus(`正在识别 ${site.name} 签到验证码`, 'warning')

      await runCaptchaRecognition()

      return true
    } finally {
      sessionStorage.removeItem(PENDING_ATTENDANCE_KEY)
    }
  }

  async function inspectAttendance() {
    await sleep(700)

    const result = await applyAttendanceCache(site.detectStatus())

    updateAttendanceUI(result)

    if (result.cached) {
      return
    }

    /*
     * HDSky 只有检测到明确的 [已签到] 标识时
     * 才进入成功流程，不能仅根据 #showup 消失判断。
     */
    if (site.id === 'hdsky' && !result.checked) {
      return
    }

    if (result.checked) {
      await handleSuccess(result)
    }
  }

  async function handleSuccess(result) {
    await cacheAttendanceSuccess(result)

    const key = LAST_NOTIFY_PREFIX + site.id

    if ((await gmGet(key, '')) === getTodayKey()) {
      return
    }

    try {
      await notifyMoviePilot(
        `✅ ${site.name} 签到成功`,

        [
          `${site.name} 今日签到完成`,
          `时间：${formatDateTime(Date.now())}`,
          `状态：${result.status}`,

          result.bonus ? `奖励：${result.bonus}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      )

      await gmSet(key, getTodayKey())
    } catch (error) {
      console.error('[PT Notify]', error)

      setRunStatus(`签到成功，但 MoviePilot 通知失败：${error.message}`, 'error')
    }
  }

  /************************************************************
   * Scheduler
   ************************************************************/

  async function schedulerTick() {
    const now = Date.now()

    /*
     * 每个站点必须拥有独立的调度水位。
     * 油猴存储在同一脚本的多个域名间共享，
     * 共用一个 key 会导致第一个标签页吞掉其他站点的 Cron。
     */
    const schedulerCheckKey = `${LAST_SCHEDULER_CHECK_KEY}_${site.id}`

    const triggerStorageKey = `${LAST_TRIGGER_KEY}_${site.id}`

    if (!CONFIG.autoAttendance) {
      await gmSet(schedulerCheckKey, now)

      return
    }

    let last = await gmGet(schedulerCheckKey, now)

    if (typeof last !== 'number') {
      last = now
    }

    await gmSet(schedulerCheckKey, now)

    const occurrence = findOccurrence(CONFIG.cron, last, now)

    if (!occurrence) {
      return
    }

    const triggerKey = `${site.id}:${minuteKey(occurrence)}`

    if ((await gmGet(triggerStorageKey, '')) === triggerKey) {
      return
    }

    await gmSet(triggerStorageKey, triggerKey)

    /*
     * 跳转只是调度的第一步。记下待办状态，
     * 让目标页加载后继续点击签到或识别验证码。
     */
    if (site.id === 'hhclub' || site.requiresCaptcha) {
      sessionStorage.setItem(PENDING_ATTENDANCE_KEY, site.id)
    }

    location.href = site.attendanceUrl
  }

  /************************************************************
   * Init
   ************************************************************/

  async function init() {
    console.log(`[PT] v${VERSION}`, site.name)

    injectStyle()

    createPanel()

    bindAutomaticTokenListeners()

    if (!CONFIG.moviePilot.agentToken) {
      await notifyCredentialIssue('MP Agent Token 未获取到', '未能从 MP 代理 localStorage.auth 自动取得 Token', true)
    }

    await refreshImageCards()

    watchHDSkySuccessDialog()

    watchOpenCDSuccessState()

    await completePendingHHClubAttendance().catch(error => {
      console.error('[PT HHCLUB signin]', error)

      setRunStatus('HHCLUB 签到失败', 'error')
    })

    await completePendingCaptchaAttendance().catch(error => {
      console.error(`[PT ${site.name} captcha signin]`, error)

      setRunStatus(`${site.name} 签到失败`, 'error')
    })

    await inspectAttendance().catch(error => console.error('[PT inspect]', error))

    updateNextRun()

    setInterval(updateNextRun, 1000)

    setInterval(
      () => {
        schedulerTick().catch(error => console.error('[PT scheduler]', error))
      },

      SCHEDULER_INTERVAL
    )

    schedulerTick().catch(error => console.error('[PT scheduler]', error))
  }

  init().catch(error => console.error('[PT init]', error))
  console.log(22)
})()
