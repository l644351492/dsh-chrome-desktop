/**
 * dsh-chrome-desktop — browser half.
 *
 * One row in 设置 → 通用设置 (`settings.general.item`): shows where the launcher
 * was installed and whether the shortcuts exist, and offers install/repair,
 * shortcut rebuild, the sign-in autostart switch and removal.
 *
 * Browser modules load through the harness module loader, so this file uses the
 * `window.__ModuleLoader__.load({ id, factory })` wrapper rather than ESM syntax.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chrome-desktop',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const react = require('react');
    const jsxRuntime = require('react/jsx-runtime');
    const jsx = jsxRuntime.jsx;
    const jsxs = jsxRuntime.jsxs;

    const NS = 'dshChromeDesktop';
    const STATUS_URL = '/dsh-chrome-desktop/status';
    const INSTALL_URL = '/dsh-chrome-desktop/install';
    const SHORTCUTS_URL = '/dsh-chrome-desktop/shortcuts';
    const AUTOSTART_URL = '/dsh-chrome-desktop/autostart';
    const CLEANUP_URL = '/dsh-chrome-desktop/cleanup';
    const RESTART_URL = '/dsh-chrome-desktop/restart';
    const PREFS_URL = '/dsh-chrome-desktop/preferences';

    const zh = {
      'row.title': 'DSH Chrome 桌面应用',
      'row.description':
        '把 WebUI 变成桌面应用（仅 Windows）：Chrome/Edge 独立窗口 + 桌面快捷方式 + 静默启动后端。安装会写入 %USERPROFILE%\\dsh-chrome-desktop 并创建桌面/开始菜单快捷方式；登录自启默认关闭。',
      'status.loading': '正在读取安装状态…',
      'status.installed': '已就绪 · {home}',
      'status.missing': '尚未安装（点击「安装 / 修复」）',
      'status.shortcuts': '快捷方式：桌面 {desktop} · 开始菜单 {startMenu}',
      'status.autostart': '登录自启：{state}',
      'status.autostartOn': '已开启',
      'status.autostartOff': '关闭（默认）',
      'status.restartMode': '双击图标：{state}',
      'status.restartModeAttach': '直接连上已运行的后端',
      'status.restartModeRestart': '总是重启后端（会断开当前页面）',
      'status.unsupported': '当前平台 {platform} 暂不支持（仅 Windows）',
      'status.unavailable': '状态接口不可用（后端可能正在重启）',
      'button.install': '安装 / 修复',
      'button.shortcuts': '重建快捷方式',
      'button.autostartOn': '开启登录自启',
      'button.autostartOff': '关闭登录自启',
      'button.restart': '重启后端',
      'button.restartModeOn': '双击时重启：已开启',
      'button.restartModeOff': '双击时重启：已关闭',
      'result.restartModeOn': '已开启：以后双击桌面图标会先停掉旧后端再启动新的。',
      'result.restartModeOff': '已关闭：双击桌面图标会直接连上正在运行的后端。',
      'button.cleanup': '清理安装',
      'button.working': '进行中…',
      'result.installed': '已就绪：{count} 个文件 + 快捷方式{shortcuts}。双击桌面「DeepSeek Harness」即可用桌面应用方式启动（当前会话不受影响）。',
      'result.shortcuts': '快捷方式已重建：{state}。',
      'result.autostartOn': '已开启登录自启：登录 Windows 后会自动打开桌面应用。',
      'result.autostartOff': '已关闭登录自启并删除启动项。',
      'result.restart': '后端正在重启，页面会在十几秒后自动重连。',
      'result.cleanup': '已清理：删除快捷方式，安装目录 {state}。',
      'result.cleanupKept': '已保留（可能有文件被占用）',
      'result.cleanupRemoved': '已删除',
      'result.failed': '操作失败：{message}',
      'hint.summary': '行为说明（点击展开）',
      'hint':
        '安装只写入 %USERPROFILE%\\dsh-chrome-desktop 并创建桌面/开始菜单快捷方式，登录自启默认关闭。「清理安装」会删除这些快捷方式和安装目录；插件在下次宿主启动时会重新部署，若要让清理保持生效，请卸载插件。'
    };

    const en = {
      'row.title': 'DSH Chrome desktop app',
      'row.description':
        'Turns the Web UI into a desktop application (Windows only): a Chrome/Edge app window, a desktop shortcut and a silently started backend. Installing writes to %USERPROFILE%\\dsh-chrome-desktop and creates desktop/start-menu shortcuts; sign-in autostart is off by default.',
      'status.loading': 'Reading install status…',
      'status.installed': 'ready · {home}',
      'status.missing': 'not installed (use “Install / repair”)',
      'status.shortcuts': 'shortcuts: desktop {desktop} · start menu {startMenu}',
      'status.autostart': 'sign-in autostart: {state}',
      'status.autostartOn': 'enabled',
      'status.autostartOff': 'off (default)',
      'status.restartMode': 'double-click: {state}',
      'status.restartModeAttach': 'attach to the running backend',
      'status.restartModeRestart': 'always restart the backend (reconnects this page)',
      'status.unsupported': 'not supported on {platform} yet (Windows only)',
      'status.unavailable': 'status endpoint unavailable (the backend is probably restarting)',
      'button.install': 'Install / repair',
      'button.shortcuts': 'Rebuild shortcuts',
      'button.autostartOn': 'Enable sign-in autostart',
      'button.autostartOff': 'Disable sign-in autostart',
      'button.restart': 'Restart backend',
      'button.restartModeOn': 'Restart on launch: on',
      'button.restartModeOff': 'Restart on launch: off',
      'result.restartModeOn': 'Enabled: double-clicking the shortcut now cycles the backend.',
      'result.restartModeOff': 'Disabled: double-clicking the shortcut attaches to the running backend.',
      'button.cleanup': 'Remove installation',
      'button.working': 'Working…',
      'result.installed': 'Ready: {count} files plus shortcuts{shortcuts}. Double-click “DeepSeek Harness” to start the app (this session is unaffected).',
      'result.shortcuts': 'Shortcuts rebuilt: {state}.',
      'result.autostartOn': 'Sign-in autostart enabled: the app opens when you sign in to Windows.',
      'result.autostartOff': 'Sign-in autostart disabled and its startup entry removed.',
      'result.restart': 'The backend is restarting; the page reconnects in a few seconds.',
      'result.cleanup': 'Removed the shortcuts; launcher home {state}.',
      'result.cleanupKept': 'kept (a file may be in use)',
      'result.cleanupRemoved': 'deleted',
      'result.failed': 'failed: {message}',
      'hint.summary': 'Behaviour notes (click to expand)',
      'hint':
        'Installing only writes to %USERPROFILE%\\dsh-chrome-desktop and creates desktop/start-menu shortcuts; sign-in autostart is off by default. “Remove installation” deletes those shortcuts and the launcher home; the plugin re-provisions on the next host start, so uninstall the plugin if the removal has to stick.'
    };

    /** Interpolate {name} placeholders. */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
      );
    }

    /** Read the host status payload, or null when unreachable. */
    async function readStatus() {
      try {
        const response = await fetch(STATUS_URL, { cache: 'no-store' });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }

    /** POST one JSON action and return its parsed result. */
    async function post(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result === null) {
        throw new Error((result && (result.error || result.message)) || `HTTP ${response.status}`);
      }
      return result;
    }

    /** Sign-in autostart is on when the host says so. */
    function autostartEnabled(status) {
      if (!status) return false;
      return status.autostart === true;
    }

    const LAYOUT = {
      row: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        columnGap: '16px',
        rowGap: '8px',
        padding: '14px 0',
        borderBottom: '1px solid var(--dsw-alias-border-tertiary, #eaecf0)',
      },
      label: { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 260px', minWidth: 0 },
      control: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        flex: '0 1 auto',
        minWidth: 0,
      },
      lines: { display: 'flex', flexDirection: 'column', gap: '2px' },
    };

    function buttonStyleFor(enabled) {
      return {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-secondary, #d0d5dd)',
        background: 'var(--dsw-alias-bg-secondary, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #101828)',
        borderRadius: '8px',
        padding: '6px 14px',
        fontSize: '13px',
        lineHeight: '20px',
        flex: '0 0 auto',
        whiteSpace: 'nowrap',
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.6,
      };
    }

    /** The settings row. */
    function ChromeDesktopRow(props) {
      const t = props.t;
      const [status, setStatus] = react.useState(null);
      const [busy, setBusy] = react.useState(null);
      const [message, setMessage] = react.useState('');

      react.useEffect(() => {
        let cancelled = false;
        const load = async () => {
          const next = await readStatus();
          if (!cancelled) setStatus(next);
        };
        load();
        const timer = setInterval(load, 5000);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, []);

      const run = async (kind) => {
        if (busy !== null) return;
        setBusy(kind);
        setMessage('');
        try {
          if (kind === 'install') {
            const report = await post(INSTALL_URL, {});
            setMessage(
              fill(t('result.installed'), {
                count: typeof report.files === 'number' ? report.files : 6,
                shortcuts: report.shortcuts && report.shortcuts.created && report.shortcuts.created.length > 0 ? ' ✓' : ' ✗',
              }),
            );
          } else if (kind === 'shortcuts') {
            await post(SHORTCUTS_URL, {});
            setMessage(fill(t('result.shortcuts'), { state: 'ok' }));
          } else if (kind === 'autostartOn' || kind === 'autostartOff') {
            const enabled = kind === 'autostartOn';
            await post(AUTOSTART_URL, { enabled });
            setMessage(enabled ? t('result.autostartOn') : t('result.autostartOff'));
          } else if (kind === 'cleanup') {
            const report = await post(CLEANUP_URL, {});
            setMessage(
              fill(t('result.cleanup'), {
                state: report.homeRemoved === true ? t('result.cleanupRemoved') : t('result.cleanupKept'),
              }),
            );
          } else if (kind === 'restartModeOn' || kind === 'restartModeOff') {
            const enabled = kind === 'restartModeOn';
            await post(PREFS_URL, { restartOnLaunch: enabled });
            setMessage(enabled ? t('result.restartModeOn') : t('result.restartModeOff'));
          } else if (kind === 'restart') {
            await post(RESTART_URL, {});
            setMessage(t('result.restart'));
            setBusy(null);
            return;
          }
          setStatus(await readStatus());
        } catch (error) {
          setMessage(fill(t('result.failed'), { message: error instanceof Error ? error.message : String(error) }));
        } finally {
          setBusy(null);
        }
      };

      const ready = status !== null;
      const unsupported = ready && status.platform !== 'win32';
      const installed = ready && status.launcherInstalled === true;
      const autostartOn = autostartEnabled(status);
      const restartOn = !!(status && status.preferences && status.preferences.restartOnLaunch === true);
      const canInstall = busy === null && !unsupported;
      const canManage = canInstall && installed;

      const lines = [];
      if (!ready) {
        lines.push(t('status.loading'));
      } else if (unsupported) {
        lines.push(fill(t('status.unsupported'), { platform: status.platform }));
      } else if (!installed) {
        lines.push(t('status.missing'));
      } else {
        lines.push(fill(t('status.installed'), { home: status.home ?? '' }));
        const created = status.shortcuts && Array.isArray(status.shortcuts.created) ? status.shortcuts.created : [];
        const desktop = created.indexOf('desktop') >= 0 ? '✓' : '✗';
        const startMenu = created.indexOf('start-menu') >= 0 ? '✓' : '✗';
        lines.push(fill(t('status.shortcuts'), { desktop, startMenu }));
        lines.push(fill(t('status.autostart'), { state: autostartOn ? t('status.autostartOn') : t('status.autostartOff') }));
        lines.push(fill(t('status.restartMode'), { state: restartOn ? t('status.restartModeRestart') : t('status.restartModeAttach') }));
      }

      const primaryStyle = {
        ...buttonStyleFor(canInstall),
        borderColor: 'var(--dsw-alias-brand-primary, #4d6bfe)',
        color: 'var(--dsw-alias-brand-primary, #4d6bfe)',
      };

      const secondary = (label, kind, enabled) =>
        jsx('button', {
          type: 'button',
          style: buttonStyleFor(enabled),
          disabled: !enabled,
          onClick: () => {
            void run(kind);
          },
          children: busy === kind ? t('button.working') : label,
        });

      return jsxs('div', {
        style: LAYOUT.row,
        children: [
          jsxs('div', {
            style: LAYOUT.label,
            children: [
              jsx('div', {
                style: { fontSize: '14px', lineHeight: '22px', color: 'var(--dsw-alias-label-primary, #101828)' },
                children: t('row.title'),
              }),
              jsx('div', {
                style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #667085)' },
                children: t('row.description'),
              }),
              jsxs('div', {
                style: {
                  ...LAYOUT.lines,
                  fontSize: '12px',
                  lineHeight: '18px',
                  color: 'var(--dsw-alias-label-tertiary, #667085)',
                },
                children: lines.map((line, index) => jsx('div', { key: String(index), children: line })),
              }),
              message !== ''
                ? jsx('div', {
                    style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #475467)' },
                    children: message,
                  })
                : null,
              jsxs('details', {
                style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #667085)' },
                children: [
                  jsx('summary', {
                    style: { cursor: 'pointer', color: 'var(--dsw-alias-label-secondary, #475467)' },
                    children: t('hint.summary'),
                  }),
                  jsx('div', { style: { marginTop: '4px' }, children: t('hint') }),
                ],
              }),
            ],
          }),
          jsxs('div', {
            style: LAYOUT.control,
            children: [
              jsx('button', {
                type: 'button',
                style: primaryStyle,
                disabled: !canInstall,
                onClick: () => {
                  void run('install');
                },
                children: busy === 'install' ? t('button.working') : t('button.install'),
              }),
              secondary(t('button.shortcuts'), 'shortcuts', canManage),
              secondary(
                autostartOn ? t('button.autostartOff') : t('button.autostartOn'),
                autostartOn ? 'autostartOff' : 'autostartOn',
                canManage,
              ),
              secondary(
                restartOn ? t('button.restartModeOn') : t('button.restartModeOff'),
                restartOn ? 'restartModeOff' : 'restartModeOn',
                canManage,
              ),
              secondary(t('button.restart'), 'restart', canManage),
              // The destructive action stays last so it is never the easiest button to hit.
              secondary(t('button.cleanup'), 'cleanup', canManage),
            ],
          }),
        ],
      });
    }

    /** Services required by the browser half. */
    const inject = ['slots', 'locale'];

    /** Mount the browser half. */
    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chrome-desktop: dictionaries');
      } catch {
        /* a missing locale service must not break the plugin */
      }
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          {
            name: 'settings.general.item',
            id: 'dsh-chrome-desktop',
            order: 60,
            locale: NS,
          },
          ChromeDesktopRow,
        ),
      );
    }

    exports.NS = NS;
    exports.ChromeDesktopRow = ChromeDesktopRow;
    exports.apply = apply;
    exports.inject = inject;
    exports.dictionaries = { zh, en };
    exports.autostartEnabled = autostartEnabled;
    exports.LAYOUT = LAYOUT;
    exports.buttonStyleFor = buttonStyleFor;
    return module.exports;
  },
});
