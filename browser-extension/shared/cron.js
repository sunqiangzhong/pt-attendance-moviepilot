export function parsePart(part, min, max) {
  const values = new Set()

  for (const segment of String(part).split(',').map(value => value.trim()).filter(Boolean)) {
    if (segment === '*') {
      for (let value = min; value <= max; value += 1) values.add(value)
      continue
    }

    const step = segment.match(/^(.+)\/(\d+)$/)
    if (step) {
      const size = Number(step[2])
      if (!size) throw new Error(`Cron 步长无效：${segment}`)

      const range = step[1] === '*' ? [min, max] : step[1].split('-').map(Number)
      const start = range[0]
      const end = range[1] ?? max
      if (start < min || end > max || start > end) throw new Error(`Cron 范围无效：${segment}`)
      for (let value = start; value <= end; value += size) values.add(value)
      continue
    }

    const range = segment.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start < min || end > max || start > end) throw new Error(`Cron 范围无效：${segment}`)
      for (let value = start; value <= end; value += 1) values.add(value)
      continue
    }

    const value = Number(segment)
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Cron 数值无效：${segment}`)
    }
    values.add(value)
  }

  if (!values.size) throw new Error(`Cron 字段为空：${part}`)
  return values
}

export function parseCron(expression) {
  const parts = String(expression || '').trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('Cron 必须为 5 段')

  return {
    minute: parsePart(parts[0], 0, 59),
    hour: parsePart(parts[1], 0, 23),
    day: parsePart(parts[2], 1, 31),
    month: parsePart(parts[3], 1, 12),
    week: parsePart(parts[4], 0, 7)
  }
}

export function matchesCron(expression, date) {
  const cron = parseCron(expression)
  const week = date.getDay()
  const hasWeek = cron.week.has(week) || (week === 0 && cron.week.has(7))

  return cron.minute.has(date.getMinutes()) &&
    cron.hour.has(date.getHours()) &&
    cron.day.has(date.getDate()) &&
    cron.month.has(date.getMonth() + 1) &&
    hasWeek
}

export function getMinuteKey(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function getNextRun(expression, from = new Date()) {
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setMinutes(next.getMinutes() + 1)

  for (let idx = 0; idx < 366 * 24 * 60; idx += 1) {
    if (matchesCron(expression, next)) return next
    next.setMinutes(next.getMinutes() + 1)
  }

  throw new Error('未来 366 天没有匹配时间')
}
