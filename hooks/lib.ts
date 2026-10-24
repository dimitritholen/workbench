import type { Change, Commit, Disk, GitView, Proc, Snapshot } from '../types'

export type Os = 'linux' | 'macos' | 'windows'
export type CpuTimes = { idle: number; total: number }

const numbers = (text: string) => (text.match(/[\d.]+/g) ?? []).map(Number)

// --- Linux: /proc ---

export function parseProcStat(text: string): CpuTimes {
  const fields = numbers(text.split('\n')[0] ?? '')
  // user nice system idle iowait irq softirq steal: idle + iowait is idle time
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  return { idle, total: fields.slice(0, 8).reduce((a, b) => a + b, 0) }
}

export function cpuPercent(prev: CpuTimes | undefined, now: CpuTimes): number {
  if (!prev || now.total <= prev.total) return 0
  return clamp(100 * (1 - (now.idle - prev.idle) / (now.total - prev.total)))
}

export function parseMeminfo(text: string) {
  const kb = (name: string) => Number(text.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) * 1024
  const total = kb('MemTotal')
  return { used: total - kb('MemAvailable'), total }
}

export const parseLoadavg = (text: string) => numbers(text).slice(0, 3)

// --- Unix: ps and df ---

// `pid comm %cpu %mem`, a header first; a macOS comm is a path that may hold spaces.
export function parsePs(text: string): Proc[] {
  return text
    .split('\n')
    .slice(1)
    .flatMap(line => {
      const m = line.match(/^\s*(\d+)\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s*$/)
      if (!m) return []
      const [, pid = '', comm = '', cpu = '', mem = ''] = m
      return [{ pid: Number(pid), name: comm.split('/').pop() || comm, cpu: Number(cpu), mem: Number(mem) }]
    })
}

// `df -kP`: the real disks, not tmpfs, snaps or the volumes macOS keeps for itself.
export function parseDf(text: string, os: Os): Disk[] {
  const seen = new Set<string>()
  return text
    .split('\n')
    .slice(1)
    .flatMap(line => {
      const m = line.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(.+)$/)
      if (!m) return []
      const [, source = '', blocks = '', used = '', , mount = ''] = m
      const isDevice = source.startsWith('/dev/') && !source.startsWith('/dev/loop')
      const isReal =
        os === 'macos'
          ? isDevice && (!mount.startsWith('/System/Volumes/') || mount === '/System/Volumes/Data')
          : isDevice || /^[A-Za-z]:\\$/.test(source) // WSL mounts a Windows drive as `C:\`
      if (!isReal || seen.has(source)) return []
      seen.add(source)
      return [{ mount, used: Number(used) * 1024, total: Number(blocks) * 1024 }]
    })
}

export const topByCpu = (procs: Proc[], n = 10) => [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, n)

// --- macOS: sysctl and vm_stat ---

// `sysctl -n hw.ncpu hw.memsize vm.loadavg`: three lines, the last `{ 1.2 1.3 1.4 }`.
export function parseSysctl(text: string) {
  const [ncpu, memsize, load] = text.trim().split('\n')
  return { ncpu: Number(ncpu) || 1, memsize: Number(memsize), load: numbers(load ?? '').slice(0, 3) }
}

// Used memory as Activity Monitor counts it: all but free, inactive and speculative pages.
export function parseVmStat(text: string, memsize: number): number {
  const page = Number(text.match(/page size of (\d+)/)?.[1] ?? 4096)
  const pages = (name: string) => Number(text.match(new RegExp(`Pages ${name}:\\s+(\\d+)`))?.[1] ?? 0)
  return memsize - (pages('free') + pages('inactive') + pages('speculative')) * page
}

// --- Windows: one PowerShell call answering JSON ---

type WinRaw = {
  cores: number
  cpu: number
  total: number
  free: number
  disks: { n: string; s: number; f: number }[] | { n: string; s: number; f: number }
  top: { id: number; n: string; c: number; m: number }[] | { id: number; n: string; c: number; m: number }
}
const list = <T>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v])

export function parseWindows(json: string): Snapshot {
  const raw = JSON.parse(json) as WinRaw
  const total = raw.total * 1024
  return {
    cpu: clamp(raw.cpu ?? 0),
    mem: { used: total - raw.free * 1024, total },
    disks: list(raw.disks).map(d => ({ mount: d.n, used: d.s - d.f, total: d.s })),
    // PercentProcessorTime is per core already (403 = four cores busy), as htop counts
    top: topByCpu(
      list(raw.top).map(p => ({ pid: p.id, name: p.n.replace(/#\d+$/, ''), cpu: p.c, mem: (100 * p.m) / total })),
    ),
  }
}

// --- Git ---

type Status = Pick<GitView, 'branch' | 'upstream' | 'ahead' | 'behind' | 'changes'>

// `git status --porcelain=v1 -b -z`: NUL-separated, a rename followed by its old path.
export function parseStatus(text: string): Status {
  const status: Status = { branch: '', ahead: 0, behind: 0, changes: [] }
  const entries = text.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    if (entry.startsWith('## ')) {
      const m = entry.match(/^## (?:No commits yet on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/)
      status.branch = m?.[1] ?? ''
      status.upstream = m?.[2]
      status.ahead = Number(m?.[3]?.match(/ahead (\d+)/)?.[1] ?? 0)
      status.behind = Number(m?.[3]?.match(/behind (\d+)/)?.[1] ?? 0)
      continue
    }
    const change: Change = { index: entry[0] ?? ' ', tree: entry[1] ?? ' ', path: entry.slice(3) }
    status.changes.push(change)
    if (change.index === 'R' || change.index === 'C') i++
  }
  return status
}

export const LOG_FORMAT = '%h%x1f%s%x1f%an%x1f%cr'

export function parseLog(text: string): Commit[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash = '', subject = '', author = '', when = ''] = line.split('\x1f')
      return { hash, subject, author, when }
    })
}

export const isStaged = (c: Change) => c.index !== ' ' && c.index !== '?'
export const isUnstaged = (c: Change) => c.tree !== ' '

// --- Drawing helpers ---

export function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

export function bar(percent: number, width: number) {
  const full = Math.round((clamp(percent) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export function bytes(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

export const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
export const parent = (dir: string) => dir.split('/').slice(0, -1).join('/')

// A destructive press waits for a second one within this time.
export const CONFIRM_MS = 5000
export const isConfirmed = (c: { action: string; at: number } | null, action: string, now = Date.now()) =>
  c?.action === action && now - c.at < CONFIRM_MS
