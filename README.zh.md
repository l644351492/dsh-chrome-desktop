# dsh-chrome-desktop

把 DeepSeek Harness 的 Web UI 变成桌面应用：**Chrome/Edge 独立窗口 + 桌面快捷方式 + 静默启动后端**。零 Electron、零原生编译、不需要管理员权限。

[English](README.md) | 中文

---

## 它能带来什么

| 能力 | 说明 |
| --- | --- |
| 🪟 **独立应用窗口** | 用 Chrome/Edge 的 `--app` 模式打开，没有地址栏、没有标签页，在任务栏里是独立条目 |
| 🖱️ **桌面 + 开始菜单快捷方式** | 装好插件后自动创建，双击即用，自带图标 |
| 🚀 **静默启动后端** | 双击时若 `dsh web` 没在跑，会先隐藏启动它，再等就绪开窗口 |
| ⏳ **启动提示** | 冷启动期间显示「正在启动 DSH…」小窗，就绪即自动关闭，不会以为卡死 |
| 🔑 **自动登录** | 从后端输出里抓带 token 的启动 URL，首次打开即完成认证，不用手动粘贴 |
| 🧠 **Node 版本守卫** | DSH 需要 Node 22+（`node:util parseEnv`）。启动器会挑 ≥22 的最高版本，并把它放到 PATH 最前面，避免误用旧 Node 直接崩 |
| 🛡 **凭据隔离** | 默认复用浏览器已有的登录 Cookie，不额外保存密钥 |

## 环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | **Windows 10 / 11 (x64)** |
| Node.js | **≥ 22**（DSH 自身要求） |
| DSH | ≥ 0.2.0（`web` profile 已初始化） |
| 浏览器 | Google Chrome 或 Microsoft Edge（任一即可） |

## 安装

```powershell
dsh plugin --profile web add dsh-chrome-desktop
```

本地开发时可直接链接源码目录：

```powershell
dsh plugin --profile web add link:C:\Dev\AI\Plugins\dsh-chrome-desktop
```

插件加载后会立即执行一次部署，然后你会在**桌面**和**开始菜单**看到 `DeepSeek Harness` 快捷方式。

## 工作原理

```
插件加载
  └─ 读取当前宿主：端口 / node 路径 / dsh 入口 / 工作目录
  └─ 复制启动器到 %USERPROFILE%\dsh-chrome-desktop
  └─ 写入 launcher.config.json
  └─ 调用 create-shortcuts.ps1 创建桌面与开始菜单快捷方式

双击快捷方式
  └─ wscript 静默拉起 launch.ps1（不闪黑窗）
  └─ 探测 http://127.0.0.1:<port>
       ├─ 已在运行 → 直接开窗口（复用 Cookie，免登录）
       └─ 未运行   → 显示「正在启动 DSH…」→ 选 Node ≥22 → 隐藏启动后端
                     → 抓 token URL → 端口就绪 → 关小窗 → 开应用窗口
```

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖插件条目即可：

```yaml
- id: chrome-desktop
  name: dsh-chrome-desktop
  config:
    shortcutName: DeepSeek Harness   # 快捷方式显示名，默认 DeepSeek Harness
    home: C:\Users\me\dsh-desktop    # 部署目录，默认 %USERPROFILE%\dsh-chrome-desktop
    shortcuts: true                  # 是否创建快捷方式，默认 true
    port: 3080                       # 覆盖端口；默认从当前 Web 宿主读取
    readinessTimeoutSeconds: 180     # 等待后端就绪的上限
    restartOnLaunch: false           # 双击即重启；默认 false = 连上已运行的后端
```

也可以用环境变量 `DSH_CHROME_DESKTOP_HOME` 指定部署目录。

## 双击行为：连上还是重启

