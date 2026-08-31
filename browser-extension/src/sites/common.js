export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function waitFor(getValue, timeout = 10000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const value = getValue()
    if (value) return value
    await sleep(120)
  }
  throw new Error('等待签到页面元素超时')
}

export function cleanAgent(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, match => match.replace(/```[\w]*\n?/g, '').replace(/```/g, ''))
    .replace(/["'`]/g, '')
    .trim()
}

export function getCaptcha(text) {
  const value = cleanAgent(text)
  if (/\b(?:error|failed|failure|exception|traceback|429|quota)\b/i.test(value)) return ''
  if (/(?:执行失败|调用失败|请求失败|识别失败|服务异常)/.test(value)) return ''
  return value.replace(/验证码(?:是|为)?[：:\s]*/gi, '').match(/[a-zA-Z0-9]+/)?.[0] || ''
}

export function setInput(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
