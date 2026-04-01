function linearize(c) {
  const s = c / 255
  return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92
}

function labF(t) {
  return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116
}

export function rgbToLab(rgb) {
  const r = linearize(rgb[0])
  const g = linearize(rgb[1])
  const b = linearize(rgb[2])

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

  const fx = labF(x), fy = labF(y), fz = labF(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function deltaE(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function mixLab(labs, ratios) {
  return [
    labs.reduce((s, l, i) => s + ratios[i] * l[0], 0),
    labs.reduce((s, l, i) => s + ratios[i] * l[1], 0),
    labs.reduce((s, l, i) => s + ratios[i] * l[2], 0),
  ]
}

export function matchColor(targetRgb, paints) {
  const targetLab = rgbToLab(targetRgb)
  const paintLabs = paints.map(p => rgbToLab(p.rgb))

  const STEPS = 50
  let best = { deltaE: Infinity, indices: [], ratios: [] }

  function update(indices, ratios) {
    const de = deltaE(targetLab, mixLab(indices.map(i => paintLabs[i]), ratios))
    if (de < best.deltaE) best = { deltaE: de, indices, ratios }
  }

  // Single paint
  for (let i = 0; i < paints.length; i++) update([i], [1])

  // 2-paint blends
  for (let i = 0; i < paints.length; i++) {
    for (let j = i + 1; j < paints.length; j++) {
      for (let t = 1; t < STEPS; t++) {
        const r = t / STEPS
        update([i, j], [1 - r, r])
      }
    }
  }

  // 3-paint blends — always, not gated
  for (let i = 0; i < paints.length; i++) {
    for (let j = i + 1; j < paints.length; j++) {
      for (let k = j + 1; k < paints.length; k++) {
        for (let t1 = 1; t1 < STEPS - 1; t1++) {
          for (let t2 = 1; t2 < STEPS - t1; t2++) {
            const r1 = t1 / STEPS
            const r2 = t2 / STEPS
            const r3 = 1 - r1 - r2
            if (r3 <= 0) continue
            update([i, j, k], [r1, r2, r3])
          }
        }
      }
    }
  }

  // Build result — round ratios to nearest 5%
  const raw = best.indices.map((pi, i) => ({ paint: paints[pi], ratio: best.ratios[i] }))
  const filtered = raw.filter(m => m.ratio > 0.01)
  const total = filtered.reduce((s, m) => s + m.ratio, 0)

  const rounded = filtered.map(m => ({
    name: m.paint.name,
    rgb: m.paint.rgb,
    ratio: Math.round((m.ratio / total) * 20) * 5  // nearest 5%
  }))

  // Normalize rounding errors so they sum to 100
  const sum = rounded.reduce((s, m) => s + m.ratio, 0)
  if (rounded.length > 0) rounded[0].ratio += 100 - sum

  return { deltaE: Math.round(best.deltaE * 10) / 10, mix: rounded }
}

export function matchQuality(de) {
  if (de < 5)  return { label: 'Excellent', color: '#22c55e' }
  if (de < 10) return { label: 'Good',      color: '#84cc16' }
  if (de < 20) return { label: 'Fair',      color: '#f59e0b' }
  return             { label: 'Approximate',color: '#ef4444' }
}
