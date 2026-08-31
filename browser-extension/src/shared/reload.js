export function watchReload(onChange) {
  // 版本戳由开发构建器写入，正式构建会移除整个调用分支。
  let stamp = null

  async function poll() {
    try {
      const url = `${chrome.runtime.getURL('dev/reload.json')}?time=${Date.now()}`
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) return

      const next = (await response.json()).stamp
      if (stamp !== null && next !== stamp) onChange()
      stamp = next
    } catch {
      // 扩展重载时旧执行上下文会短暂失效。
    }
  }

  poll()
  return setInterval(poll, 1000)
}
