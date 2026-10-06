import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown } from 'claude-code'

import type { Segment, Snapshot } from '../types'
import { allocate, compact } from './cells'

const COMMAND = 'context-bar'
// Cells the prompt footer keeps clear at its edges.
const MARGIN = 4
// One glyph for every cell. Fonts give the shade characters (░ ▒ ▓) a different
// height from the full block, so mixing them leaves the bar's runs uneven; the
// kinds are told apart by colour instead.
const CELL = '█'
// Free space recedes behind the categories; the engine's own colour for it is
// the one it gives system tools.
const FREE_COLOR = 'subtle'

const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, true)
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)

const toSnapshot = (breakdown: SessionContextBreakdown): Snapshot => {
  const segments: Segment[] = []

  for (const row of breakdown.categories) {
    if (row.kind !== 'deferred' && row.tokens > 0) {
      segments.push({ name: row.name, tokens: row.tokens, color: row.color, kind: row.kind })
    }
  }

  return { segments, used: breakdown.totalTokens, max: breakdown.rawMaxTokens }
}

// `summary` estimates locally; `full` would send a token-count request per tool
// and memory file on every refresh.
const refresh = async ($: EngineInterface) => {
  const { context } = await $.session.usage({ breakdown: 'summary' })

  if (context.breakdown) {
    const next = toSnapshot(context.breakdown)
    await update($, snapshot, () => next)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the context window bar above the prompt',
    })
    await refresh($)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const shows = !(await read($, isShown))
    await update($, isShown, () => shows)

    if (shows) {
      await refresh($)
    }

    return { text: shows ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context') && (await read($, isShown))) {
      await refresh($)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (await read($, isShown)) {
      await refresh($)
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
    const percent = shot.max > 0 ? Math.round((shot.used / shot.max) * 100) : 0
    const label = ` ${compact(shot.used)}/${compact(shot.max)} ${percent}%`
    const width = Math.max(10, (e.viewport?.columns ?? 80) - MARGIN - label.length)
    const cells = allocate(
      shot.segments.map(s => s.tokens),
      width,
    )

    return (
      <Box flexDirection="column">
        <Box key="bar">
          {shot.segments.map((s, i) => (
            <Text color={s.kind === 'free' ? FREE_COLOR : s.color}>{CELL.repeat(cells[i] ?? 0)}</Text>
          ))}
          <Text dimColor>{label}</Text>
        </Box>
        <Box key="legend" flexWrap="wrap">
          {shot.segments
            .filter(s => s.kind !== 'free')
            .map(s => (
              <Box marginRight={2}>
                <Text color={s.color}>{CELL}</Text>
                <Text dimColor>
                  {' '}
                  {s.name} {compact(s.tokens)}
                </Text>
              </Box>
            ))}
        </Box>
        {hint}
      </Box>
    )
  })
}
