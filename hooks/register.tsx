import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Confirm, GitView, Preview, Proc, Snapshot, Tab } from '../types'
import type { FileListPost } from './filelist'
import { loadPreview, mention, renderFiles } from './files'
import { NETWORK_MS, renderGit } from './git'
import { type Os, isConfirmed, isStaged, join, LINK } from './lib'
import { REFRESH_MS, detectOs, killArgv, probe } from './probes'
import { readGit, runGit } from './repo'
import { renderSystem } from './system'
import { block } from './ui'

const PANE = 'workbench'
const TITLE = 'Workbench'
const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'files', label: 'Files', hotkey: '1' },
  { id: 'system', label: 'System', hotkey: '2' },
  { id: 'git', label: 'Git', hotkey: '3' },
]
const GIT_EVERY_TICKS = 2
const HISTORY = 120

// Change a shape tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const tab = atom({ plugin: 'workbench', key: 'tab' } as const, 'files' as Tab)
const dir = atom({ plugin: 'workbench', key: 'dir' } as const, '')
const preview = atom({ plugin: 'workbench', key: 'preview' } as const, null as Preview | null, {
  shape: 'preview-1',
})
const snapshot = atom({ plugin: 'workbench', key: 'snapshot' } as const, null as Snapshot | null, {
  shape: 'snapshot-1',
})
const git = atom({ plugin: 'workbench', key: 'git' } as const, null as GitView | null, { shape: 'git-1' })
const confirm = atom({ plugin: 'workbench', key: 'confirm' } as const, null as Confirm | null)
const message = atom({ plugin: 'workbench', key: 'message' } as const, '')

// Set on every session.start, which a reload runs too.
let os: Os = 'linux'
let folder = ''

async function refreshSystem($: EngineInterface) {
  const snap = await probe($, os).catch(async error => {
    await $.ui.status(`workbench: ${error instanceof Error ? error.message : error}`)
    return undefined
  })
  if (snap) await update($, snapshot, prev => ({ ...snap, history: [...(prev?.history ?? []), snap.cpu].slice(-HISTORY) }))
}

async function refreshGit($: EngineInterface) {
  const view = await readGit($)
  await update($, git, () => view)
}

async function refresh($: EngineInterface, t: Tab) {
  if (t === 'system') await refreshSystem($)
  if (t === 'git') await refreshGit($)
}

async function select($: EngineInterface, t: Tab) {
  await update($, tab, () => t)
  await refresh($, t)
}

let isTicking = false

async function tick($: EngineInterface, count: number) {
  if (isTicking) return
  isTicking = true
  try {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (!pane?.isShown) return
    const current = await read($, tab)
    if (current === 'system') await refreshSystem($)
    // git status costs more than ps; every other tick is often enough
    if (current === 'git' && count % GIT_EVERY_TICKS === 0) await refreshGit($)
  } finally {
    isTicking = false
  }
}

// True on the second press of `action` within CONFIRM_MS; the first one asks.
async function confirmed($: EngineInterface, action: string) {
  if (isConfirmed(await read($, confirm), action)) {
    await update($, confirm, () => null)
    return true
  }
  await update($, confirm, () => ({ action, at: Date.now() }))
  return false
}

async function kill($: EngineInterface, p: Proc) {
  if (!(await confirmed($, `kill:${p.pid}`))) return
  const r = await $.process.run(killArgv(os, p.pid)).catch(() => undefined)
  await $.ui.toast(r?.exitCode === 0 ? `Stopped ${p.name} (${p.pid}).` : `Could not stop ${p.pid}: ${r?.stderr.trim() ?? ''}`)
  await refreshSystem($)
}

async function openFile($: EngineInterface, path: string) {
  const shown = await loadPreview($, path)
  await update($, preview, () => shown)
}

async function gitRun($: EngineInterface, args: string[], done: string, timeoutMs?: number) {
  const g = await read($, git)
  if (!g?.isRepo) return false
  const r = await runGit($, args, g.root, timeoutMs)
  await $.ui.toast(r.ok ? r.out.split('\n')[0] || done : `git ${args[0]}: ${r.out.slice(0, 300)}`)
  await refreshGit($)
  return r.ok
}

