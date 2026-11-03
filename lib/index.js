/**
 * dsh-chrome-desktop — host half.
 *
 * Turns the DSH Web UI into a desktop app without Electron:
 *   1. copies a small launcher (PowerShell + VBS + icon) into the user's home,
 *   2. writes launcher.config.json with the port, node and dsh entry point that
 *      the currently running host actually uses,
 *   3. creates desktop and start-menu shortcuts pointing at that launcher.
 *
 * The launcher itself starts `dsh web --no-open` silently when the backend is
 * not running, shows a startup splash, and opens the UI in a Chrome/Edge app
 * window (no address bar, no tabs, own taskbar entry).
 *
 * Nothing here touches the network beyond serving a local status route.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-chrome-desktop'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = resolve(MODULE_DIR, '..', 'assets')
const ASSET_FILES = [
  'launch.ps1',
  'launch.vbs',
  'splash.ps1',
  'create-shortcuts.ps1',
  'manage.ps1',
  'restart.ps1',
  'restart.cmd',
  'icon.ico',
]

/** Last provisioning result, reported by the status route. */
let state = {
  installed: false,
  at: null,
  home: null,
  error: null,
  shortcuts: null,
  config: null,
}

function resolveHome(config) {
  if (config?.home) return resolve(String(config.home))
  if (process.env.DSH_CHROME_DESKTOP_HOME) return resolve(process.env.DSH_CHROME_DESKTOP_HOME)
  return join(homedir(), 'dsh-chrome-desktop')
}

/** The running host is started as `node .../@deepseek-ai/dsh/lib/bin.js`, so argv[1] is the entry point. */
function resolveDshBin() {
  const entry = process.argv[1]
  if (entry && /(^|[\\/])bin\.js$/.test(entry) && existsSync(entry)) return entry
  return null
}

function advertisedPort(ctx, config) {
  if (Number.isInteger(config?.port) && config.port > 0) return config.port
  try {
    const url = ctx.get('webApp')?.getAdvertisedUrl?.()
    if (url) {
      const parsed = new URL(url)
      if (parsed.port) return Number(parsed.port)
      if (parsed.protocol === 'https:') return 443
      if (parsed.protocol === 'http:') return 80
    }
  } catch {
    // fall through to the conventional port
  }
  return 3080
}

/** Read the user-facing preferences file, tolerating a missing or broken one. */
async function readPreferences(home) {
  try {
    const raw = await readFile(join(home, 'preferences.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      restartOnLaunch: parsed?.restartOnLaunch === true,
    }
  } catch {
    return { restartOnLaunch: false }
  }
}

function runPowerShell(scriptPath, args) {
  return new Promise((done) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true, stdio: 'ignore' },
    )
    child.on('error', (error) => done({ ok: false, error: error.message }))
    child.on('exit', (code) => done({ ok: code === 0, code }))
  })
}

async function provision(ctx, config, log) {
  if (process.platform !== 'win32') {
    state = { ...state, installed: false, error: 'dsh-chrome-desktop supports Windows only' }
    log?.warn?.('dsh-chrome-desktop: skipping provisioning — only Windows is supported')
    return state
  }

  const home = resolveHome(config)
  await mkdir(home, { recursive: true })

  for (const file of ASSET_FILES) {
    await copyFile(join(ASSET_DIR, file), join(home, file))
  }

  // The port is sticky. An incidental host (a second instance on another port, a
  // test run) must never move the desktop shortcut to a different port: two
  // backends on different ports would then co-exist and fight over the same
  // session. Only the very first provisioning adopts the running host's port.
  const existing = await readLauncherConfig(home)
  const port = Number.isInteger(config?.port) && config.port > 0
    ? config.port
    : (existing?.port ?? advertisedPort(ctx, config))

  const desired = {
    port,
    nodePath: process.execPath,
    dshBin: resolveDshBin(),
    workingDir: process.cwd(),
    nodeOptions: process.env.NODE_OPTIONS ?? '',
    readinessTimeoutSeconds: Number(config?.readinessTimeoutSeconds ?? 180),
    baseDir: home,
  }
  await writeFile(join(home, 'launcher.config.json'), `${JSON.stringify(desired, null, 2)}\n`, 'utf8')

  // preferences.json is the user-facing switch file; it is created once and then
  // owned by the settings row, so re-provisioning never stomps a user choice.
  const prefsPath = join(home, 'preferences.json')
  if (!existsSync(prefsPath)) {
    const initial = { restartOnLaunch: config?.restartOnLaunch === true }
    await writeFile(prefsPath, `${JSON.stringify(initial, null, 2)}\n`, 'utf8')
  }
  const preferences = await readPreferences(home)

  const shortcuts = { created: [], skipped: false }
  if (config?.shortcuts !== false) {
    const script = join(home, 'create-shortcuts.ps1')
    const label = String(config?.shortcutName ?? 'DeepSeek Harness')
    const result = await runPowerShell(script, ['-HomeDir', home, '-Name', label])
    if (!result.ok) {
      shortcuts.error = result.error ?? `exit ${result.code}`
      log?.warn?.(`dsh-chrome-desktop: shortcut creation failed (${shortcuts.error})`)
    } else {
      shortcuts.created = ['desktop', 'start-menu']
    }
  } else {
    shortcuts.skipped = true
  }

  state = {
    installed: true,
    at: new Date().toISOString(),
    home,
    error: null,
    shortcuts,
    files: ASSET_FILES.length,
    preferences,
    config: desired,
  }
  log?.info?.(`dsh-chrome-desktop: launcher provisioned in ${home}`)
  return state
}

