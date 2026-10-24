import type { EngineInterface, RenderInput } from 'claude-code'

import type { Preview } from '../types'
import { bytes, join } from './lib'
import { INSET, fit, panel } from './ui'

const HIDDEN = new Set(['.git', 'node_modules'])
const MAX_PREVIEW_BYTES = 256 * 1024
const PREVIEW_LINES = 200

export async function loadPreview($: EngineInterface, path: string): Promise<Preview> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) return { path, note: 'Cannot read this file.' }
  if (stat.size > MAX_PREVIEW_BYTES) return { path, note: `Too large to preview (${bytes(stat.size)}).` }
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') return { path, note: 'Cannot read this file.' }
  if (text.includes('\0')) return { path, note: `Binary file (${bytes(stat.size)}).` }
  return { path, text: text.split('\n').slice(0, PREVIEW_LINES).join('\n') }
}

export async function mention($: EngineInterface, path: string) {
  const filled = await $.prompt.fill({ text: `@${path} `, mode: 'insert' })
  if (!filled.isFilled) await $.ui.toast('The prompt box did not take the path.')
}

export type FilesView = {
  here: string
  shown: Preview | null
  columns: number
  onDir: (path: string) => unknown
  onFile: (path: string) => unknown
  onBack: () => unknown
}

export async function renderFiles($: EngineInterface, e: RenderInput, v: FilesView) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button, Code } = ui
  const { here, shown } = v
  const crumbs = here ? here.split('/') : []

  const breadcrumb = (
    <Text>
      <Text color="claude" bold>
        ⌂
      </Text>
      {crumbs.map(c => (
        <Text>
          <Text color="subtle"> › </Text>
          {c}
        </Text>
      ))}
    </Text>
  )

  if (shown) {
    return (
      <Box flexDirection="column">
        {breadcrumb}
        <Box gap={2}>
          <Button key="back" plain hotkey="b" onPress={v.onBack}>
            <Text color="suggestion">← back</Text>
          </Button>
          <Button key="mention-open" plain hotkey="a" onPress={() => mention($, shown.path)}>
            <Text color="claude">@ to prompt</Text>
          </Button>
        </Box>
        {panel(
          ui,
          shown.path.split('/').pop() ?? shown.path,
          shown.note ? <Text dimColor>{shown.note}</Text> : <Code source={shown.text ?? ''} path={shown.path} startLine={1} />,
        )}
      </Box>
    )
  }

  const entries = (await $.fs.list(here || undefined).catch(() => []))
    .filter(entry => !HIDDEN.has(entry.name))
    .sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name))
  // name column: what is left after the size (8) and the @ (2)
  const nameWidth = Math.max(10, v.columns - INSET - 12)

  const rows = (
    <Box flexDirection="column">
      {here && (
        <Button key="up" plain onPress={() => v.onDir(here.split('/').slice(0, -1).join('/'))}>
          <Text color="inactive">▴ ..</Text>
        </Button>
      )}
      {entries.length === 0 && <Text dimColor>Empty folder.</Text>}
      {entries.map(entry => {
        const path = join(here, entry.name)
        const isDir = entry.kind === 'dir'
        return (
          <Box key={`row:${path}`}>
            <Button key={`f:${path}`} plain onPress={() => (isDir ? v.onDir(path) : v.onFile(path))}>
              {isDir ? (
                <Text color="suggestion" bold>
                  {fit(`▸ ${entry.name}/`, nameWidth)}
                </Text>
              ) : (
                <Text>{fit(`  ${entry.name}`, nameWidth)}</Text>
              )}
              <Text dimColor>{isDir ? ''.padStart(8) : bytes(entry.size).padStart(8)}</Text>
            </Button>
            <Button key={`m:${path}`} plain onPress={() => mention($, path)}>
              <Text color="claude"> @</Text>
            </Button>
          </Box>
        )
      })}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {breadcrumb}
      {panel(ui, 'Files', rows, <Text dimColor>{entries.length} items</Text>)}
      <Text dimColor>click: open · @: path to prompt</Text>
    </Box>
  )
}
