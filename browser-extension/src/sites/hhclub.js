import { sleep } from './common.js'

function detectStatus() {
  const today = new Date().getDate()
  const items = document.querySelectorAll('#day-register .calender-sub')

  for (const item of items) {
    const day = item.querySelector('.day-content')
    if (!day || day.classList.contains('last-month-day') || day.classList.contains('next-month-day')) continue
    if (Number.parseInt(day.textContent.replace(/\D/g, ''), 10) !== today) continue

    const checkin = item.querySelector('.checkin')
    const button = checkin?.querySelector('button, input[type="button"], input[type="submit"], a') || null
    const text = `${button?.textContent || button?.value || ''}${checkin?.textContent || ''}`.replace(/\s+/g, '')
    const checked = /(?:已领取|已签到|领取成功)/.test(text)
    return {
      checked,
      status: checked ? '签到成功' : '未签到',
      bonus: item.querySelector('.bonus-info > p')?.textContent?.trim() || '',
      button
    }
  }
  return { checked: false, status: '未找到今日签到项', bonus: '' }
}

export default {
  id: 'hhclub',
  hosts: ['hhanclub.net'],

  async run(task) {
    if (location.pathname.toLowerCase() !== '/attendance.php') {
      return { action: 'navigate', url: 'https://hhanclub.net/attendance.php' }
    }

    let result = detectStatus()
    if (result.checked) {
      const { button, ...data } = result
      return { action: 'success', result: data }
    }
    if (!result.button) return { action: 'failure', error: '未找到 HHCLUB 今日签到按钮' }

    result.button.click()
    for (let idx = 0; idx < 10; idx += 1) {
      await sleep(500)
      result = detectStatus()
      if (result.checked) {
        const { button, ...data } = result
        return { action: 'success', result: data }
      }
    }

    if ((task.reloads || 0) < 1) return { action: 'reload' }
    return { action: 'failure', error: '刷新后仍未检测到 HHCLUB 签到成功状态' }
  }
}
