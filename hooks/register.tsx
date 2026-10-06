import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, Timer } from 'claude-code'

import type { Category, Frame, Snapshot } from '../types'
import { allocate, compact, easeOut, fit, paint, percent, wrapRows } from './cells'

const COMMAND = 'context-bar'
// Cells the prompt footer keeps clear at its edges.
const MARGIN = 4
// The box's border and padding, both sides.
const CHROME = 4
// Cells between two legend entries.
const GAP = 3
// One move of the bar: STEPS frames, FRAME_MS apart.
const FRAME_MS = 40
const STEPS = 12

// Category colours, by the engine's name for the category; one it gives no
// entry here keeps the engine's own colour.
const PALETTE: Record<string, string> = {
  'system prompt': '#88a5d4',
  'system tools': '#8ecfd0',
  'mcp tools': '#a98bf0',
  'custom agents': '#9fcf8c',
  'memory files': '#e6c86f',
  skills: '#e9a7c0',
  messages: '#d97757',
}
const LABEL: Record<string, string> = { 'system tools': 'tools', 'custom agents': 'agents' }
const TRACK = {
  dark: { free: '#3a3e4b', buffer: '#1f1c23' },
  light: { free: '#d5d8e0', buffer: '#b4b7c2' },
} as const
const MARK = '#e6c86f'

const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, true)
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const frame = atom({ plugin: 'context-bar', key: 'frame' } as const, null)

const toSnapshot = (breakdown: SessionContextBreakdown, isLight: boolean): Snapshot => {
  const categories: Category[] = []
  let free = 0
  let buffer = 0

  for (const row of breakdown.categories) {
    if (row.kind === 'used' && row.tokens > 0) {
      categories.push({
        name: row.name,
        tokens: row.tokens,
        color: PALETTE[row.name.toLowerCase()] ?? row.color,
      })
    } else if (row.kind === 'free') {
      free = row.tokens
    } else if (row.kind === 'buffer') {
      buffer = row.tokens
    }
  }

  return { categories, used: breakdown.totalTokens, max: breakdown.rawMaxTokens, free, buffer, isLight }
}

const toFrame = (shot: Snapshot): Frame => ({
  tokens: Object.fromEntries(shot.categories.map(c => [c.name, c.tokens])),
  used: shot.used,
})

const EMPTY: Frame = { tokens: {}, used: 0 }

const mix = (from: Frame, to: Frame, t: number): Frame => ({
  tokens: Object.fromEntries(
    Object.entries(to.tokens).map(([name, tokens]) => {
      const start = from.tokens[name] ?? 0

      return [name, start + (tokens - start) * t]
    }),
  ),
  used: from.used + (to.used - from.used) * t,
})

const isSame = (a: Frame, b: Frame): boolean => JSON.stringify(a) === JSON.stringify(b)

let timer: Timer | undefined

// Moves the drawn frame from `from` to the snapshot's own values.
const animate = async ($: EngineInterface, from: Frame, to: Frame) => {
  timer?.cancel()
  timer = undefined

  if (isSame(from, to)) {
    await update($, frame, () => to)

    return
  }

  let step = 0
  await update($, frame, () => from)
  timer = $.clock.every(FRAME_MS, () => {
    step += 1
    const next = step >= STEPS ? to : mix(from, to, easeOut(step / STEPS))

    if (step >= STEPS) {
      timer?.cancel()
      timer = undefined
    }

    void update($, frame, () => next)
  })
}

