#!/usr/bin/env node
/**
 * Upload this plugin to GitHub through the REST API — no git installation needed.
 *
 * Usage:
 *   node --use-system-ca tools/publish-github.mjs                 # token from env or default file
 *   node --use-system-ca tools/publish-github.mjs --dry-run       # show what would be uploaded
 *   node --use-system-ca tools/publish-github.mjs --token-file D:\token.txt
 *
 * The token is read from (in order):
 *   1. --token-file <path>
 *   2. $GITHUB_TOKEN
 *   3. %USERPROFILE%\.github-token.txt
 *
 * It needs a *Personal Access Token* with `repo` scope. GitHub does not accept
 * account passwords for API calls, so a password must never be put here.
 *
 * `--use-system-ca` matters on machines behind a TLS-inspecting proxy: Node's
 * bundled CA store rejects the intercepted certificate while the Windows store
 * trusts it, and api.github.com is unreachable without the flag.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.github.com'
const SKIP = new Set(['.git', 'node_modules'])
const SKIP_FILES = [/\.log$/i, /\.tgz$/i, /^\.DS_Store$/]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const tokenFileArg = args.indexOf('--token-file')
const tokenFile = tokenFileArg >= 0 ? args[tokenFileArg + 1] : undefined

async function readToken() {
  const candidates = [tokenFile, process.env.GITHUB_TOKEN, join(homedir(), '.github-token.txt')].filter(Boolean)
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const raw = (await readFile(candidate, 'utf8')).trim()
    if (raw.length > 0) return { token: raw.split(/\r?\n/)[0].trim(), source: candidate }
  }
  throw new Error(
    'No token found. Create a Personal Access Token with the `repo` scope, save it to ' +
      join(homedir(), '.github-token.txt') +
      ', and run this script again.',
  )
}

async function call(token, method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-chrome-desktop-publisher',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: response.status, ok: response.ok, body: parsed }
}

/** Walk the plugin tree, skipping VCS, dependencies, logs and tarballs. */
async function collect(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collect(full, out)
      continue
    }
    if (!entry.isFile()) continue
    if (SKIP_FILES.some((re) => re.test(entry.name))) continue
    const info = await stat(full)
    out.push({ path: relative(ROOT, full).replaceAll('\\', '/'), full, size: info.size })
  }
  return out
}

const files = (await collect(ROOT)).sort((a, b) => a.path.localeCompare(b.path))
console.log(`files to upload: ${files.length}`)
for (const file of files) console.log(`  ${file.path} (${file.size} B)`)

if (dryRun) {
  console.log('\n--dry-run: nothing was sent to GitHub')
  process.exit(0)
}

const { token, source } = await readToken()
console.log(`\ntoken: ${source} (not printed)`)

const me = await call(token, 'GET', '/user')
if (!me.ok) {
  console.error(`auth failed: HTTP ${me.status} ${me.body?.message ?? ''}`)
  process.exit(1)
}
const owner = me.body.login
console.log(`authenticated as: ${owner}`)

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const repoName = pkg.repository?.url?.match(/github\.com\/[^/]+\/([^/.]+)/)?.[1] ?? 'dsh-chrome-desktop'

let repo = await call(token, 'GET', `/repos/${owner}/${repoName}`)
if (repo.status === 404) {
  console.log(`creating repository ${owner}/${repoName} …`)
  const created = await call(token, 'POST', '/user/repos', {
    name: repoName,
    description: pkg.description,
    homepage: `https://github.com/${owner}/${repoName}`,
    private: false,
    has_issues: true,
    has_wiki: false,
    auto_init: false,
  })
  if (!created.ok) {
    console.error(`create failed: HTTP ${created.status} ${created.body?.message ?? ''}`)
    process.exit(1)
  }
  repo = created
} else if (!repo.ok) {
  console.error(`repo lookup failed: HTTP ${repo.status} ${repo.body?.message ?? ''}`)
  process.exit(1)
} else {
  console.log(`repository exists: ${repo.body.html_url}`)
}

// Upload every file as a blob, assemble one tree, one commit, and point main at it.
// A brand-new repository rejects the Git Data API with 409 ("Git Repository is
// empty") until it has one commit, so the first file goes in through the Contents
// API to create that commit.
let empty = false
const existingRef = await call(token, 'GET', `/repos/${owner}/${repoName}/git/ref/heads/main`)
if (existingRef.status === 404 || existingRef.status === 409) {
  empty = true
}

const pending = [...files]
if (empty) {
  const seed = pending.shift()
  const seedContent = await readFile(seed.full)
  const seeded = await call(token, 'PUT', `/repos/${owner}/${repoName}/contents/${seed.path}`, {
    message: 'chore: initialize repository',
    content: seedContent.toString('base64'),
    branch: 'main',
  })
  if (!seeded.ok) {
    console.error(`seed commit failed for ${seed.path}: HTTP ${seeded.status} ${seeded.body?.message ?? ''}`)
    process.exit(1)
  }
  console.log(`initialized repository with ${seed.path}`)
}

const tree = []
for (const file of pending) {
  const content = await readFile(file.full)
  const blob = await call(token, 'POST', `/repos/${owner}/${repoName}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  })
  if (!blob.ok) {
    console.error(`blob failed for ${file.path}: HTTP ${blob.status} ${blob.body?.message ?? ''}`)
    process.exit(1)
  }
  tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.body.sha })
}
console.log(`blobs uploaded: ${tree.length}`)

const treeResult = await call(token, 'POST', `/repos/${owner}/${repoName}/git/trees`, { tree })
if (!treeResult.ok) {
  console.error(`tree failed: HTTP ${treeResult.status} ${treeResult.body?.message ?? ''}`)
  process.exit(1)
}

const branch = await call(token, 'GET', `/repos/${owner}/${repoName}/git/ref/heads/main`)
const parents = branch.ok ? [branch.body.object.sha] : []
const commit = await call(token, 'POST', `/repos/${owner}/${repoName}/git/commits`, {
  message: parents.length > 0 ? 'chore: sync dsh-chrome-desktop' : 'feat: initial dsh-chrome-desktop plugin',
  tree: treeResult.body.sha,
  parents,
})
if (!commit.ok) {
  console.error(`commit failed: HTTP ${commit.status} ${commit.body?.message ?? ''}`)
  process.exit(1)
}

const refPath = `/repos/${owner}/${repoName}/git/refs/heads/main`
const ref = parents.length > 0
  ? await call(token, 'PATCH', refPath, { sha: commit.body.sha, force: false })
  : await call(token, 'POST', '/repos/' + `${owner}/${repoName}` + '/git/refs', { ref: 'refs/heads/main', sha: commit.body.sha })
if (!ref.ok) {
  console.error(`ref update failed: HTTP ${ref.status} ${ref.body?.message ?? ''}`)
  process.exit(1)
}

console.log(`\ndone: https://github.com/${owner}/${repoName}`)
console.log(`commit: ${commit.body.sha}`)
