import type { EngineInterface, RenderInput } from 'claude-code'

import type { Preview } from '../types'
import { bytes, join } from './lib'

const HIDDEN = new Set(['.git', 'node_modules'])
const MAX_PREVIEW_BYTES = 256 * 1024
const PREVIEW_LINES = 200

export async function loadPreview($: EngineInterface, path: string): Promise<Preview> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) return { path, note: 'Kan het bestand niet lezen.' }
  if (stat.size > MAX_PREVIEW_BYTES) return { path, note: `Te groot voor een preview (${bytes(stat.size)}).` }
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') return { path, note: 'Kan het bestand niet lezen.' }
  if (text.includes('\0')) return { path, note: `Binair bestand (${bytes(stat.size)}).` }
  return { path, text: text.split('\n').slice(0, PREVIEW_LINES).join('\n') }
}

export async function mention($: EngineInterface, path: string) {
  const filled = await $.prompt.fill({ text: `@${path} `, mode: 'insert' })
  if (!filled.isFilled) await $.ui.toast('De promptbox nam het pad niet aan.')
}

export type FilesView = {
  here: string
  shown: Preview | null
  onDir: (path: string) => unknown
  onFile: (path: string) => unknown
  onBack: () => unknown
}

export async function renderFiles($: EngineInterface, e: RenderInput, v: FilesView) {
  const { Box, Text, Button, Code } = $.ui.resolve(e)
  const { here, shown } = v

  if (shown) {
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Button key="back" label="← terug" hotkey="b" onPress={v.onBack} />
          <Button key="mention-open" label="@ naar prompt" hotkey="a" onPress={() => mention($, shown.path)} />
        </Box>
        <Text weight="bold">{shown.path}</Text>
        {shown.note ? <Text dimColor>{shown.note}</Text> : <Code source={shown.text ?? ''} path={shown.path} startLine={1} />}
      </Box>
    )
  }

  const entries = (await $.fs.list(here || undefined).catch(() => []))
    .filter(entry => !HIDDEN.has(entry.name))
    .sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name))

  return (
    <Box flexDirection="column">
      <Text dimColor>./{here}</Text>
      {here && (
        <Button key="up" plain onPress={() => v.onDir(here.split('/').slice(0, -1).join('/'))}>
          ..
        </Button>
      )}
      {entries.length === 0 && <Text dimColor>Lege map.</Text>}
      {entries.map(entry => {
        const path = join(here, entry.name)
        const isDir = entry.kind === 'dir'
        return (
          <Box key={`row:${path}`} gap={1}>
            <Button key={`m:${path}`} plain onPress={() => mention($, path)}>
              <Text dimColor>@</Text>
            </Button>
            <Button key={`f:${path}`} plain onPress={() => (isDir ? v.onDir(path) : v.onFile(path))}>
              {isDir ? `${entry.name}/` : entry.name}
              {!isDir && <Text dimColor> {bytes(entry.size)}</Text>}
            </Button>
          </Box>
        )
      })}
    </Box>
  )
}
