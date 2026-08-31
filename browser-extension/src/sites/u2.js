import { cleanAgent } from './common.js'

function detectStatus() {
  const link = document.querySelector('#info_block a[href*="showup.php"]')
  if (link && /已[簽签]到/.test(link.textContent || '')) return { checked: true, status: '签到成功', bonus: '' }
  const text = document.body?.innerText || ''
  const success = text.match(/(?:签到成功|已(?:经)?签到|今日已签到|成功签到)[^\n]*/i)?.[0]
  return { checked: Boolean(success), status: success || '未签到', bonus: '' }
}

export default {
  id: 'u2',
  hosts: ['u2.dmhy.org'],

  async run(task, ctx) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }
    if (task.stage === 'submitted') {
      if ((task.steps || 0) < 6) return { action: 'wait', step: 'submitted', delay: 1200 }
      return { action: 'failure', error: '等待 U2 签到成功状态超时' }
    }

    const image = document.querySelector('#showup img[alt="captcha"]')
    if (!image) return { action: 'navigate', url: 'https://u2.dmhy.org/showup.php' }

    const options = Array.from(document.querySelectorAll('#showup input[type="submit"][name^="captcha_"]'))
    if (!options.length) return { action: 'failure', error: '未找到 U2 验证码候选项' }
    const prompt = [
      '识别图片中圆点所在位置对应的动画作品。',
      '只能从以下候选项中选择一个，并且只返回完整原文：',
      ...options.map((option, idx) => `${idx + 1}. ${option.value}`)
    ].join('\n')
    const response = cleanAgent(await ctx.askAgent(new URL(image.getAttribute('src') || image.src, location.href).href, prompt))
    const button = options.find(option => response.includes(option.value.trim())) || options.find(option =>
      option.value.split('/').map(value => value.trim()).filter(value => value.length >= 3).some(value => response.includes(value))
    )
    if (!button) return { action: 'failure', error: `Agent 返回未匹配 U2 候选项：${response}` }
    button.click()
    return { action: 'wait', step: 'submitted', delay: 1200 }
  }
}
