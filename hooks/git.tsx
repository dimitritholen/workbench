import type { Color, EngineInterface, RenderInput } from 'claude-code'

import type { Change, Confirm, GitView } from '../types'
import { isConfirmed, isStaged, isUnstaged } from './lib'
import { INSET, fit, panel } from './ui'

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
  if (!g) return <Text dimColor>Laden…</Text>
  if (!g.isRepo) {
    return panel(ui, 'Git', <Text dimColor>{g.error ?? 'Deze map is geen git-repository.'}</Text>)
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
      <Text color="success">✓ schoon</Text>
    ) : (
      <Text color="warning">● {g.changes.length} gewijzigd</Text>
    )

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text color="claude" bold>
            {g.branch || '(geen branch)'}
          </Text>
          <Text dimColor>{g.upstream ? ` → ${g.upstream}` : ' · geen upstream'}</Text>
          {g.ahead > 0 && <Text color="success"> ↑{g.ahead}</Text>}
          {g.behind > 0 && <Text color="warning"> ↓{g.behind}</Text>}
        </Text>
        {status}
      </Box>
      {g.error && <Text color="error">{g.error}</Text>}

      <Box gap={2} flexWrap="wrap">
        {chip('pull', '↓ pull', 'suggestion', () => a.run(['pull', '--ff-only'], 'Bijgewerkt.', NETWORK_MS))}
        <Button key="push" plain onPress={a.push}>
          {isAsking ? (
            <Text inverse bold color="warning">
              {` ↑ push ${g.upstream ? `${g.ahead} commit(s) ` : ''}naar ${target}? `}
            </Text>
          ) : (
            <Text color="suggestion">↑ push</Text>
          )}
        </Button>
        {chip('stash', '⊟ stash', 'suggestion', () => a.run(['stash'], 'Gestasht.'))}
        {g.stashes > 0 && chip('pop', `⊞ pop (${g.stashes})`, 'suggestion', () => a.run(['stash', 'pop'], 'Stash teruggezet.'))}
        {chip('refresh', '↻', 'inactive', a.refresh)}
      </Box>

      {panel(
        ui,
        `Gestaged ${staged.length}`,
        staged.length === 0 ? (
          <Text dimColor>Niets gestaged. Klik een wijziging om hem toe te voegen.</Text>
        ) : (
          <Box flexDirection="column">
            {staged.map(c => fileRow(c, c.index, `u:${c.path}`, ['restore', '--staged', '--', c.path], 'Unstaged.', '−'))}
          </Box>
        ),
      )}
      {panel(
        ui,
        `Wijzigingen ${unstaged.length}`,
        unstaged.length === 0 ? (
          <Text dimColor>Geen wijzigingen in de werkmap.</Text>
        ) : (
          <Box flexDirection="column">
            {unstaged.map(c => fileRow(c, c.tree, `s:${c.path}`, ['add', '--', c.path], 'Gestaged.', '+'))}
          </Box>
        ),
      )}

      {panel(
        ui,
        'Commit',
        <Box flexDirection="column">
          {'Input' in ui ? (
            <ui.Input
              key="msg"
              placeholder="Beschrijf de wijziging…"
              value={draft}
              submitLabel="commit"
              onInput={value => a.draft(value)}
              onSubmit={value => a.submit(value)}
            />
          ) : (
            <Text dimColor>Committen kan vanuit de terminal of desktop.</Text>
          )}
          <Box>
            <Button key="commit" label={`Commit ${staged.length} bestand(en)`} variant="primary" onPress={a.commit} />
          </Box>
        </Box>,
      )}

      {panel(
        ui,
        'Commits',
        g.log.length === 0 ? (
          <Text dimColor>Nog geen commits.</Text>
        ) : (
          <Box flexDirection="column">
            {g.log.map(c => (
              <Box justifyContent="space-between">
                <Text wrap="truncate-end">
                  <Text color="claude">●</Text> <Text color="warning">{c.hash}</Text> {c.subject}
                </Text>
                <Text dimColor> {c.when}</Text>
              </Box>
            ))}
          </Box>
        ),
      )}
    </Box>
  )
}
