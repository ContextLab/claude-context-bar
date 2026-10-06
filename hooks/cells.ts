/**
 * Splits `width` cells among `tokens` in proportion (largest remainder), every
 * non-zero entry getting at least one cell so no category vanishes from the bar.
 */
export const allocate = (tokens: readonly number[], width: number): number[] => {
  const total = tokens.reduce((sum, t) => sum + t, 0)

  if (total <= 0 || width <= 0) {
    return tokens.map(() => 0)
  }

  const ideal = tokens.map(t => (t / total) * width)
  const cells = ideal.map((x, i) => ((tokens[i] ?? 0) > 0 ? Math.max(1, Math.floor(x)) : 0))
  let spare = width - cells.reduce((sum, c) => sum + c, 0)

  while (spare !== 0) {
    let pick = -1

    cells.forEach((c, i) => {
      const lead = (ideal[i] ?? 0) - c
      const best = pick < 0 ? 0 : (ideal[pick] ?? 0) - (cells[pick] ?? 0)
      const isBetter = spare > 0 ? c > 0 && (pick < 0 || lead > best) : c > 1 && (pick < 0 || lead < best)

      if (isBetter) {
        pick = i
      }
    })

    if (pick < 0) {
      break
    }

    cells[pick] = (cells[pick] ?? 0) + Math.sign(spare)
    spare -= Math.sign(spare)
  }

  return cells
}

export type Run = { text: string; color: string; backgroundColor?: string }

/**
 * Turns half-cell colours (two per cell, left then right) into runs of text. A
 * cell of one colour is a full block; a cell where two meet is a left half
 * block in the first colour over a background of the second, so a boundary can
 * fall mid-cell.
 */
export const paint = (halves: readonly string[]): Run[] => {
  const runs: Run[] = []

  for (let i = 0; i + 1 < halves.length; i += 2) {
    const left = halves[i] ?? ''
    const right = halves[i + 1] ?? ''
    const last = runs[runs.length - 1]

    if (left !== right) {
      runs.push({ text: '▌', color: left, backgroundColor: right })
    } else if (last && last.color === left && last.backgroundColor === undefined) {
      last.text += '█'
    } else {
      runs.push({ text: '█', color: left })
    }
  }

  return runs
}

const trim = (n: number, digits: number): string => n.toFixed(digits).replace(/\.0$/, '')

export const compact = (n: number): string => {
  if (n >= 1_000_000) {
    return `${trim(n / 1_000_000, 1)}M`
  }

  if (n >= 10_000) {
    return `${Math.round(n / 1000)}k`
  }

  return n >= 1000 ? `${trim(n / 1000, 1)}k` : `${Math.round(n)}`
}

export const percent = (part: number, whole: number): string => {
  const p = whole > 0 ? (part / whole) * 100 : 0

  return `${p > 0 && p < 1 ? trim(Math.max(0.1, p), 1) : Math.round(p)}%`
}

/** Fast at first, settling at the end. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** Rows a wrapping row of items takes: `widths` laid left to right, `gap` cells apart. */
export const wrapRows = (widths: readonly number[], gap: number, width: number): number => {
  let rows = 0
  let used = 0

  for (const w of widths) {
    if (rows === 0 || used + gap + w > width) {
      rows += 1
      used = w
    } else {
      used += gap + w
    }
  }

  return rows
}

// Claude Code gives everything at the bottom half the terminal's rows, the
// prompt's four included, and clips what does not fit. Two of the rest are
// left for a status line and the mode line.
const OTHER_ROWS = 6
// The box's border, the header and the bar.
const BOX_ROWS = 4

/**
 * How much of the drawing a terminal of `rows` rows has room for: the whole
 * box, the box without its legend, or the header and bar alone.
 */
export const fit = (rows: number, legendRows: number): 'full' | 'boxed' | 'bare' => {
  const room = Math.floor(rows / 2) - OTHER_ROWS

  if (BOX_ROWS + legendRows <= room) {
    return 'full'
  }

  return BOX_ROWS <= room ? 'boxed' : 'bare'
}
