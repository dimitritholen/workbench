import type { EngineInterface, RenderInput } from 'claude-code'

import type { Confirm, Proc, Snapshot } from '../types'
import { brailleChart, bytes, isConfirmed, toBase64 } from './lib'
import { block, fit, hints, INSET, level, meter, sparkline } from './ui'

export type SystemView = {
  snap: Snapshot | null
  pending: Confirm | null
  columns: number
  onKill: (p: Proc) => unknown
}

const GRAPH_ROWS = 4
const pct = (n: number) => `${n.toFixed(0).padStart(3)}%`

export function renderSystem($: EngineInterface, e: RenderInput, v: SystemView) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const { snap } = v
  if (!snap) return block(ui, { title: 'System' }, <Text dimColor>Measuring…</Text>)

  const inner = Math.max(20, v.columns - INSET)
  const memPct = snap.mem.total ? (100 * snap.mem.used) / snap.mem.total : 0
  const history = snap.history ?? []
  const mountWidth = Math.min(14, Math.max(...snap.disks.map(d => d.mount.length), 4))
  const diskBar = Math.max(6, inner - mountWidth - 22)
  // PID 7, CPU% 6, MEM% 6, kill 2, spaces 4
  const nameWidth = Math.max(8, inner - 25)

  const graph =
    'Raster' in ui ? (
      <ui.Raster key="cpu" columns={inner} rows={GRAPH_ROWS} cells={toBase64(new Uint8Array(brailleChart(history, inner, GRAPH_ROWS).buffer))} />
    ) : (
      <Text color="claude">{sparkline(history.slice(-inner)).padStart(inner)}</Text>
    )

  return (
    <Box flexDirection="column">
      {block(
        ui,
        {
          title: 'CPU',
          right: (
            <Text bold color={level(snap.cpu)}>
              {pct(snap.cpu)}
            </Text>
          ),
          footer: snap.load ? `load ${snap.load.map(n => n.toFixed(2)).join(' ')}` : undefined,
          isFocused: true,
        },
        graph,
      )}

      {block(
        ui,
        {
          title: 'Memory',
          right: (
            <Text bold color={level(memPct)}>
              {pct(memPct)}
            </Text>
          ),
          footer: `${bytes(snap.mem.used)} / ${bytes(snap.mem.total)}`,
        },
        meter(ui, memPct, inner),
      )}

      {block(
        ui,
        { title: 'Disks', footer: `${snap.disks.length}` },
        <Box flexDirection="column">
          {snap.disks.map(d => {
            const used = d.total ? (100 * d.used) / d.total : 0
            return (
              <Text>
                <Text color="suggestion">{fit(d.mount, mountWidth)}</Text> {meter(ui, used, diskBar)}{' '}
                <Text color={level(used)}>{pct(used)}</Text>
                <Text dimColor> {`${bytes(d.used)}/${bytes(d.total)}`.padStart(15)}</Text>
              </Text>
            )
          })}
        </Box>,
      )}

      {block(
        ui,
        { title: 'Processes', footer: 'top 10 · % of one core' },
        <Box flexDirection="column">
          <Text bold>
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
      )}
      {hints(ui, [
        ['×', 'kill (twice)'],
        ['1-3', 'tab'],
      ])}
    </Box>
  )
}
