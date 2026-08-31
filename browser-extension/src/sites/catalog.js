export const sites = {
  hddolby: {
    id: 'hddolby',
    name: 'HDDolby',
    hosts: ['www.hddolby.com', 'hddolby.com'],
    matches: ['https://www.hddolby.com/*', 'https://hddolby.com/*'],
    attendanceUrl: 'https://www.hddolby.com/attendance.php'
  }
}

export function getSiteByHost(host) {
  return Object.values(sites).find(site => site.hosts.includes(host)) || null
}
