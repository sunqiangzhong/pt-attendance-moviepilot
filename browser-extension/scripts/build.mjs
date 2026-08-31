import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { context } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const watch = process.argv.includes('--watch')

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(path.join(root, 'public'), dist, { recursive: true })

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
  logLevel: 'info'
})

if (watch) {
  await ctx.watch()
  console.log('Watching extension sources…')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
