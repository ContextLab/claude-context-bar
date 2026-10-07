import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { allocate, blend, compact, easeOut, fit, paint, percent, wrapRows } from './cells'

const row = (name: string, tokens: number, color: string, kind: 'used' | 'free' | 'buffer' | 'deferred') => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 200_000,
    breakdown: {
      categories: [
        row('System prompt', 4_000, 'promptBorder', 'used'),
        row('Messages', 56_000, 'purple', 'used'),
        row('MCP tools (deferred)', 30_000, 'inactive', 'deferred'),
        row('Free space', 107_000, 'promptBorder', 'free'),
        row('Autocompact buffer', 33_000, 'inactive', 'buffer'),
      ],
      totalTokens: 60_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'model-default',
      percentage: 30,
      gridRows: [],
      model: 'test',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

const HINT = {
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns: 64, rows: 24, docksPane: false },
} as const

const THEME = {
  key: 'theme',
  label: 'Theme',
  kind: 'choice',
  value: 'dark',
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
} as const

const TOGGLE = {
  command: 'context-bar',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

test('allocate fills the width and keeps tiny categories visible', () => {
  const cells = allocate([1, 5000, 0, 4999], 20)
  expect(cells.reduce((a, b) => a + b, 0)).toBe(20)
  expect(cells[0]).toBe(1)
  expect(cells[2]).toBe(0)
  expect(allocate([0, 0], 20)).toEqual([0, 0])
  expect(allocate([3, 3, 3], 2).reduce((a, b) => a + b, 0)).toBe(3)
})

test('compact formats token counts', () => {
  expect(compact(999)).toBe('999')
  expect(compact(3_400)).toBe('3.4k')
  expect(compact(4_000)).toBe('4k')
  expect(compact(56_000)).toBe('56k')
  expect(compact(1_000_000)).toBe('1M')
})

test('percent keeps a decimal under one percent', () => {
  expect(percent(3_400, 1_000_000)).toBe('0.3%')
  expect(percent(100, 1_000_000)).toBe('0.1%')
  expect(percent(60_000, 200_000)).toBe('30%')
  expect(percent(0, 200_000)).toBe('0%')
  expect(percent(5, 0)).toBe('0%')
})

test('paint draws a full block per cell and a half block where two colours meet', () => {
  expect(paint(['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b'])).toEqual([
    { text: '██', color: 'a' },
    { text: '▌', color: 'a', backgroundColor: 'b' },
    { text: '█', color: 'b' },
  ])
  expect(paint(['a', 'b', 'c', 'c'])).toEqual([
    { text: '▌', color: 'a', backgroundColor: 'b' },
    { text: '█', color: 'c' },
  ])
  expect(paint([])).toEqual([])
})

test('blend mixes two hex colours and leaves a theme colour alone', () => {
  expect(blend('#d97757', '#3a3e4b', 0)).toBe('#d97757')
  expect(blend('#d97757', '#3a3e4b', 1)).toBe('#3a3e4b')
  expect(blend('#d97757', '#3a3e4b', 0.5)).toBe('#8a5b51')
  expect(blend('purple', '#3a3e4b', 0.5)).toBe('purple')
  expect(blend('#d97757', 'subtle', 0.5)).toBe('#d97757')
})

test('easeOut runs from 0 to 1, fastest at the start', () => {
  expect(easeOut(0)).toBe(0)
  expect(easeOut(1)).toBe(1)
  expect(easeOut(0.5)).toBeGreaterThan(0.5)
})

test('wrapRows counts the rows a wrapping legend takes', () => {
  expect(wrapRows([], 3, 20)).toBe(0)
  expect(wrapRows([8, 9], 3, 20)).toBe(1)
  expect(wrapRows([8, 9, 1], 3, 20)).toBe(2)
  expect(wrapRows([30], 3, 20)).toBe(1)
})

test('fit drops the legend, then the box, as the terminal gets shorter', () => {
  expect(fit(29, 2)).toBe('full')
  expect(fit(24, 2)).toBe('full')
  expect(fit(22, 2)).toBe('boxed')
  expect(fit(22, 1)).toBe('full')
  expect(fit(20, 1)).toBe('boxed')
  expect(fit(19, 1)).toBe('bare')
})

type Drawn = { props: { color?: string; backgroundColor?: string }; children: string[] }

const show = async ($: { command: { run: (e: typeof TOGGLE) => Promise<{ text?: string }> } }) => {
  if ((await $.command.run(TOGGLE)).text !== 'Context bar shown.') {
    expect((await $.command.run(TOGGLE)).text).toBe('Context bar shown.')
  }
}

test('the box draws under the prompt, above the hint line, and /context-bar toggles it', async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('config.list', () => ({ value: [THEME] }))
  on('ui.render', { component: 'PromptHint' }, (_, e) => ({
    type: 'Text',
    props: { dimColor: true },
    children: [e.props.hint],
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    await show($)
    await clock.advance(1000)

    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...HINT })

    // Header: the total, the window, where compaction starts, and the share used.
    expect(await ui.find({ type: 'Text', text: '60k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /of 200k · compacts at 167k/ })).toBeDefined()
    const badge = await ui.find({ type: 'Text', text: /^ 30% $/ })
    expect((badge?.props as { backgroundColor?: string }).backgroundColor).toBe('success')

    // Bar: 64 columns less the footer's margin and the box's border and padding.
    const bar = await ui.find({ key: 'bar' })
    const runs = (bar?.children ?? []) as Drawn[]
    const text = runs.map(r => r.children.join('')).join('')
    expect(text.length).toBe(64 - 4 - 4)
    // Only block glyphs that fill the cell's height: no shade characters, whose
    // height differs from the full block's in some fonts.
    expect(text).toMatch(/^[█▌▏]+$/)
    expect(await ui.findAll({ type: 'Text', text: /[░▒▓]/ })).toHaveLength(0)

    // System prompt, Messages, free space, then the mark and the buffer.
    const colors = runs.filter(r => r.children.join('').includes('█')).map(r => r.props.color)
    expect(colors).toEqual(['#88a5d4', '#d97757', '#3a3e4b', '#7a6a3a'])
    const mark = runs.find(r => r.children.join('') === '▏')
    expect(mark?.props).toMatchObject({ color: '#e6c86f', backgroundColor: '#7a6a3a' })
    // 33k of 200k is 9 of 56 cells: the mark and eight more.
    expect(runs[runs.length - 1]?.children.join('')).toBe('█'.repeat(8))

    // Legend: each used category with its share, then the free space.
    const legend = await ui.find({ key: 'legend' })
    const entries = (legend?.children ?? []) as { children: { children: string[] }[] }[]
    expect(entries.map(entry => entry.children.map(part => part.children.join('')).join(''))).toEqual([
      '■ system prompt 4k 2%',
      '■ messages 56k 28%',
      '■ free 107k',
      '■ autocompact buffer 33k 17%',
    ])
    expect(await ui.find({ type: 'Text', text: /deferred/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
    await ui.unmount()

    expect((await $.command.run(TOGGLE)).text).toBe('Context bar hidden.')
    const hidden = await $.ui.mount({ plugin: 'context-bar', surface, ...HINT })
    expect(await hidden.find({ key: 'bar' })).toBeUndefined()
    expect(await hidden.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
    await hidden.unmount()
  }
})

test('the bar grows from empty when shown and settles on the real values', async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('config.list', () => ({ value: [THEME] }))
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Text', props: {}, children: [''] }))

  const header = async () => {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...HINT })
    const head = await ui.find({ key: 'head' })
    const right = (head?.children ?? [])[1] as { children: { children: string[] }[] }
    const bar = await ui.find({ key: 'bar' })
    const runs = (bar?.children ?? []) as Drawn[]
    const filled = runs
      .filter(r => r.props.color === '#d97757')
      .map(r => r.children.join('').length)
      .reduce((a, b) => a + b, 0)
    const legend = await ui.find({ type: 'Text', text: '56k' })
    await ui.unmount()

    return { used: right.children[0]?.children.join('') ?? '', filled, hasLegend: legend !== undefined }
  }

  await show($)

  // Nothing has moved yet: an empty bar, while the legend already has the totals.
  const start = await header()
  expect(start.used).toBe('0')
  expect(start.filled).toBe(0)
  expect(start.hasLegend).toBe(true)

  // Part of the way there after a few frames.
  await clock.advance(20 * 6)
  const mid = await header()
  expect(mid.filled).toBeGreaterThan(0)
  expect(mid.used).not.toBe('0')
  expect(mid.used).not.toBe('60k')

  // Still moving at the old half-second mark: the move takes 36 frames of 20 ms.
  await clock.advance(20 * 19)
  const late = await header()
  expect(late.used).not.toBe('60k')
  expect(late.filled).toBeGreaterThanOrEqual(mid.filled)

  // Settled once all the frames have run, and still there later.
  await clock.advance(20 * 11)
  const end = await header()
  expect(end.used).toBe('60k')
  expect(end.filled).toBeGreaterThanOrEqual(mid.filled)
  await clock.advance(5000)
  expect(await header()).toEqual(end)

  expect((await $.command.run(TOGGLE)).text).toBe('Context bar hidden.')
})

test('a short terminal gets the box without its legend, a shorter one the header and bar alone', async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('config.list', () => ({ value: [THEME] }))
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Text', props: {}, children: [''] }))

  await show($)
  await clock.advance(1000)

  const draw = async (rows: number) => {
    const ui = await $.ui.mount({
      plugin: 'context-bar',
      surface: 'terminal',
      ...HINT,
      viewport: { ...HINT.viewport, rows },
    })
    const bar = await ui.find({ key: 'bar' })
    const cells = ((bar?.children ?? []) as Drawn[]).map(r => r.children.join('')).join('').length
    const shape = {
      cells,
      hasHead: (await ui.find({ key: 'head' })) !== undefined,
      hasLegend: (await ui.find({ key: 'legend' })) !== undefined,
    }
    await ui.unmount()

    return shape
  }

  expect(await draw(24)).toEqual({ cells: 56, hasHead: true, hasLegend: true })
  expect(await draw(20)).toEqual({ cells: 56, hasHead: true, hasLegend: false })
  // No border or padding to make room for: the bar takes the whole width.
  expect(await draw(16)).toEqual({ cells: 60, hasHead: true, hasLegend: false })

  expect((await $.command.run(TOGGLE)).text).toBe('Context bar hidden.')
})

// The same window after a compaction: the messages are down to 6k.
const COMPACTED: SessionUsage = {
  ...USAGE,
  context: {
    ...USAGE.context,
    breakdown: {
      ...USAGE.context.breakdown!,
      categories: [
        row('System prompt', 4_000, 'promptBorder', 'used'),
        row('Messages', 6_000, 'purple', 'used'),
        row('Free space', 157_000, 'promptBorder', 'free'),
        row('Autocompact buffer', 33_000, 'inactive', 'buffer'),
      ],
      totalTokens: 10_000,
    },
  },
}

const SUMMARY = { role: 'user' as const, text: 'What was said so far.', toolUses: [] }
const MESSAGES = '#d97757'
const DIMMED = '#8a5b51'

test('the messages dim while a compaction runs, then the bar slides to the compacted size', async ($, on) => {
  const clock = mock.clock(on)
  let usage = USAGE
  let finish: (skip?: string) => void = () => {}
  on('session.usage', () => ({ value: usage }))
  on('config.list', () => ({ value: [THEME] }))
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Text', props: {}, children: [''] }))
  on(
    'session.compact',
    () => new Promise(resolve => (finish = skip => resolve(skip === undefined ? { messages: [SUMMARY] } : { skip }))),
  )

  const draw = async () => {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...HINT })
    const head = await ui.find({ key: 'head' })
    const right = (head?.children ?? [])[1] as { children: { children: string[] }[] }
    const runs = ((await ui.find({ key: 'bar' }))?.children ?? []) as Drawn[]
    const cells = (color: string) =>
      runs
        .filter(r => r.props.color === color)
        .map(r => r.children.join('').length)
        .reduce((a, b) => a + b, 0)
    const legend = await ui.find({ key: 'legend' })
    const entries = (legend?.children ?? []) as { children: { props: { color?: string }; children: string[] }[] }[]
    const entry = entries.find(parts => parts.children[1]?.children.join('') === ' messages ')
    await ui.unmount()

    return {
      used: right.children[0]?.children.join('') ?? '',
      bright: cells(MESSAGES),
      dimmed: cells(DIMMED),
      swatch: entry?.children[0]?.props.color,
      count: entry?.children[2]?.children.join(''),
    }
  }

  await show($)
  await clock.advance(1000)
  const full = await draw()
  expect(full).toMatchObject({ used: '60k', dimmed: 0, swatch: MESSAGES, count: '56k' })
  expect(full.bright).toBeGreaterThan(10)

  // Compacting: the messages fade to the colour halfway to the free space's,
  // in the bar and the legend, and nothing moves.
  const compacting = $.session.compact({ trigger: 'manual', messages: [SUMMARY] })
  await clock.advance(20 * 6)
  const fading = await draw()
  expect(fading.bright).toBe(0)
  expect(fading.dimmed).toBe(0)
  expect(fading.swatch).not.toBe(MESSAGES)
  await clock.advance(1000)
  const dim = await draw()
  expect(dim).toEqual({ used: '60k', bright: 0, dimmed: full.bright, swatch: DIMMED, count: '56k' })
  // However long the compaction takes.
  await clock.advance(30_000)
  expect(await draw()).toEqual(dim)

  // The compaction is done, but the engine's count is the old one for a
  // moment: the bar holds, dimmed.
  finish()
  await compacting
  await clock.advance(250)
  expect(await draw()).toEqual(dim)

  // The count moves: the legend has the new size at once, and the bar slides
  // down to it as the messages take their colour back.
  usage = COMPACTED
  await clock.advance(100 + 20 * 6)
  const sliding = await draw()
  expect(sliding.count).toBe('6k')
  expect(sliding.used).not.toBe('60k')
  expect(sliding.used).not.toBe('10k')
  await clock.advance(1000)
  const end = await draw()
  expect(end).toMatchObject({ used: '10k', dimmed: 0, swatch: MESSAGES, count: '6k' })
  expect(end.bright).toBeGreaterThan(0)
  expect(end.bright).toBeLessThan(full.bright)
  await clock.advance(5000)
  expect(await draw()).toEqual(end)

  // A compaction that is skipped leaves the bar as it was, at full colour.
  const skipped = $.session.compact({ trigger: 'manual', messages: [SUMMARY] })
  await clock.advance(1000)
  expect((await draw()).dimmed).toBe(end.bright)
  finish('nothing to compact')
  await skipped
  await clock.advance(1000)
  expect(await draw()).toEqual(end)

  // A count that never moves does not leave the messages dimmed.
  const same = $.session.compact({ trigger: 'manual', messages: [SUMMARY] })
  await clock.advance(1000)
  finish()
  await same
  await clock.advance(1000)
  expect((await draw()).dimmed).toBe(end.bright)
  await clock.advance(2000)
  expect(await draw()).toEqual(end)

  expect((await $.command.run(TOGGLE)).text).toBe('Context bar hidden.')
})
