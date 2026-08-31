export const sites = {
  hhclub: {
    id: 'hhclub',
    name: 'HHCLUB',
    hosts: ['hhanclub.net'],
    matches: ['https://hhanclub.net/*'],
    attendanceUrl: 'https://hhanclub.net/attendance.php',
    needsAgent: false
  },
  hddolby: {
    id: 'hddolby',
    name: 'HDDolby',
    hosts: ['www.hddolby.com', 'hddolby.com'],
    matches: ['https://www.hddolby.com/*', 'https://hddolby.com/*'],
    attendanceUrl: 'https://www.hddolby.com/attendance.php',
    needsAgent: false
  },
  hdsky: {
    id: 'hdsky',
    name: 'HDSky',
    hosts: ['hdsky.me', 'www.hdsky.me'],
    matches: ['https://hdsky.me/*', 'https://www.hdsky.me/*'],
    attendanceUrl: 'https://hdsky.me/index.php',
    needsAgent: true,
    hasPrompt: true
  },
  opencd: {
    id: 'opencd',
    name: 'OpenCD（皇后）',
    hosts: ['open.cd', 'www.open.cd'],
    matches: ['https://open.cd/*', 'https://www.open.cd/*'],
    attendanceUrl: 'https://open.cd/',
    needsAgent: true,
    hasPrompt: true
  },
  u2: {
    id: 'u2',
    name: 'U2',
    hosts: ['u2.dmhy.org'],
    matches: ['https://u2.dmhy.org/*'],
    attendanceUrl: 'https://u2.dmhy.org/showup.php',
    needsAgent: true
  },
  chdbits: {
    id: 'chdbits',
    name: 'CHDBits',
    hosts: ['ptchdbits.co'],
    matches: ['https://ptchdbits.co/*'],
    attendanceUrl: 'https://ptchdbits.co/bakatest.php',
    needsAgent: true
  }
}

export function getSiteByHost(host) {
  return Object.values(sites).find(site => site.hosts.includes(host)) || null
}
