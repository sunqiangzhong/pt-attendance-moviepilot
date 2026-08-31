export const defaultConfig = {
  sites: {
    hddolby: {
      enabled: true,
      cron: '0 8 * * *'
    }
  },
  moviePilot: {
    enabled: false,
    baseUrl: '',
    apiKey: ''
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