export function apply(ctx, config = {}) {
  const log = ctx.logger
  const home = () => resolveHome(config)
  const label = () => String(config?.shortcutName ?? 'DeepSeek Harness')

  const ensure = () =>
    provision(ctx, config, log).catch((error) => {
      state = { ...state, installed: false, error: String(error?.message ?? error) }
      log?.warn?.(`dsh-chrome-desktop: provisioning failed — ${error?.message ?? error}`)
      return state
    })

  // Provisioning is idempotent: it rewrites the launcher and refreshes shortcuts
  // whenever the config (port, node, entry point) actually changed.
  ctx.effect(() => {
    void ensure()
  }, 'dsh-chrome-desktop: provision launcher')

  /** Run one management action from the settings row. */
  const manage = async (action) => {
    if (process.platform !== 'win32') throw new Error('only Windows is supported')
    const script = join(home(), 'manage.ps1')
    if (!existsSync(script)) throw new Error('launcher is not provisioned yet')
    const result = await runPowerShell(script, ['-Action', action, '-HomeDir', home(), '-Name', label()])
    if (!result.ok) throw new Error(result.error ?? `manage.ps1 exited with ${result.code}`)
    return result
  }

  // The status route is optional: a profile without a web server (headless, tui)
  // still provisions the launcher, it just cannot expose the route.
  ctx.inject(['webServer'], (webCtx) => {
    const json = (res, code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload, null, 2))
    }

    const readBody = async (req) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      if (chunks.length === 0) return {}
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return {}
      }
    }

    const routes = [
      {
        path: '/dsh-chrome-desktop/status',
        async handler(_req, res) {
          const installed = existsSync(join(home(), 'launch.ps1'))
          const preferences = await readPreferences(home())
          json(res, 200, { ok: true, platform: process.platform, launcherInstalled: installed, ...state, preferences })
        },
      },
      {
        path: '/dsh-chrome-desktop/preferences',
        async handler(req, res) {
          try {
            const body = await readBody(req)
            if (typeof body.restartOnLaunch !== 'boolean') {
              json(res, 400, { ok: false, error: 'restartOnLaunch must be a boolean' })
              return
            }
            const next = { restartOnLaunch: body.restartOnLaunch }
            await writeFile(join(home(), 'preferences.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
            state = { ...state, preferences: next }
            json(res, 200, { ok: true, preferences: next })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
      {
        path: '/dsh-chrome-desktop/install',
        async handler(_req, res) {
          try {
            const report = await provision(ctx, config, log)
            json(res, 200, { ok: true, ...report })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
      {
        path: '/dsh-chrome-desktop/shortcuts',
        async handler(_req, res) {
          try {
            await manage('shortcuts')
            state = { ...state, shortcuts: { created: ['desktop', 'start-menu'], skipped: false } }
            json(res, 200, { ok: true, shortcuts: state.shortcuts })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
      {
        path: '/dsh-chrome-desktop/autostart',
        async handler(req, res) {
          try {
            const body = await readBody(req)
            await manage(body.enabled === true ? 'autostart-on' : 'autostart-off')
            const enabled = body.enabled === true
            state = { ...state, autostart: enabled }
            json(res, 200, { ok: true, autostart: enabled })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
      {
        path: '/dsh-chrome-desktop/restart',
        async handler(_req, res) {
          const script = join(home(), 'restart.ps1')
          if (!existsSync(script)) {
            json(res, 409, { ok: false, error: 'launcher is not provisioned yet' })
            return
          }
          // Answer first: the restart kills the process serving this request.
          json(res, 200, { ok: true, restarting: true })
          setTimeout(() => {
            try {
              const child = spawn(
                'powershell.exe',
                ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Quiet'],
                { detached: true, stdio: 'ignore', windowsHide: true },
              )
              child.unref()
            } catch (error) {
              log?.warn?.(`dsh-chrome-desktop: restart spawn failed — ${error?.message ?? error}`)
            }
          }, 400)
        },
      },
      {
        path: '/dsh-chrome-desktop/cleanup',
        async handler(_req, res) {
          try {
            await manage('remove-shortcuts')
            let removed = false
            try {
              const info = await stat(home())
              if (info.isDirectory()) {
                await rm(home(), { recursive: true, force: true, maxRetries: 3, retryDelay: 120 })
                removed = true
              }
            } catch {
              removed = false
            }
            state = {
              installed: false,
              at: new Date().toISOString(),
              home: home(),
              error: null,
              shortcuts: { created: [], skipped: false },
              config: null,
            }
            json(res, 200, { ok: true, homeRemoved: removed, home: home() })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      },
    ]

    for (const route of routes) {
      webCtx.effect(
        () => webCtx.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }),
        `dsh-chrome-desktop: ${route.path}`,
      )
    }
  })
}

/** Exported for tests and for the future settings UI. */
export async function readLauncherConfig(home) {
  const file = join(resolveHome({ home }), 'launcher.config.json')
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export const internals = { resolveHome, resolveDshBin, advertisedPort, provision, ASSET_FILES }
