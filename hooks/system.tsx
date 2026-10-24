import type { EngineInterface, RenderInput } from 'claude-code'

import type { Confirm, Proc, Snapshot } from '../types'
import { bar, bytes, isConfirmed } from './lib'

export type SystemView = {
  snap: Snapshot | null
  pending: Confirm | null
  columns: number
  onKill: (p: Proc) => unknown
}

const pct = (n: number) => `${n.toFixed(0).padStart(3)}%`

export function renderSystem($: EngineInterface, e: RenderInput, v: SystemView) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { snap, columns } = v
  if (!snap) return <Text dimColor>Meten…</Text>

  const width = Math.max(8, Math.min(24, columns - 28))
  const memPct = snap.mem.total ? (100 * snap.mem.used) / snap.mem.total : 0
  const name = Math.max(8, columns - 32)

  return (
    <Box flexDirection="column">
      <Text>
        CPU  {bar(snap.cpu, width)} {pct(snap.cpu)}
      </Text>
      <Text>
        RAM  {bar(memPct, width)} {pct(memPct)} <Text dimColor>{bytes(snap.mem.used)} / {bytes(snap.mem.total)}</Text>
      </Text>
      {snap.load && (
        <Text>
          Load <Text dimColor>{snap.load.map(n => n.toFixed(2)).join('  ')}</Text>
        </Text>
      )}

      <Text weight="bold">Schijven</Text>
      {snap.disks.map(d => {
        const used = d.total ? (100 * d.used) / d.total : 0
        return (
          <Text>
            {bar(used, width)} {pct(used)} {d.mount} <Text dimColor>{bytes(d.used)} / {bytes(d.total)}</Text>
          </Text>
        )
      })}

      <Text weight="bold">Processen</Text>
      <Text dimColor>{'    PID ' + 'NAAM'.padEnd(name) + '  CPU%  MEM%'}</Text>
      {snap.top.map(p => (
        <Box key={`p:${p.pid}`} gap={1}>
          <Text>
            {String(p.pid).padStart(7)} {p.name.slice(0, name).padEnd(name)} {p.cpu.toFixed(1).padStart(5)}{' '}
            {p.mem.toFixed(1).padStart(5)}
          </Text>
          <Button
            key={`kill:${p.pid}`}
            plain
            label={isConfirmed(v.pending, `kill:${p.pid}`) ? `kill ${p.name}?` : '×'}
            onPress={() => v.onKill(p)}
          />
        </Box>
      ))}
    </Box>
  )
}
