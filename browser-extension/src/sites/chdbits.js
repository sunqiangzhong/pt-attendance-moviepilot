import { cleanAgent } from './common.js'

function getForm() {
  return document.querySelector('form[action$="/bakatest.php"], form[action="bakatest.php"]')
}

function getChoices() {
  return Array.from(getForm()?.querySelectorAll('input[type="radio"][name="choice[]"]') || []).map(input => {
    let label = ''
    let node = input.nextSibling
    while (node && node.nodeName !== 'BR') {
      label += node.textContent || ''
      node = node.nextSibling
    }
    return { input, label: label.replace(/\s+/g, ' ').trim() }
  })
}

function detectStatus() {
  const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() || ''
  const success = text.match(/今天已经签过到了\s*[（(]已连续\s*(\d+)\s*天签到[）)]/)
  if (!success) return { checked: false, status: '未签到', bonus: '' }
  const bonus = text.match(/(?:获得|奖励)\s*([\d.]+\s*魔力值?)/)?.[1] || ''
  return { checked: true, status: `签到成功，已连续${success[1]}天`, bonus }
}

export default {
  id: 'chdbits',
  hosts: ['ptchdbits.co'],

  async run(task, ctx) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }
    if (task.stage === 'submitted') {
      if ((task.steps || 0) < 5) return { action: 'wait', step: 'submitted', delay: 1200 }
      return { action: 'failure', error: '等待 CHDBits 签到成功状态超时' }
    }
    if (location.pathname.toLowerCase() !== '/bakatest.php') {
      return { action: 'navigate', url: 'https://ptchdbits.co/bakatest.php' }
    }

    const form = getForm()
    const choices = getChoices()
    const question = form?.querySelector('tr td.text')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (!form || !question || !choices.length) return { action: 'failure', error: '未找到 CHDBits 签到题目或选项' }
    const prompt = [
      '请回答 CHDBits 每日签到单选题。',
      `题目：${question}`,
      '只能从以下候选项中选择一个，并且只输出完整原文：',
      ...choices.map((choice, idx) => `${idx + 1}. ${choice.label}`)
    ].join('\n')
    const response = cleanAgent(await ctx.askAgent('', prompt))
    const choice = choices.find(item => response === item.label) || choices.find(item => response.includes(item.label))
    const submit = form.querySelector('input[type="submit"][name="submit"]')
    if (!choice || !submit) return { action: 'failure', error: `Agent 返回未匹配 CHDBits 候选项：${response}` }
    choice.input.checked = true
    choice.input.dispatchEvent(new Event('change', { bubbles: true }))
    submit.click()
    return { action: 'wait', step: 'submitted', delay: 1200 }
  }
}
