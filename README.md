# dsh-chrome-desktop

Turn the DeepSeek Harness Web UI into a desktop app: a **Chrome/Edge app window**, a **desktop shortcut**, and a **silently started backend**. No Electron, no native compilation, no administrator rights.

English | [中文](README.zh.md)

---

## What it gives you

| Feature | Detail |
| --- | --- |
| 🪟 **Real app window** | Opens the UI with Chrome/Edge `--app` mode: no address bar, no tabs, its own taskbar entry |
| 🖱️ **Desktop + Start-menu shortcut** | Created automatically when the plugin loads, with a bundled icon |
| 🚀 **Silent backend start** | If `dsh web` is not running, it is started hidden and the window opens once the port answers |
| ⏳ **Startup splash** | A small "正在启动 DSH…" window covers the cold start and closes itself when ready |
| 🔑 **Automatic sign-in** | The launch URL carrying the process token is captured from the backend output, so the first window is already authenticated |
| 🧠 **Node version guard** | DSH needs Node 22+ (`node:util parseEnv`). The launcher picks the highest ≥ 22 install and moves it to the front of `PATH` |
| 🛡 **No extra secrets** | Reuses the browser session that already exists; stores no keys |

## Requirements

| Item | Requirement |
| --- | --- |
| OS | **Windows 10 / 11 (x64)** |
| Node.js | **≥ 22** |
| DSH | ≥ 0.2.0 with the `web` profile initialized |
| Browser | Google Chrome or Microsoft Edge |

## Install

```powershell
dsh plugin --profile web add dsh-chrome-desktop
```

For local development, link the source directory:

```powershell
dsh plugin --profile web add link:C:\Dev\AI\Plugins\dsh-chrome-desktop
```

The plugin provisions immediately on load and creates `DeepSeek Harness` shortcuts on the desktop and in the Start menu.

## How it works

```
plugin load
  └─ read the running host: port / node path / dsh entry / working directory
  └─ copy the launcher into %USERPROFILE%\dsh-chrome-desktop
  └─ write launcher.config.json
  └─ run create-shortcuts.ps1 for the desktop and Start-menu links

shortcut double-click
  └─ wscript starts launch.ps1 hidden (no console flash)
  └─ probe http://127.0.0.1:<port>
       ├─ already running → open the app window (existing cookie)
       └─ not running     → splash → pick Node ≥ 22 → start backend hidden
                          → capture the token URL → wait for the port
                          → close splash → open the app window
```

## Configuration

Override the bundle row in the profile's `cordis.patch.yml`:

```yaml
- id: chrome-desktop
  name: dsh-chrome-desktop
  config:
    shortcutName: DeepSeek Harness
    home: C:\Users\me\dsh-desktop
    shortcuts: true
    port: 3080
    readinessTimeoutSeconds: 180
    restartOnLaunch: false
```

`DSH_CHROME_DESKTOP_HOME` also overrides the deployment directory.

## Double-click behaviour: attach or restart

By default the shortcut attaches to a running backend (about one second). It first detects which port that backend actually listens on — even when that is not the configured 3080 — and opens that port instead of spawning a second instance that would fight over the session. To get a fresh backend on every double-click, turn on estartOnLaunch:

- Settings → General → click "Restart on launch: off"
- or edit `%USERPROFILE%\dsh-chrome-desktop\preferences.json`: `{"restartOnLaunch": true}`

With it enabled the launcher stops whatever listens on the port, waits for the socket, starts a new backend and opens the window — the current page disconnects and reconnects a few seconds later. Passing -Restart to the launcher restarts once without changing the preference.
## Settings row

After installing, **Settings → General** gains a "DSH Chrome desktop app" row showing the deployment directory, shortcut state and sign-in autostart state, with buttons: **Install / repair**, **Rebuild shortcuts**, **Enable / disable sign-in autostart** and **Remove installation** (kept last so it is never the easiest button to hit).

"Remove installation" deletes both shortcuts, the startup entry and the whole launcher home. The plugin re-provisions on the next host start — uninstall the plugin if the removal has to stick.

## Host endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /dsh-chrome-desktop/status` | Last provisioning state (home, shortcuts, config snapshot) |
| `POST /dsh-chrome-desktop/install` | Re-provision (repair) |
| `POST /dsh-chrome-desktop/shortcuts` | Rebuild the desktop and start-menu links only |
| `POST /dsh-chrome-desktop/autostart` | `{"enabled":true\|false}` — add or remove the sign-in entry |
| `POST /dsh-chrome-desktop/cleanup` | Delete the shortcuts and the launcher home |

## Status

```powershell
curl.exe http://127.0.0.1:3080/dsh-chrome-desktop/status
```

The JSON reports the last provisioning result (`installed`, `shortcuts.created`, `config`).

## Troubleshooting

**Nothing happens on double-click.** Check the tail of `launch.log`. The usual cause is a wrong Node version (each candidate is logged with its version) or a missing `@deepseek-ai/dsh`. On failure the launcher shows an error box that includes the backend's stderr.

**Sign-in expired.** Browser cookies last 30 days. The launcher re-captures the token URL on the next cold start; if the window still asks for authentication, open the URL printed by `dsh web` in that window once.

**Want an isolated browser profile?** Pass `-Isolated` to `launch.ps1`; it uses a private `browser-profile` directory (you sign in once).

## Uninstall

```powershell
dsh plugin --profile web remove dsh-chrome-desktop
```

Then delete `%USERPROFILE%\dsh-chrome-desktop` and the `DeepSeek Harness.lnk` shortcuts.

## License

MIT
