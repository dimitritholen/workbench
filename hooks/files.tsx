import type { EngineInterface, RenderInput } from 'claude-code'

import type { Preview } from '../types'
import type { FileListProps } from './filelist'
import { bytes, join } from './lib'
import { block, fit, hints, INSET } from './ui'

const HIDDEN = new Set(['.git', 'node_modules'])
const MAX_PREVIEW_BYTES = 256 * 1024
const PREVIEW_LINES = 200
// header block (3), this block's borders (2), the hints line (1)
const CHROME_ROWS = 6

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

export async function listFolder($: EngineInterface, here: string) {
  return (await $.fs.list(here || undefined).catch(() => []))
    .filter(entry => !HIDDEN.has(entry.name))
    .sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name))
}

export type FilesView = {
  here: string
  shown: Preview | null
  columns: number
  rows: number
  onDir: (path: string) => unknown
  onFile: (path: string) => unknown
  onBack: () => unknown
}

export async function renderFiles($: EngineInterface, e: RenderInput, v: FilesView) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button, Code } = ui
  const { here, shown } = v
  const crumb = <Text color="inactive">{`./${here}`}</Text>

  if (shown) {
    return (
      <Box flexDirection="column">
        {block(
          ui,
          { title: shown.path.split('/').pop() ?? shown.path, right: crumb, isFocused: true },
          <Box flexDirection="column">
            <Box gap={2}>
              <Button key="back" plain hotkey="b" onPress={v.onBack}>
                <Text color="suggestion">← back</Text>
              </Button>
              <Button key="mention-open" plain hotkey="a" onPress={() => mention($, shown.path)}>
                <Text color="claude">@ to prompt</Text>
              </Button>
            </Box>
            {shown.note ? <Text dimColor>{shown.note}</Text> : <Code source={shown.text ?? ''} path={shown.path} startLine={1} />}
          </Box>,
        )}
        {hints(ui, [['b', 'back'], ['a', '@ to prompt']])}
      </Box>
    )
  }

  const entries = await listFolder($, here)
  const rows = Math.max(5, v.rows - CHROME_ROWS)
  const footer = `${entries.length} item${entries.length === 1 ? '' : 's'}`

  // A Client is drawn on the terminal only, for now.
  if (e.surface === 'terminal' && 'Client' in ui) {
    const props: FileListProps = {
      here,
      rows,
      columns: v.columns - INSET,
      entries: entries.map(entry => ({ name: entry.name, isDir: entry.kind === 'dir', size: bytes(entry.size) })),
    }
    return (
      <Box flexDirection="column">
        {block(
          ui,
          { title: 'Files', right: crumb, footer, isFocused: true },
          <ui.Client key="files" module="./filelist.tsx" props={props} height={Math.min(rows, Math.max(1, entries.length + 1))} />,
        )}
        {hints(ui, [
          ['click', 'focus'],
          ['↑↓', 'move'],
          ['⏎', 'open'],
          ['⌫', 'up'],
          ['@', 'prompt'],
          ['/', 'filter'],
        ])}
      </Box>
    )
  }

  // Other surfaces: a list of buttons.
  const nameWidth = Math.max(10, v.columns - INSET - 12)
  return block(
    ui,
    { title: 'Files', right: crumb, footer, isFocused: true },
    <Box flexDirection="column">
      {here && (
        <Button key="up" plain onPress={() => v.onDir(here.split('/').slice(0, -1).join('/'))}>
          <Text color="inactive">..</Text>
        </Button>
      )}
      {entries.map(entry => {
        const path = join(here, entry.name)
        const isDir = entry.kind === 'dir'
        return (
          <Box key={`row:${path}`}>
            <Button key={`f:${path}`} plain onPress={() => (isDir ? v.onDir(path) : v.onFile(path))}>
              <Text color={isDir ? 'suggestion' : 'text'} bold={isDir}>
                {fit(isDir ? `${entry.name}/` : entry.name, nameWidth)}
              </Text>
              <Text dimColor>{isDir ? ''.padStart(8) : bytes(entry.size).padStart(8)}</Text>
            </Button>
            <Button key={`m:${path}`} plain onPress={() => mention($, path)}>
              <Text color="claude"> @</Text>
            </Button>
          </Box>
        )
      })}
    </Box>,
  )
}
