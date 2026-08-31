import { watch as watchFiles } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { context } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const publicDir = path.join(root, 'public')
const watch = process.argv.includes('--watch')
let stamp = Date.now()

async function writeStamp() {
  const devDir = path.join(dist, 'dev')
  await mkdir(devDir, { recursive: true })
  stamp += 1
  await writeFile(path.join(devDir, 'reload.json'), JSON.stringify({ stamp }))
}

async function copyPublic() {
  await cp(publicDir, dist, { recursive: true, force: true })
}

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await copyPublic()

const ctx = await context({
  absWorkingDir: root,
  entryPoints: {
    'background/service': 'src/background/service.js',
    'content/runner': 'src/content/runner.js',
    'options/options': 'src/options/options.js'
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  minify: false,
  minifySyntax: true,
  logLevel: 'info',
  define: {
    __DEV__: JSON.stringify(watch)
  },
  plugins: watch
    ? [{
        name: 'dev-reload',
        setup(build) {
          build.onEnd(async result => {
            if (!result.errors.length) await writeStamp()
          })
        }
      }]
    : []
})

if (watch) {
  await ctx.watch()
  let timer
  watchFiles(publicDir, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      await copyPublic()
      await writeStamp()
      console.log('Public files rebuilt')
    }, 80)
  })
  console.log('Watching extension sources…')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
