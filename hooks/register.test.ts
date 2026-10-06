import { expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

import { allocate, compact } from './cells'

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
  expect(compact(56_000)).toBe('56k')
  expect(compact(1_000_000)).toBe('1M')
})

test('the bar draws under the prompt, above the hint line, one coloured run per category and /context-bar toggles it', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', { component: 'PromptHint' }, (_, e) => ({
    type: 'Text',
    props: { dimColor: true },
    children: [e.props.hint],
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const first = await $.command.run(TOGGLE)
    const wasShown = first.text === 'Context bar shown.'

    if (!wasShown) {
      expect((await $.command.run(TOGGLE)).text).toBe('Context bar shown.')
    }

    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...HINT })
    expect(await ui.find({ type: 'Text', text: ' 60k/200k 30%' })).toBeDefined()

    const bar = await ui.find({ key: 'bar' })
    const runs = (bar?.children ?? []) as { props: { color?: string }; children: string[] }[]
    const drawn = runs.slice(0, -1)
    expect(drawn.map(r => r.props.color)).toEqual(['promptBorder', 'purple', 'subtle', 'inactive'])
    expect(drawn.map(r => r.children.join('').length).reduce((a, b) => a + b, 0)).toBe(60 - ' 60k/200k 30%'.length)
    // Every cell of the bar is the same glyph, so no run can sit taller or shorter
    // than its neighbours whatever the font does with block and shade characters.
    expect(new Set(drawn.flatMap(r => [...r.children.join('')]))).toEqual(new Set(['█']))
    const legend = await ui.find({ key: 'legend' })
    const entries = (legend?.children ?? []) as { children: { children: string[] }[] }[]
    expect(entries.map(entry => entry.children[0]?.children.join(''))).toEqual(['█', '█', '█'])
    expect(await ui.findAll({ type: 'Text', text: /[░▒▓]/ })).toHaveLength(0)

    expect(await ui.find({ type: 'Text', text: /Messages 56k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /deferred/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
    await ui.unmount()

    expect((await $.command.run(TOGGLE)).text).toBe('Context bar hidden.')
  }
})
