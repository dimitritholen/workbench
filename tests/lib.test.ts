import { describe, expect, test } from 'claude-code/testing'

import {
  bar,
  brailleChart,
  heat,
  toBase64,
  bytes,
  cpuPercent,
  isConfirmed,
  isStaged,
  isUnstaged,
  parseDf,
  parseLoadavg,
  parseLog,
  parseMeminfo,
  parseProcStat,
  parsePs,
  parseStatus,
  parseSysctl,
  parseVmStat,
  parseWindows,
} from '../hooks/lib'
import { FIXTURES } from './fixtures'

describe('linux', () => {
  const { linux } = FIXTURES

  test('df keeps the real disk and the Windows drives WSL mounts', () => {
    expect(parseDf(linux.df, 'linux').map(d => d.mount)).toEqual(['/', '/mnt/c', '/mnt/d'])
    const root = parseDf(linux.df, 'linux')[0]
    expect(root?.total).toBe(1055762868 * 1024)
  })

  test('ps reads pid, name, cpu and mem', () => {
    const procs = parsePs(linux.ps)
    expect(procs.length).toBeGreaterThan(5)
    expect(procs[0]).toMatchObject({ name: expect.any(String), pid: expect.any(Number) })
    expect(procs.every(p => Number.isFinite(p.cpu) && Number.isFinite(p.mem))).toBe(true)
  })

  test('meminfo, loadavg and the cpu delta', () => {
    const mem = parseMeminfo(linux.meminfo)
    expect(mem.total).toBeGreaterThan(mem.used)
    expect(mem.used).toBeGreaterThan(0)
    expect(parseLoadavg(linux.loadavg)).toHaveLength(3)

    const before = parseProcStat('cpu  100 0 100 800 0 0 0 0 0 0')
    const after = parseProcStat('cpu  150 0 150 850 50 0 0 0 0 0')
    // 200 ticks passed, 100 of them idle or iowait
    expect(cpuPercent(before, after)).toBe(50)
    expect(cpuPercent(undefined, parseProcStat(linux.stat))).toBe(0)
  })
})

describe('macos', () => {
  const { macos } = FIXTURES

  test('df keeps / , the data volume and external disks, not system volumes', () => {
    expect(parseDf(macos.df, 'macos').map(d => d.mount)).toEqual(['/', '/System/Volumes/Data', '/Volumes/My Stick'])
  })

  test('ps takes the name from a path with spaces', () => {
    expect(parsePs(macos.ps)[0]).toEqual({ pid: 612, name: 'Google Chrome', cpu: 42.5, mem: 3.1 })
  })

  test('sysctl and vm_stat', () => {
    const sys = parseSysctl(macos.sysctl)
    expect(sys).toEqual({ ncpu: 10, memsize: 17179869184, load: [2.31, 1.98, 1.75] })
    expect(parseVmStat(macos.vmstat, sys.memsize)).toBe(17179869184 - (20000 + 280000 + 10000) * 16384)
  })
})

describe('windows', () => {
  test('the PowerShell probe', () => {
    const snap = parseWindows(FIXTURES.windows.probe)
    expect(snap.disks.map(d => d.mount)).toEqual(['C:', 'D:'])
    expect(snap.top.length).toBeGreaterThan(0)
    expect(snap.top.length).toBeLessThanOrEqual(10)
    expect(snap.top.some(p => p.name.includes('#'))).toBe(false)
    expect(snap.mem.total).toBeGreaterThan(snap.mem.used)
  })

  test('a single disk or process comes back as an object, not a list', () => {
    const one = parseWindows(
      JSON.stringify({ cores: 4, cpu: 12, total: 1024, free: 512, disks: { n: 'C:', s: 100, f: 40 }, top: { id: 7, n: 'app#2', c: 150, m: 1024 * 256 } }),
    )
    expect(one.disks).toEqual([{ mount: 'C:', used: 60, total: 100 }])
    expect(one.top).toEqual([{ pid: 7, name: 'app', cpu: 150, mem: 25 }])
  })
})

describe('git', () => {
  test('status: branch, ahead, a rename, a path with a space, untracked', () => {
    const s = parseStatus(FIXTURES.git.status)
    expect(s).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0 })
    expect(s.changes.map(c => c.path)).toEqual(['a.txt', 'new.txt', 'with space.txt', 'untracked.txt'])
    expect(s.changes.filter(isStaged).map(c => c.path)).toEqual(['new.txt', 'with space.txt'])
    expect(s.changes.filter(isUnstaged).map(c => c.path)).toEqual(['a.txt', 'with space.txt', 'untracked.txt'])
  })

  test('status of a new repository and of a detached head', () => {
    expect(parseStatus('## No commits yet on main\0')).toMatchObject({ branch: 'main', upstream: undefined })
    expect(parseStatus('## main...origin/main [ahead 2, behind 3]\0')).toMatchObject({ ahead: 2, behind: 3 })
  })

  test('log', () => {
    expect(parseLog(FIXTURES.git.log)[0]).toMatchObject({ subject: 'second', author: 'Tester' })
    expect(parseLog('')).toEqual([])
  })
})

test('drawing helpers and the confirm window', () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(150, 4)).toBe('████')
  expect(bytes(1536)).toBe('1.5 KB')
  expect(bytes(512)).toBe('512 B')
  expect(isConfirmed({ action: 'push', at: 1000 }, 'push', 3000)).toBe(true)
  expect(isConfirmed({ action: 'push', at: 1000 }, 'push', 7000)).toBe(false)
  expect(isConfirmed({ action: 'kill:1', at: 1000 }, 'push', 2000)).toBe(false)
})

test('base64 matches the platform encoder', () => {
  for (const text of ['', 'a', 'ab', 'abc', 'workbench!']) {
    expect(toBase64(new TextEncoder().encode(text))).toBe(btoa(text))
  }
})

test('the braille chart fills from the bottom, newest on the right', () => {
  // 2 columns x 1 row: four samples, the last two full height
  const cells = brailleChart([0, 0, 100, 100], 2, 1)
  expect(cells[0]).toBe(0x2800 + 0xc0) // both samples zero: the faint baseline
  expect(brailleChart([], 1, 2)[0]).toBe(0x20) // above the bottom row, empty is blank
  expect(cells[3]).toBe(0x2800 + 0xff) // all eight dots
  // one sample at half height in the right column of a 1x1 chart: two dots
  expect(brailleChart([50], 1, 1)[0]).toBe(0x2800 + 0x80 + 0x20)
  expect(heat(0) & 0xff00).toBeGreaterThan(heat(1) & 0xff00) // greener at the bottom
})
