export type Tab = 'files' | 'system' | 'git'

export type Proc = { pid: number; name: string; cpu: number; mem: number }
export type Disk = { mount: string; used: number; total: number }
// cpu is % of the whole machine; a Proc's cpu is per core, as htop shows it.
export type Snapshot = {
  cpu: number
  mem: { used: number; total: number }
  load?: number[]
  disks: Disk[]
  top: Proc[]
}

export type Preview = { path: string; text?: string; note?: string }

// index and tree are the X and Y columns of `git status --porcelain`.
export type Change = { path: string; index: string; tree: string }
export type Commit = { hash: string; subject: string; author: string; when: string }
export type GitView = {
  isRepo: boolean
  error?: string
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  changes: Change[]
  log: Commit[]
  stashes: number
}

// A destructive press waits for a second one: `push` or `kill:<pid>`.
export type Confirm = { action: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'workbench': {
      tab: Tab
      dir: string
      preview: Shaped<Preview | null>
      snapshot: Shaped<Snapshot | null>
      git: Shaped<GitView | null>
      confirm: Confirm | null
      message: string
    }
  }
}
