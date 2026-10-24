import type { EngineInterface, RenderInput } from 'claude-code'

import type { Confirm, Proc, Snapshot } from '../types'
import { bytes, isConfirmed } from './lib'
import { INSET, fit, level, meter, panel, sparkline } from './ui'

export type SystemView = {
  snap: Snapshot | null
  pending: Confirm | null
  columns: number
  onKill: (p: Proc) => unknown
}

const pct = (n: number) => `${n.toFixed(0).padStart(3)}%`

export function renderSystem($: EngineInterface, e: RenderInput, v: SystemView) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const { snap } = v
  if (!snap) return <Text dimColor>Measuring…</Text>

  const inner = Math.max(20, v.columns - INSET)
  const memPct = snap.mem.total ? (100 * snap.mem.used) / snap.mem.total : 0
  const history = (snap.history ?? []).slice(-inner)
  const mountWidth = Math.min(14, Math.max(...snap.disks.map(d => d.mount.length), 4))
  const diskBar = Math.max(6, inner - mountWidth - 22)
  // PID 7, CPU% 6, MEM% 6, kill 2, spaces 4
  const nameWidth = Math.max(8, inner - 25)

  return (
    <Box flexDirection="column">
      {panel(
        ui,
        'CPU',
        <Box flexDirection="column">
          {meter(ui, snap.cpu, inner)}
          <Text color="claude">{sparkline(history).padStart(inner)}</Text>
          {snap.load && (
            <Text dimColor>
              load {snap.load.map(n => n.toFixed(2)).join(' · ')}
            </Text>
          )}
        </Box>,
        <Text bold color={level(snap.cpu)}>
          {pct(snap.cpu)}
        </Text>,
      )}

      {panel(
        ui,
        'Memory',
        meter(ui, memPct, inner),
        <Text>
          <Text dimColor>
            {bytes(snap.mem.used)} / {bytes(snap.mem.total)}{' '}
          </Text>
          <Text bold color={level(memPct)}>
            {pct(memPct)}
          </Text>
        </Text>,
      )}

      {panel(
        ui,
        'Disks',
        <Box flexDirection="column">
          {snap.disks.map(d => {
            const used = d.total ? (100 * d.used) / d.total : 0
            return (
              <Text>
                {fit(d.mount, mountWidth)} {meter(ui, used, diskBar)}{' '}
                <Text color={level(used)}>{pct(used)}</Text>
                <Text dimColor> {`${bytes(d.used)}/${bytes(d.total)}`.padStart(15)}</Text>
              </Text>
            )
          })}
        </Box>,
      )}

      {panel(
        ui,
        'Processes',
        <Box flexDirection="column">
          <Text dimColor bold>
            {'    PID'} {fit('NAME', nameWidth)} {'  CPU%'} {'  MEM%'}
          </Text>
          {snap.top.map(p => {
            const isAsking = isConfirmed(v.pending, `kill:${p.pid}`)
            return (
              <Box key={`p:${p.pid}`}>
                <Text>
                  <Text dimColor>{String(p.pid).padStart(7)}</Text> {fit(p.name, nameWidth)}{' '}
                  <Text color={level(p.cpu)}>{p.cpu.toFixed(1).padStart(6)}</Text>{' '}
                  <Text color={level(p.mem)}>{p.mem.toFixed(1).padStart(6)}</Text>{' '}
                </Text>
                <Button key={`kill:${p.pid}`} plain onPress={() => v.onKill(p)}>
                  {isAsking ? (
                    <Text inverse bold color="error">
                      {` kill ${p.name}? `}
                    </Text>
                  ) : (
                    <Text color="error" dimColor>
                      ×
                    </Text>
                  )}
                </Button>
              </Box>
            )
          })}
        </Box>,
        <Text dimColor>top 10 · CPU per core</Text>,
      )}
    </Box>
  )
}
