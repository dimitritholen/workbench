import type { EngineInterface, RenderInput } from 'claude-code'

import type { Confirm, GitView } from '../types'
import { isConfirmed, isStaged, isUnstaged } from './lib'

export type GitActions = {
  run: (args: string[], done: string, timeoutMs?: number) => unknown
  push: () => unknown
  commit: () => unknown
  draft: (text: string) => unknown
  submit: (text: string) => unknown
  refresh: () => unknown
}

export type GitPaneView = { g: GitView | null; pending: Confirm | null; draft: string }

export const NETWORK_MS = 120000

export function renderGit($: EngineInterface, e: RenderInput, v: GitPaneView, a: GitActions) {
  const table = $.ui.resolve(e)
  const { Box, Text, Button } = table
  const { g, pending, draft } = v
  if (!g) return <Text dimColor>Laden…</Text>
  if (!g.isRepo) return <Text dimColor>{g.error ?? 'Deze map is geen git-repository.'}</Text>

  const staged = g.changes.filter(isStaged)
  const unstaged = g.changes.filter(isUnstaged)
  const isAsking = isConfirmed(pending, 'push')
  const target = g.upstream ?? `origin/${g.branch}`
  const pushLabel = isAsking ? `Push ${g.upstream ? `${g.ahead} commit(s) ` : ''}naar ${target}?` : 'Push'

  return (
    <Box flexDirection="column">
      <Text>
        <Text weight="bold">{g.branch || '(geen branch)'}</Text>
        <Text dimColor>
          {g.upstream ? ` → ${g.upstream}` : ' (geen upstream)'}
          {g.ahead ? `  ↑${g.ahead}` : ''}
          {g.behind ? `  ↓${g.behind}` : ''}
        </Text>
      </Text>
      {g.error && <Text color="error">{g.error}</Text>}

      <Box gap={1} flexWrap="wrap">
        <Button key="pull" label="Pull" onPress={() => a.run(['pull', '--ff-only'], 'Bijgewerkt.', NETWORK_MS)} />
        <Button key="push" label={pushLabel} variant={isAsking ? 'primary' : undefined} onPress={a.push} />
        <Button key="stash" label="Stash" onPress={() => a.run(['stash'], 'Gestasht.')} />
        {g.stashes > 0 && (
          <Button key="pop" label={`Pop (${g.stashes})`} onPress={() => a.run(['stash', 'pop'], 'Stash teruggezet.')} />
        )}
        <Button key="refresh" label="↻" onPress={a.refresh} />
      </Box>

      <Text weight="bold">Gestaged ({staged.length})</Text>
      {staged.map(c => (
        <Button key={`u:${c.path}`} plain onPress={() => a.run(['restore', '--staged', '--', c.path], 'Unstaged.')}>
          <Text color="diffRemoved">−</Text> <Text color="success">{c.index}</Text> {c.path}
        </Button>
      ))}
      <Text weight="bold">Wijzigingen ({unstaged.length})</Text>
      {unstaged.map(c => (
        <Button key={`s:${c.path}`} plain onPress={() => a.run(['add', '--', c.path], 'Gestaged.')}>
          <Text color="success">+</Text> <Text color="warning">{c.tree}</Text> {c.path}
        </Button>
      ))}

      {'Input' in table ? (
        <table.Input
          key="msg"
          label="Bericht "
          placeholder="Commitbericht"
          value={draft}
          submitLabel="commit"
          onInput={value => a.draft(value)}
          onSubmit={value => a.submit(value)}
        />
      ) : (
        <Text dimColor>Committen kan vanuit de terminal of desktop.</Text>
      )}
      <Box>
        <Button key="commit" label={`Commit (${staged.length})`} variant="primary" onPress={a.commit} />
      </Box>

      <Text weight="bold">Commits</Text>
      {g.log.length === 0 && <Text dimColor>Nog geen commits.</Text>}
      {g.log.map(c => (
        <Text wrap="truncate-end">
          <Text color="warning">{c.hash}</Text> {c.subject} <Text dimColor>{c.author}, {c.when}</Text>
        </Text>
      ))}
    </Box>
  )
}