默认双击图标会**连上已在运行的后端**（1 秒出窗口），并且会**先探测该后端实际监听的端口**——即使它不在配置的 3080 上（例如你手动用 --port 3099 起过），也会直接打开那个端口，而不是另起一个实例去抢会话。如果你希望每次双击都拿到一个全新的后端，把 estartOnLaunch 打开：

- 方式一（推荐）：设置 → 通用设置 → 「双击时重启：已关闭」点一下
- 方式二：编辑 `%USERPROFILE%\dsh-chrome-desktop\preferences.json`

`json
{ "restartOnLaunch": true }
`

开启后，双击会先停掉监听端口的旧后端、等端口释放，再静默启动一个新的并打开窗口——**当前页面会断开并在十几秒后自动重连**。也可以在快捷方式后加 -Restart 参数，只让这一次重启。
## 设置页入口

安装后，**设置 → 通用设置**会多出一行「DSH Chrome 桌面应用」，显示：

- 部署目录、快捷方式是否创建、登录自启状态
- 按钮：**安装 / 修复**、**重建快捷方式**、**开启 / 关闭登录自启**、**清理安装**（放在最后，避免误点）

「清理安装」会删除两个快捷方式、登录启动项和整个部署目录。注意插件在下次宿主启动时会重新部署——想让清理保持生效，请直接卸载插件。

## 宿主接口

| 方法与路径 | 作用 |
| --- | --- |
| `GET /dsh-chrome-desktop/status` | 最近一次部署状态（安装位置、快捷方式、配置快照） |
| `POST /dsh-chrome-desktop/install` | 重新部署（修复） |
| `POST /dsh-chrome-desktop/shortcuts` | 只重建桌面与开始菜单快捷方式 |
| `POST /dsh-chrome-desktop/autostart` | `{"enabled":true|false}`，增删登录启动项 |
| `POST /dsh-chrome-desktop/cleanup` | 删除快捷方式与部署目录 |

## 自检

```powershell
curl.exe http://127.0.0.1:3080/dsh-chrome-desktop/status
```

返回 JSON 中的 `installed`、`shortcuts.created`、`config` 反映最近一次部署结果。

## 部署目录内容

```
%USERPROFILE%\dsh-chrome-desktop\
  launch.ps1                     启动逻辑（探测、拉起、开窗口）
  launch.vbs                     静默入口（WScript，不闪控制台）
  splash.ps1                     「正在启动 DSH…」提示窗
  create-shortcuts.ps1           快捷方式生成器
  icon.ico                       应用图标
  launcher.config.json           部署时写入的环境快照
  launch.log                     运行日志（排查用）
  backend.log / backend.err.log  后端输出
```

## 常见问题

**双击没反应？** 看 `launch.log` 最后几行。常见原因是 Node 版本不对（日志里会写每个候选的版本）或 `@deepseek-ai/dsh` 找不到。出错时会弹错误框并附 stderr。

**需要管理员权限吗？** 不需要，只写用户目录和用户级快捷方式。

**登录过期了？** DSH 的浏览器 Cookie 默认 30 天。过期后启动器会重新抓 token URL，通常自动恢复；若仍提示认证，手动运行一次 `dsh web` 把带 token 的地址在应用窗口里打开即可。

**想和日常浏览器隔离？** 把快捷方式参数改成 `launch.ps1 -Isolated`，会启用私有 `browser-profile` 目录（首次需重新登录一次）。

**Chrome 没装？** 自动回退到 Edge，效果一致。

## 卸载

```powershell
dsh plugin --profile web remove dsh-chrome-desktop
```

然后删除 `%USERPROFILE%\dsh-chrome-desktop` 目录，以及桌面 / 开始菜单里的 `DeepSeek Harness.lnk`。

## 安全说明

- 插件只在本地复制脚本、写一个 JSON、调用 PowerShell 创建快捷方式，**不发起任何网络请求**（除本地状态路由）。
- 部署的 `.ps1` 内容随包分发，可直接审阅。
- 启动器复用浏览器已有会话；不会把密钥写入任何明文配置。

## License

MIT
