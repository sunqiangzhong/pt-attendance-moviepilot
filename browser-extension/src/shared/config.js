export const defaultConfig = {
  sites: {
    hhclub: {
      enabled: true,
      cron: '0 8 * * *'
    },
    hddolby: {
      enabled: true,
      cron: '0 8 * * *'
    },
    hdsky: {
      enabled: true,
      cron: '0 8 * * *',
      prompt: '识别图片中的字母和数字验证码，只返回验证码，不要解释。'
    },
    opencd: {
      enabled: true,
      cron: '0 8 * * *',
      prompt: '识别图片中的字母和数字验证码，只返回验证码，不要解释。'
    },
    u2: {
      enabled: true,
      cron: '0 8 * * *'
    },
    chdbits: {
      enabled: true,
      cron: '0 8 * * *'
    }
  },
  moviePilot: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    agentPath: '/api/v1/message/agent/stream',
    agentToken: ''
  }
}

export async function loadConfig() {
  const stored = await chrome.storage.local.get('config')
  const config = stored.config || {}

  return {
    ...defaultConfig,
    ...config,
    sites: {
      ...defaultConfig.sites,
      ...(config.sites || {})
    },
    moviePilot: {
      ...defaultConfig.moviePilot,
      ...(config.moviePilot || {})
    }
  }
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ config })
}
