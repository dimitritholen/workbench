import type { ClientKeyEvent, ClientPointerEvent, ClientSurface } from 'claude-code'
import { LINK } from './lib'

// What the hooks module hands the list; it answers with posts: open, up, mention.
export type Entry = { name: string; isDir: boolean; size: string }
export type FileListProps = { here: string; entries: Entry[]; rows: number; columns: number }
export type FileListPost =
  | { type: 'open'; name: string; isDir: boolean }
  | { type: 'mention'; name: string }
  | { type: 'up' }
  | { type: 'tab'; index: number }

type ListState = { here: string; cursor: number; offset: number; filter: string; isFiltering: boolean }

const PAGE = 10
const NAMED = new Set(['up', 'down', 'left', 'right', 'tab', 'delete', 'pageup', 'pagedown', 'home', 'end', 'escape', 'return', 'backspace', 'space'])

// The newest state per instance: keys can arrive faster than redraws, so a
// handler reads this instead of the state its render saw.
const latest = new WeakMap<object, ListState>()

export default function FileList(props: FileListProps, surface: ClientSurface<ListState>) {
  const { Box, Text } = surface.elements

  // a new folder starts at its top with no filter
  const current = (): ListState => {
    const st = latest.get(surface) ?? surface.state
    return st && st.here === props.here ? st : { here: props.here, cursor: 0, offset: 0, filter: '', isFiltering: false }
  }
  const layout = (st: ListState) => {
    const shown = st.filter
      ? props.entries.filter(entry => entry.name.toLowerCase().includes(st.filter.toLowerCase()))
      : props.entries
    const hasFilterLine = st.isFiltering || st.filter !== ''
    const rows = Math.max(1, (surface.rows || props.rows) - (hasFilterLine ? 1 : 0))
    const cursor = Math.max(0, Math.min(st.cursor, shown.length - 1))
    const offset = Math.min(Math.max(st.offset, cursor - rows + 1, 0), cursor)
    return { st, shown, hasFilterLine, rows, cursor, offset, selected: shown[cursor] }
  }
  const set = (next: Partial<ListState>) => {
    const merged = { ...current(), ...next }
    const l = layout(merged)
    const settled = { ...merged, cursor: l.cursor, offset: l.offset }
    latest.set(surface, settled)
    surface.setState(settled)
  }
  const open = () => {
    const { selected } = layout(current())
    if (selected) surface.post({ type: 'open', name: selected.name, isDir: selected.isDir })
  }

  const onKey = (e: ClientKeyEvent): void => {
    // fast typing arrives as one event holding several characters: one at a time
    if (e.key.length > 1 && !NAMED.has(e.key)) {
      for (const key of e.key) onKey({ ...e, key })
      return
    }
    const { st, shown, cursor, selected } = layout(current())
    if (st.isFiltering) {
      if (e.key === 'return') return set({ isFiltering: false })
      if (e.key === 'backspace') return set({ filter: st.filter.slice(0, -1), cursor: 0, offset: 0 })
      if (!NAMED.has(e.key) || e.key === 'space') {
        if (e.ctrl || e.meta) return
        return set({ filter: st.filter + (e.key === 'space' ? ' ' : e.key), cursor: 0, offset: 0 })
      }
      return
    }
    switch (e.key) {
      case 'up':
      case 'k':
        return set({ cursor: cursor - 1 })
      case 'down':
      case 'j':
        return set({ cursor: cursor + 1 })
      case 'pageup':
        return set({ cursor: cursor - PAGE })
      case 'pagedown':
        return set({ cursor: cursor + PAGE })
      case 'home':
      case 'g':
        return set({ cursor: 0 })
      case 'end':
      case 'G':
        return set({ cursor: shown.length - 1 })
      case 'return':
      case 'right':
      case 'l':
        return open()
      case 'backspace':
      case 'left':
      case 'h':
        return st.filter ? set({ filter: '' }) : surface.post({ type: 'up' })
      case '@':
        return selected && surface.post({ type: 'mention', name: selected.name })
      // the list holds the keys once clicked: the pane's tab keys go through it
      case '1':
      case '2':
      case '3':
        return surface.post({ type: 'tab', index: Number(e.key) - 1 })
      case '/':
        return set({ isFiltering: true })
    }
  }
  surface.onKey(onKey)

  surface.onPointer((e: ClientPointerEvent) => {
    if (e.type !== 'down' || e.button !== 'left') return
    const { shown, hasFilterLine, cursor, offset } = layout(current())
    const index = offset + e.y - (hasFilterLine ? 1 : 0)
    if (index < offset || index >= shown.length) return
    // a click selects, a click on the selected row opens it
    if (index === cursor) open()
    else set({ cursor: index })
  })

  const { st: state, shown, hasFilterLine, rows, cursor, offset } = layout(current())
  const columns = surface.columns || props.columns
  const visible = shown.slice(offset, offset + rows)
  const hasScrollbar = shown.length > rows
  const width = Math.max(10, columns - (hasScrollbar ? 2 : 0))
  const thumbSize = Math.max(1, Math.round((rows * rows) / Math.max(1, shown.length)))
  const thumbAt = Math.round((offset / Math.max(1, shown.length - rows)) * (rows - thumbSize))

  return (
    <Box flexDirection="column">
      {hasFilterLine && (
        <Text>
          <Text color="warning">/</Text>
          {state.filter}
          {state.isFiltering && <Text inverse> </Text>}
          <Text dimColor>
            {'  '}
            {shown.length} match{shown.length === 1 ? '' : 'es'}
          </Text>
        </Text>
      )}
      {shown.length === 0 && <Text dimColor>{state.filter ? 'Nothing matches.' : 'Empty folder.'}</Text>}
      {visible.map((entry, i) => {
        const isSelected = offset + i === cursor
        const name = entry.isDir ? `${entry.name}/` : entry.name
        const room = width - 2 - (entry.isDir ? 0 : entry.size.length + 1)
        const label = name.length > room ? `${name.slice(0, Math.max(1, room - 1))}…` : name.padEnd(room)
        const bar = !hasScrollbar ? '' : i >= thumbAt && i < thumbAt + thumbSize ? ' █' : ' │'
        return (
          <Text>
            <Text color="claude">{isSelected ? '→ ' : '  '}</Text>
            <Text bold={isSelected || entry.isDir} color={entry.isDir ? LINK : 'text'} inverse={isSelected}>
              {label}
            </Text>
            {!entry.isDir && <Text dimColor> {entry.size}</Text>}
            <Text color="subtle">{bar}</Text>
          </Text>
        )
      })}
    </Box>
  )
}
