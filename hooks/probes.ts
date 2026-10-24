import type { EngineInterface } from 'claude-code'

import type { Snapshot } from '../types'
import {
  type CpuTimes,
  type Os,
  cpuPercent,
  parseDf,
  parseLoadavg,
  parseMeminfo,
  parseProcStat,
  parsePs,
  parseSysctl,
  parseVmStat,
  parseWindows,
  topByCpu,
} from './lib'

export async function detectOs($: EngineInterface, cwd: string): Promise<Os> {
  if (/^[A-Za-z]:[\\/]/.test(cwd) || cwd.startsWith('\\\\')) return 'windows'
  const uname = await $.process.run(['uname', '-s']).catch(() => undefined)
  if (!uname) return 'windows'
  return uname.stdout.trim() === 'Darwin' ? 'macos' : 'linux'
}

// The Windows probe took 4 s through WSL; ticks never overlap (see tick in register.tsx).
export const REFRESH_MS: Record<Os, number> = { linux: 2000, macos: 2000, windows: 5000 }

// One call: PowerShell is slow to start.
export const WINDOWS_PROBE = [
  '$n=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors',
  '$o=Get-CimInstance Win32_OperatingSystem',
  '$c=(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average',
  '$d=@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ n=$_.DeviceID; s=$_.Size; f=$_.FreeSpace } })',
  '$p=@(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne "_Total" -and $_.Name -ne "Idle" } | Sort-Object PercentProcessorTime -Descending | Select-Object -First 10 | ForEach-Object { @{ id=$_.IDProcess; n=$_.Name; c=$_.PercentProcessorTime; m=$_.WorkingSetPrivate } })',
  '@{ cores=$n; cpu=$c; total=$o.TotalVisibleMemorySize; free=$o.FreePhysicalMemory; disks=$d; top=$p } | ConvertTo-Json -Compress -Depth 3',
].join('; ')

async function out($: EngineInterface, argv: string[]) {
  const r = await $.process.run(argv, { timeoutMs: 15000 })
  if (r.exitCode !== 0) throw new Error(`${argv[0]}: ${r.stderr.trim() || `exit ${r.exitCode}`}`)
  return r.stdout
}

// /proc lies outside the working directory: where $.fs refuses it, cat reads it.
async function text($: EngineInterface, path: string) {
  const read = await $.fs.read(path).catch(() => undefined)
  return typeof read === 'string' ? read : out($, ['cat', path])
}

// CPU% on Linux is the change between two readings of /proc/stat.
let lastCpu: CpuTimes | undefined

export async function probe($: EngineInterface, os: Os): Promise<Snapshot> {
  if (os === 'windows') {
    return parseWindows(await out($, ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROBE]))
  }

  if (os === 'macos') {
    const [sysctl, vm, df, ps] = await Promise.all([
      out($, ['sysctl', '-n', 'hw.ncpu', 'hw.memsize', 'vm.loadavg']),
      out($, ['vm_stat']),
      out($, ['df', '-kP']),
      out($, ['ps', '-Aro', 'pid,comm,%cpu,%mem']),
    ])
    const { ncpu, memsize, load } = parseSysctl(sysctl)
    const procs = parsePs(ps)
    const busy = procs.reduce((sum, p) => sum + p.cpu, 0) / ncpu
    return {
      cpu: Math.min(100, busy),
      mem: { used: parseVmStat(vm, memsize), total: memsize },
      load,
      disks: parseDf(df, os),
      top: topByCpu(procs),
    }
  }

  const [stat, meminfo, loadavg, df, ps] = await Promise.all([
    text($, '/proc/stat'),
    text($, '/proc/meminfo'),
    text($, '/proc/loadavg'),
    out($, ['df', '-kP']),
    out($, ['ps', '-eo', 'pid,comm,%cpu,%mem', '--sort=-%cpu']),
  ])
  const now = parseProcStat(stat)
  const cpu = cpuPercent(lastCpu, now)
  lastCpu = now
  return {
    cpu,
    mem: parseMeminfo(meminfo),
    load: parseLoadavg(loadavg),
    disks: parseDf(df, os),
    top: topByCpu(parsePs(ps)),
  }
}

export const killArgv = (os: Os, pid: number) =>
  os === 'windows' ? ['taskkill', '/PID', String(pid)] : ['kill', String(pid)]