// `summary` estimates locally; `full` would send a token-count request per tool
// and memory file on every refresh. `grow` starts the bar from empty; `slide`
// moves it from where it stands.
const refresh = async ($: EngineInterface, motion: 'grow' | 'slide') => {
  const { context } = await $.session.usage({ breakdown: 'summary' })

  if (!context.breakdown) {
    return
  }

  const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
  const next = toSnapshot(context.breakdown, typeof theme === 'string' && theme.startsWith('light'))
  const drawn = await read($, frame)
  await update($, snapshot, () => next)
  await animate($, motion === 'grow' || drawn === null ? EMPTY : drawn, toFrame(next))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the context bar',
    })
    await refresh($, 'grow')

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const shows = !(await read($, isShown))
    await update($, isShown, () => shows)

    if (shows) {
      await refresh($, 'grow')
    }

    return { text: shows ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && (await read($, isShown))) {
      await refresh($, 'slide')
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (await read($, isShown)) {
      await refresh($, 'slide')
    }

    return done
  }).catch((_, e, next) => next(e))

  // The hint line is the one site under the prompt box: the bar goes above the
  // engine's own line, which `next(e)` still draws.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const hint = await next(e)
    const shot = await read($, snapshot)

    if (shot === null || !(await read($, isShown))) {
      return hint
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = (await read($, frame)) ?? toFrame(shot)
    const track = shot.isLight ? TRACK.light : TRACK.dark
    const outer = Math.max(24, (e.viewport?.columns ?? 80) - MARGIN)

    const entries = [
      ...shot.categories.map(c => ({
        color: c.color,
        name: LABEL[c.name.toLowerCase()] ?? c.name.toLowerCase(),
        tokens: compact(c.tokens),
        share: ` ${percent(c.tokens, shot.max)}`,
      })),
      { color: track.free, name: 'free', tokens: compact(shot.free), share: '' },
    ]
    // A short terminal clips what is drawn under the prompt from the bottom, so
    // the drawing gives up its legend, then its box, before that happens.
    const legendRows = wrapRows(
      entries.map(entry => `■ ${entry.name} ${entry.tokens}${entry.share}`.length),
      GAP,
      outer - CHROME,
    )
    const shape = fit(e.viewport?.rows ?? 24, legendRows)
    const width = shape === 'bare' ? outer : outer - CHROME

    // The buffer takes whole cells at the right end, so the mark that opens it
    // has a cell of its own; the categories and the free space share the rest
    // in half cells.
    const reserve = shot.buffer > 0 ? Math.max(1, Math.round((shot.buffer / shot.max) * width)) : 0
    const drawn = shot.categories.map(c => now.tokens[c.name] ?? 0)
    const open = Math.max(0, shot.max - shot.buffer - drawn.reduce((sum, t) => sum + t, 0))
    const halves = allocate([...drawn, open], (width - reserve) * 2)
    const colors = [...shot.categories.map(c => c.color), track.free]
    const runs = paint(halves.flatMap((n, i) => Array<string>(n).fill(colors[i] ?? track.free)))

    const limit = shot.max - shot.buffer
    const load = limit > 0 ? shot.used / limit : 0
    const badge = load < 0.6 ? 'success' : load < 0.85 ? 'warning' : 'error'

    const head = (
      <Box key="head" justifyContent="space-between">
        <Box>
          <Text color="claude">◆ </Text>
          <Text bold>context</Text>
        </Box>
        <Box>
          <Text bold>{compact(now.used)}</Text>
          <Text dimColor>
            {' '}
            of {compact(shot.max)}
            {shot.buffer > 0 ? ` · compacts at ${compact(limit)}` : ''}{' '}
          </Text>
          <Text bold color="inverseText" backgroundColor={badge}>
            {' '}
            {percent(now.used, shot.max)}{' '}
          </Text>
        </Box>
      </Box>
    )
    const bar = (
      <Box key="bar">
        {runs.map(run => (
          <Text color={run.color} backgroundColor={run.backgroundColor}>
            {run.text}
          </Text>
        ))}
        {reserve > 0 ? (
          <Text color={MARK} backgroundColor={track.buffer}>
            ▏
          </Text>
        ) : null}
        {reserve > 1 ? <Text color={track.buffer}>{'█'.repeat(reserve - 1)}</Text> : null}
      </Box>
    )

    if (shape === 'bare') {
      return (
        <Box flexDirection="column">
          <Box flexDirection="column" width={outer}>
            {head}
            {bar}
          </Box>
          {hint}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" width={outer} borderStyle="round" borderColor="subtle" paddingX={1}>
          {head}
          {bar}
          {shape === 'full' ? (
            <Box key="legend" flexWrap="wrap" columnGap={GAP}>
              {entries.map(entry => (
                <Box>
                  <Text color={entry.color}>■</Text>
                  <Text dimColor={entry.share === ''}> {entry.name} </Text>
                  <Text bold>{entry.tokens}</Text>
                  <Text dimColor>{entry.share}</Text>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
        {hint}
      </Box>
    )
  })
}
