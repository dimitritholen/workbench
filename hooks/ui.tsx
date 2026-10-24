import type { BoxProps, Color, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import { brailleBar, clamp } from './lib'

// Box and Text are on every surface's table, so any table fits.
export type Ui = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

// A round border and one cell of padding take four columns of the pane.
export const INSET = 4

const BORDER = '#555555'

export const level = (percent: number): Color => (percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success')

export type BlockOptions = { title: string; footer?: string; right?: RenderChildren; isFocused?: boolean }

// A ratatui-style block: the title sits in the top border, a footer in the bottom one.
// The labels are siblings after the bordered box: an absolute box paints over
// the siblings before it, never over its own parent's border.
export function block(ui: Ui, o: BlockOptions, body: RenderChildren) {
  const { Box, Text } = ui
  // every border the same dark gray; the focused block shows in its title color
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={BORDER} paddingX={1}>
        {body}
      </Box>
      <Box position="absolute" top={0} left={1}>
        <Text bold color={o.isFocused ? 'claude' : 'text'}>
          {` ${o.title} `}
        </Text>
      </Box>
      {o.right !== undefined && (
        <Box position="absolute" top={0} right={1}>
          <Text> {o.right} </Text>
        </Box>
      )}
      {o.footer !== undefined && (
        <Box position="absolute" bottom={0} right={1}>
          <Text dimColor>{` ${o.footer} `}</Text>
        </Box>
      )}
    </Box>
  )
}

// `[key→action]` hints, the keys in the accent color, as a status line under the pane.
export function hints(ui: Ui, pairs: [string, string][]) {
  const { Text } = ui
  return (
    <Text wrap="truncate-end">
      {pairs.map(([key, action]) => (
        <Text>
          <Text color="subtle">[</Text>
          <Text color="warning">{key}</Text>
          <Text color="subtle">→</Text>
          <Text dimColor>{action}</Text>
          <Text color="subtle">] </Text>
        </Text>
      ))}
    </Text>
  )
}

// A braille bar in its level's color; blank after it, so the columns behind still line up.
export function meter(ui: Ui, percent: number, width: number) {
  const { Text } = ui
  const { used, rest } = brailleBar(percent, width)
  return (
    <Text>
      <Text color={level(percent)}>{used}</Text>
      {' '.repeat(rest.length)}
    </Text>
  )
}

const SPARK = '▁▂▃▄▅▆▇█'

export const sparkline = (values: number[]) =>
  values.map(v => SPARK[Math.min(SPARK.length - 1, Math.floor((clamp(v) / 100) * SPARK.length))]).join('')

export const fit = (text: string, width: number) =>
  text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(0, width - 1))}…`
