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

export const compact = (n: number): string => {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }

  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}