async function push($: EngineInterface) {
  const g = await read($, git)
  if (!g?.isRepo || !(await confirmed($, 'push'))) return
  await gitRun($, g.upstream ? ['push'] : ['push', '-u', 'origin', g.branch], 'Pushed.', NETWORK_MS)
}

async function commit($: EngineInterface) {
  const g = await read($, git)
  const text = (await read($, message)).trim()
  if (!g?.changes.some(isStaged)) return void (await $.ui.toast('Nothing staged to commit.'))
  if (!text) return void (await $.ui.toast('Write a commit message first.'))
  if (await gitRun($, ['commit', '-m', text], 'Committed.')) await update($, message, () => '')
}

// What the file list Client posts: open a folder or file, go up, or mention a path.
async function fileListMessage($: EngineInterface, post: FileListPost) {
  const here = await read($, dir)
  if (post.type === 'tab') {
    const t = TABS[post.index]
    return t && select($, t.id)
  }
  if (post.type === 'up') return update($, dir, d => d.split('/').slice(0, -1).join('/'))
  const path = join(here, post.name)
  if (post.type === 'mention') return mention($, path)
  return post.isDir ? update($, dir, () => path) : openFile($, path)
}

async function submit($: EngineInterface, text: string) {
  await update($, message, () => text)
  await commit($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    os = await detectOs($, e.cwd)
    folder = e.cwd.split(/[\\/]/).filter(Boolean).pop() ?? e.cwd
    await $.command.register({ name: 'workbench', description: 'Open or close the Files / System / Git pane' })
    // A new session starts at the working directory again.
    await update($, dir, () => '')
    await update($, preview, () => null)
    void $.ui.open({ id: PANE, title: TITLE })

    let ticks = 0
    $.clock.every(REFRESH_MS[os], () => void tick($, ++ticks).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'workbench' }, async $ => {
    // a toggle, so the pane closes without a mouse
    if ((await $.ui.panes()).find(p => p.id === PANE)?.isShown) {
      await $.ui.close({ id: PANE })
      return { text: 'Workbench closed.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    await refresh($, await read($, tab))
    return { text: 'Workbench opened.' }
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    await fileListMessage($, e.data as FileListPost)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const current = await read($, tab)
    const columns = e.props.bodyColumns
    const rows = e.props.scroll.bodyRows

    let body
    if (current === 'files') {
      body = await renderFiles($, e, {
        here: await read($, dir),
        shown: await read($, preview),
        columns,
        rows,
        onDir: path => update($, dir, () => path),
        onFile: path => openFile($, path),
        onBack: () => update($, preview, () => null),
      })
    } else if (current === 'system') {
      body = renderSystem($, e, {
        snap: await read($, snapshot),
        pending: await read($, confirm),
        columns,
        onKill: p => kill($, p),
      })
    } else {
      body = renderGit(
        $,
        e,
        { g: await read($, git), pending: await read($, confirm), draft: await read($, message), columns },
        {
          run: (args, done, timeoutMs) => gitRun($, args, done, timeoutMs),
          push: () => push($),
          commit: () => commit($),
          draft: text => update($, message, () => text),
          submit: text => submit($, text),
          refresh: () => refreshGit($),
        },
      )
    }

    return (
      <Box flexDirection="column">
        {block(
          ui,
          { title: 'workbench', right: <Text color="inactive">{folder}</Text> },
          <Box>
            {TABS.map((t, i) => (
              <Box key={`tabs:${t.id}`}>
                {i > 0 && <Text color="subtle"> │ </Text>}
                <Button key={`tab:${t.id}`} plain hotkey={t.hotkey} onPress={() => select($, t.id)}>
                  {t.id === current ? (
                    <Text bold underline color="claude">
                      {t.label}
                    </Text>
                  ) : (
                    <Text color={LINK}>{t.label}</Text>
                  )}
                </Button>
              </Box>
            ))}
          </Box>,
        )}
        {body}
      </Box>
    )
  })
}
