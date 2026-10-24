import type { BoxProps, Color, ElementConstructor, RenderChildren, TextProps } from 'claude-code'

import { clamp } from './lib'

// Box and Text are on every surface's table, so any table fits.
export type Ui = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

// A round border and one cell of padding take four columns of the pane.
export const INSET = 4

export const level = (percent: number): Color => (percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success')

export function panel(ui: Ui, title: string, body: RenderChildren, right?: RenderChildren) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="claude">
          {title}
        </Text>
        {right ?? null}
      </Box>
      {body}
    </Box>
  )
}

// A line of heavy dashes: the used part in its level's color, the rest faint.
export function meter(ui: Ui, percent: number, width: number) {
  const { Text } = ui
  const full = Math.round((clamp(percent) / 100) * width)
  return (
    <Text>
      <Text color={level(percent)}>{'━'.repeat(full)}</Text>
      <Text color="subtle">{'━'.repeat(Math.max(0, width - full))}</Text>
    </Text>
  )
}

const SPARK = '▁▂▃▄▅▆▇█'

export const sparkline = (values: number[]) =>
  values.map(v => SPARK[Math.min(SPARK.length - 1, Math.floor((clamp(v) / 100) * SPARK.length))]).join('')

export const fit = (text: string, width: number) =>
  text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(0, width - 1))}…`
