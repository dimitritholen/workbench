import type { EngineInterface } from 'claude-code'

import type { GitView } from '../types'
import { LOG_FORMAT, parseLog, parseStatus } from './lib'

// Never wait on a credential prompt nobody can answer: fail and say so instead.
const ENV = { GIT_TERMINAL_PROMPT: '0' }

export async function runGit($: EngineInterface, args: string[], cwd?: string, timeoutMs = 30000) {
  try {
    const r = await $.process.run(['git', ...args], { cwd, env: ENV, timeoutMs })
    return { ok: r.exitCode === 0, out: (r.exitCode === 0 ? r.stdout || r.stderr : r.stderr || r.stdout).trim() }
  } catch (error) {
    return { ok: false, out: String(error instanceof Error ? error.message : error) }
  }
}

const EMPTY: GitView = { isRepo: false, root: '', branch: '', ahead: 0, behind: 0, changes: [], log: [], stashes: 0 }

export async function readGit($: EngineInterface): Promise<GitView> {
  const top = await runGit($, ['rev-parse', '--show-toplevel'])
  if (!top.ok) {
    const notRepo = /not a git repository/i.test(top.out)
    return { ...EMPTY, error: notRepo ? undefined : `git niet gevonden of mislukt: ${top.out}` }
  }
  const root = top.out
  const [status, log, stash] = await Promise.all([
    runGit($, ['status', '--porcelain=v1', '-b', '-z'], root),
    runGit($, ['log', '-n', '15', `--format=${LOG_FORMAT}`], root),
    runGit($, ['stash', 'list'], root),
  ])
  if (!status.ok) return { ...EMPTY, isRepo: true, root, error: status.out }
  return {
    ...EMPTY,
    ...parseStatus(status.out),
    isRepo: true,
    root,
    // an empty repository has no log yet: git log fails, the list stays empty
    log: log.ok ? parseLog(log.out) : [],
    stashes: stash.ok ? stash.out.split('\n').filter(Boolean).length : 0,
  }
}
