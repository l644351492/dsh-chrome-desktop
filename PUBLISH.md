# 发布记录

本文件记录这个插件的发布身份与上传方式，方便换机器或换人接手时直接照做。

## GitHub 账号

| 项目 | 值 |
| --- | --- |
| 用户名 | `l644351492` |
| 邮箱 | `644351492@qq.com` |
| 仓库 | https://github.com/l644351492/dsh-chrome-desktop |
| 默认分支 | `main` |

> 账号密码**不要**记录在任何地方。GitHub 的 git/API 操作只接受 Personal Access Token
> （`repo` 权限）或 SSH 密钥，账号密码早已被禁用。一旦密码出现在聊天记录、日志或
> 提交里，应立即到 GitHub 设置中修改。

## 上传方式

本机没有安装 git，且 `github.com:443` 被网络阻断，但 `api.github.com` 可访问
（需 `--use-system-ca`，否则 Node 自带的 CA 不认中间人代理证书）。因此上传走 REST API：

```powershell
# token 存放位置（单行、无引号、无换行）
#   C:\Users\hp\.github-token.txt
cd C:\Dev\AI\Plugins\dsh-chrome-desktop
node --use-system-ca tools/publish-github.mjs
```

脚本的行为：

1. 从 `--token-file` → `$env:GITHUB_TOKEN` → `%USERPROFILE%\.github-token.txt` 依次找 token
2. `GET /user` 确认身份（**用户名以 token 为准**，无需手填）
3. 仓库不存在则创建（public、不开 wiki、不自动 init）
4. 空仓库会先用 Contents API 提交第一个文件，绕开 Git Data API 的 `409 Git Repository is empty`
5. 其余文件走 blob → tree → commit → 更新 `main`

`--dry-run` 只列出将上传的文件，不发送任何请求。

## npm 发布（尚未执行）

```powershell
cd C:\Dev\AI\Plugins\dsh-chrome-desktop
npm login           # 无 scope 的公开包，直接发布
npm publish
```

发布后用户安装：

```powershell
dsh plugin --profile web add dsh-chrome-desktop
```

## 已知网络限制

| 目标 | 状态 | 说明 |
| --- | --- | --- |
| `api.github.com` | 可用（加 `--use-system-ca`） | 上传、查询都靠它 |
| `github.com` | 连接超时 | 网页浏览、`git clone` 需要代理 |
| `codeload.github.com` | 证书校验失败 | 同上，可用 `gh-proxy.com` 之类镜像 |

因此 `dsh plugin add github:...` 这类通过 git 拉取的安装方式在本机不可用，分发应以 npm 为准。
