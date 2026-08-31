const attendanceUrl = 'https://www.hddolby.com/attendance.php'

function detectStatus() {
  const text = document.body?.innerText || ''
  const bonusMatch = text.match(/签到已得\s*(\d+(?:\.\d+)?)/)
  const checked = text.includes('您今天已经签到过了，请勿重复刷新。') || Boolean(bonusMatch)

  return {
    checked,
    status: checked ? '签到成功' : '未签到',
    bonus: bonusMatch?.[1] || ''
  }
}

export default {
  id: 'hddolby',
  hosts: ['www.hddolby.com', 'hddolby.com'],

  run(task) {
    const result = detectStatus()
    if (result.checked) return { action: 'success', result }

    if (location.pathname.toLowerCase() !== '/attendance.php') {
      return { action: 'navigate', url: attendanceUrl }
    }

    if ((task.reloads || 0) < 1) return { action: 'reload' }

    return {
      action: 'failure',
      error: '刷新签到页后仍未检测到成功状态'
    }
  }
}
