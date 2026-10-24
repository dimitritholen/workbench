import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FIXTURES } from './fixtures'

const PANE = {
  plugin: 'workbench',
  component: 'Pane',
  requestId: 'workbench',
  props: {
    title: 'Workbench',
    isFocused: true,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// Stands for the host: answers each command the mod runs from the fixtures and records it.
function host(on: On) {
  const ran: string[] = []
  const filled: string[] = []
  const clock = mock.clock(on)
  on('process.run', (_, e) => {
    const cmd = e.argv.join(' ')
    ran.push(cmd)
    if (cmd === 'uname -s') return { value: ok('Linux\n') }
    if (cmd.startsWith('git rev-parse')) return { value: ok('/repo\n') }
    if (cmd.startsWith('git status')) return { value: ok(FIXTURES.git.status) }
    if (cmd.startsWith('git log')) return { value: ok(FIXTURES.git.log) }
    if (cmd.startsWith('df')) return { value: ok(FIXTURES.linux.df) }
    if (cmd.startsWith('ps')) return { value: ok(FIXTURES.linux.ps) }
    return { value: ok('') }
  })
  on('fs.read', (_, e) => ({ value: (FIXTURES.linux as Record<string, string>)[e.path.replace('/proc/', '')] ?? '' }))
  on('fs.list', () => ({
    value: [
      { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'README.md', kind: 'file', size: 2048, mtimeMs: 1, isLink: false },
      { name: 'node_modules', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))
  on('command.register', () => ({ value: { command: 'workbench' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'workbench', title: 'Workbench', isShown: true, isFocused: true, isPlaced: true }] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { ran, filled, clock }
}

test('files: folders first, node_modules hidden, @ fills the prompt', async ($, on) => {
  const { filled } = host(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  const rows = await ui.findAll({ type: 'Button' })
  const keys = rows.map(r => r.key)
  expect(keys).toContain('f:src')
  expect(keys).toContain('f:README.md')
  expect(keys).not.toContain('f:node_modules')
  expect(keys.indexOf('f:src')).toBeLessThan(keys.indexOf('f:README.md'))

  await ui.press({ key: 'm:README.md' })
  expect(filled).toEqual(['@README.md '])
  await ui.unmount()
})

test('system: refreshes on the clock; kill asks first, then runs kill', async ($, on) => {
  const { ran, clock } = host(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab:system' })
  expect(await ui.find({ type: 'Text', text: /Schijven/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/mnt\/c/ })).toBeDefined()
  const probes = ran.filter(c => c.startsWith('ps')).length
  await clock.advance(2000)
  expect(ran.filter(c => c.startsWith('ps')).length).toBe(probes + 1)

  const first = (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith('kill:'))
  expect(first).toBeDefined()
  await ui.press({ key: first!.key! })
  expect(ran.some(c => c.startsWith('kill '))).toBe(false)
  expect((await ui.find({ key: first!.key! }))?.text).toMatch(/kill .*\?/)

  await ui.press({ key: first!.key! })
  expect(ran).toContain(`kill ${first!.key!.slice('kill:'.length)}`)
  await ui.unmount()
})

test('git: status and log, push only on the second press', async ($, on) => {
  const { ran } = host(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab:git' })
  expect(await ui.find({ type: 'Text', text: /second/ })).toBeDefined()
  expect(await ui.find({ key: 'u:new.txt' })).toBeDefined()
  expect(await ui.find({ key: 's:untracked.txt' })).toBeDefined()

  await ui.press({ key: 'push' })
  expect(ran.some(c => c.startsWith('git push'))).toBe(false)
  expect((await ui.find({ key: 'push' }))?.text).toMatch(/push 1 commit\(s\) naar origin\/main\?/)

  await ui.press({ key: 'push' })
  expect(ran).toContain('git push')

  await ui.press({ key: 's:untracked.txt' })
  expect(ran).toContain('git add -- untracked.txt')

  await ui.input({ key: 'msg', text: 'fix: iets' })
  expect(ran).toContain('git commit -m fix: iets')
  await ui.unmount()
})

test('git: outside a repository the tab says so', async ($, on) => {
  on('process.run', (_, e) =>
    e.argv[0] === 'git'
      ? { value: { ...ok(''), exitCode: 128, stderr: 'fatal: not a git repository' } }
      : { value: ok('Linux\n') },
  )
  on('command.register', () => ({ value: { command: 'workbench' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab:git' })
  expect(await ui.find({ type: 'Text', text: /geen git-repository/ })).toBeDefined()
  await ui.unmount()
})
