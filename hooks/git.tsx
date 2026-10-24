import type { Color, EngineInterface, RenderInput } from 'claude-code'

import type { Change, Confirm, GitView } from '../types'
import { isConfirmed, isStaged, isUnstaged } from './lib'
import { block, fit, hints, INSET } from './ui'

export type GitActions = {
  run: (args: string[], done: string, timeoutMs?: number) => unknown
  push: () => unknown
  commit: () => unknown
  draft: (text: string) => unknown
  submit: (text: string) => unknown
  refresh: () => unknown
}

export type GitPaneView = { g: GitView | null; pending: Confirm | null; draft: string; columns: number }

export const NETWORK_MS = 120000

// A porcelain status letter as it is drawn: untracked shows as U.
const badge = (letter: string): [string, Color] =>
  letter === '?' ? ['U', 'claude']
  : letter === 'A' ? ['A', 'success']
  : letter === 'D' ? ['D', 'error']
  : letter === 'R' || letter === 'C' ? [letter, 'suggestion']
  : [letter, 'warning']

export function renderGit($: EngineInterface, e: RenderInput, v: GitPaneView, a: GitActions) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const { g, pending, draft } = v
  if (!g) return block(ui, { title: 'Git' }, <Text dimColor>Loading…</Text>)
  if (!g.isRepo) {
    return block(ui, { title: 'Git' }, <Text dimColor>{g.error ?? 'This folder is not a git repository.'}</Text>)
  }

  const inner = Math.max(20, v.columns - INSET)
  const staged = g.changes.filter(isStaged)
  const unstaged = g.changes.filter(isUnstaged)
  const isAsking = isConfirmed(pending, 'push')
  const target = g.upstream ?? `origin/${g.branch}`

  const fileRow = (c: Change, letter: string, key: string, args: string[], done: string, sign: string) => {
    const [shown, color] = badge(letter)
    return (
      <Button key={key} plain onPress={() => a.run(args, done)}>
        <Text color={color} bold>
          {shown}
        </Text>{' '}
        {fit(c.path, inner - 4)}
        <Text dimColor> {sign}</Text>
      </Button>
    )
  }

  const chip = (key: string, label: string, color: Color, onPress: () => unknown) => (
    <Button key={key} plain onPress={onPress}>
      <Text color={color}>{label}</Text>
    </Button>
  )

  const status =
    g.changes.length === 0 ? (
      <Text color="success">✓ clean</Text>
    ) : (
      <Text color="warning">● {g.changes.length} changed</Text>
    )

  return (
    <Box flexDirection="column">
      {block(
        ui,
        {
          title: g.branch || "(no branch)",
          right: status,
          footer: `${g.upstream ?? 'no upstream'}${g.ahead ? ` ↑${g.ahead}` : ''}${g.behind ? ` ↓${g.behind}` : ''}`,
          isFocused: true,
        },
        <Box flexDirection="column">
          {g.error && <Text color="error">{g.error}</Text>}
          <Box gap={2} flexWrap="wrap">
        {chip('pull', '↓ pull', 'suggestion', () => a.run(['pull', '--ff-only'], 'Up to date.', NETWORK_MS))}
        <Button key="push" plain onPress={a.push}>
          {isAsking ? (
            <Text inverse bold color="warning">
              {` ↑ push ${g.upstream ? `${g.ahead} commit(s) ` : ''}to ${target}? `}
            </Text>
          ) : (
            <Text color="suggestion">↑ push</Text>
          )}
        </Button>
        {chip('stash', '⊟ stash', 'suggestion', () => a.run(['stash'], 'Stashed.'))}
        {g.stashes > 0 && chip('pop', `⊞ pop (${g.stashes})`, 'suggestion', () => a.run(['stash', 'pop'], 'Stash applied.'))}
        {chip('refresh', '↻', 'inactive', a.refresh)}
          </Box>
        </Box>,
      )}

      {block(
        ui,
        { title: 'Staged', footer: `${staged.length}` },
        staged.length === 0 ? (
          <Text dimColor>Nothing staged. Click a change to stage it.</Text>
        ) : (
          <Box flexDirection="column">
            {staged.map(c => fileRow(c, c.index, `u:${c.path}`, ['restore', '--staged', '--', c.path], 'Unstaged.', '−'))}
          </Box>
        ),
      )}
      {block(
        ui,
        { title: 'Changes', footer: `${unstaged.length}` },
        unstaged.length === 0 ? (
          <Text dimColor>No changes in the working tree.</Text>
        ) : (
          <Box flexDirection="column">
            {unstaged.map(c => fileRow(c, c.tree, `s:${c.path}`, ['add', '--', c.path], 'Staged.', '+'))}
          </Box>
        ),
      )}

      {block(
        ui,
        { title: 'Commit' },
        <Box flexDirection="column">
          {'Input' in ui ? (
            <ui.Input
              key="msg"
              placeholder="Describe the change…"
              value={draft}
              submitLabel="commit"
              onInput={value => a.draft(value)}
              onSubmit={value => a.submit(value)}
            />
          ) : (
            <Text dimColor>Commit from the terminal or desktop.</Text>
          )}
          <Box>
            <Button key="commit" label={`Commit ${staged.length} file(s)`} variant="primary" onPress={a.commit} />
          </Box>
        </Box>,
      )}

      {block(
        ui,
        { title: 'Log', footer: `${g.log.length}` },
        g.log.length === 0 ? (
          <Text dimColor>No commits yet.</Text>
        ) : (
          <Box flexDirection="column">
            {g.log.map(c => (
              <Box justifyContent="space-between">
                <Text wrap="truncate-end">
                  <Text color="claude">●</Text> <Text color="suggestion">{c.hash}</Text> {c.subject}
                </Text>
                <Text dimColor> {c.when}</Text>
              </Box>
            ))}
          </Box>
        ),
      )}
      {hints(ui, [
        ['click', 'stage/unstage'],
        ['⏎', 'commit'],
        ['push', 'twice'],
      ])}
    </Box>
  )
}
