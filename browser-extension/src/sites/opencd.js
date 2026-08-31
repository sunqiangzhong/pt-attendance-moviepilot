import { getCaptcha, setInput, waitFor } from './common.js'

function getEntry() {
  return Array.from(document.querySelectorAll('a[onclick*="signin"]')).find(element =>
    /^[\s\[\]]*[簽签]到[\s\[\]]*$/.test(element.textContent || '')
  ) || null
}

function getFrame() {
  return document.getElementById('i_signin')
}

function getDoc() {
  try { return getFrame()?.contentDocument || null } catch { return null }
}

function detectStatus() {
  const checked = Array.from(document.querySelectorAll('.infos-bar')).some(element => /已[簽签]到/.test(element.textContent || ''))
  const record = Array.from(document.querySelectorAll('a[href*="plugin_sign-in.php"]')).some(element => /查看[簽签]到[記记][錄录]/.test(element.textContent || ''))
  return { checked: checked || record, status: checked || record ? '签到成功' : '未签到', bonus: '' }
}

function getImageUrl() {
  const doc = getDoc()
  const hash = doc?.querySelector('#frmSignin input[name="imagehash"]')?.value?.trim() || ''
  if (hash) return `https://open.cd/image.php?action=regimage&imagehash=${encodeURIComponent(hash)}`
  const image = doc?.querySelector('#frmSignin img[src*="image.php"]')
  return image ? new URL(image.getAttribute('src') || image.src, 'https://open.cd/').href : ''
}

export default {
  id: 'opencd',
  hosts: ['open.cd', 'www.open.cd'],

  async run(task, ctx) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }
    if (task.stage === 'submitted') {
      if ((task.steps || 0) < 6) return { action: 'wait', step: 'submitted', delay: 1200 }
      if ((task.reloads || 0) < 1) return { action: 'reload' }
      return { action: 'failure', error: '等待 OpenCD 签到成功状态超时' }
    }

    if (!getFrame()) {
      const entry = getEntry()
      if (!entry) return { action: 'navigate', url: 'https://open.cd/' }
      entry.click()
    }
    await waitFor(() => {
      const doc = getDoc()
      const image = doc?.querySelector('#frmSignin img[src*="image.php"]')
      const input = doc?.getElementById('imagestring')
      return image?.complete && image?.naturalWidth > 0 && input ? { image, input } : null
    }, 15000)

    const config = await chrome.storage.local.get('config')
    const prompt = config.config?.sites?.opencd?.prompt || '识别图片中的字母和数字验证码，只返回验证码。'
    const captcha = getCaptcha(await ctx.askAgent(getImageUrl(), prompt))
    const input = getDoc()?.getElementById('imagestring')
    const confirm = input?.closest('form')?.querySelector('button#ok, input#ok, button[type="submit"], input[type="submit"]')
    if (!captcha || !input || !confirm) return { action: 'failure', error: 'OpenCD 验证码识别或页面元素无效' }
    setInput(input, captcha)
    confirm.click()
    return { action: 'wait', step: 'submitted', delay: 1200 }
  }
}
