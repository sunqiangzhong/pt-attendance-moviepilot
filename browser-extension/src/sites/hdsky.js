import { getCaptcha, setInput, waitFor } from './common.js'

function getImage() {
  return document.querySelector('#showupimg')
}

function getImageUrl() {
  const image = getImage()
  const hash = image?.closest('.layui-layer-page')?.querySelector('input[name="imagehash"]')?.value?.trim() ||
    document.querySelector('input[name="imagehash"]')?.value?.trim() || ''
  if (hash) return `https://hdsky.me/image.php?action=regimage&imagehash=${encodeURIComponent(hash)}`
  const url = image ? new URL(image.getAttribute('src') || image.src, location.href) : null
  const imageHash = url?.searchParams.get('imagehash') || ''
  return imageHash ? `https://hdsky.me/image.php?action=regimage&imagehash=${encodeURIComponent(imageHash)}` : ''
}

function detectStatus() {
  const checked = Array.from(document.querySelectorAll('td.bottom span.medium')).some(element =>
    /\[\s*已签到\s*\]/.test(element.textContent || '')
  )
  if (checked) return { checked: true, status: '签到成功', bonus: '' }

  for (const dialog of document.querySelectorAll('.layui-layer.layui-layer-dialog')) {
    const title = dialog.querySelector('.layui-layer-title')?.textContent || ''
    const content = dialog.querySelector('.layui-layer-content')?.textContent?.replace(/\s+/g, ' ') || ''
    if (!/签到|show\s*up/i.test(title) || !/成功|success/i.test(content)) continue
    const days = content.match(/连续签到\s*(\d+)\s*天/i)?.[1]
    const bonus = content.match(/魔力值加\s*(\d+)/i)?.[1]
    return { checked: true, status: days ? `签到成功，已连续${days}天` : '签到成功', bonus: bonus ? `${bonus} 魔力值` : '' }
  }
  return { checked: false, status: '未签到', bonus: '' }
}

export default {
  id: 'hdsky',
  hosts: ['hdsky.me', 'www.hdsky.me'],

  async run(task, ctx) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }
    if (task.stage === 'submitted') {
      if ((task.steps || 0) < 8) return { action: 'wait', step: 'submitted', delay: 1000 }
      return { action: 'failure', error: '等待 HDSky 签到成功状态超时' }
    }

    if (!getImage()) {
      const button = document.querySelector('#showup')
      if (!button) return { action: 'navigate', url: 'https://hdsky.me/index.php' }
      button.click()
    }
    await waitFor(() => getImage()?.complete && getImage()?.naturalWidth > 0 && getImage(), 10000)

    const config = await chrome.storage.local.get('config')
    const prompt = config.config?.sites?.hdsky?.prompt || '识别图片中的字母和数字验证码，只返回验证码。'
    const captcha = getCaptcha(await ctx.askAgent(getImageUrl(), prompt))
    const input = document.querySelector('#imagestring')
    const confirm = document.getElementById('showupbutton')
    if (!captcha || !input || !confirm) return { action: 'failure', error: 'HDSky 验证码识别或页面元素无效' }
    setInput(input, captcha)
    confirm.click()
    return { action: 'wait', step: 'submitted', delay: 1000 }
  }
}
