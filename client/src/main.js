import { quantizeImage } from './lib/quantize.js'
import { matchColor, rgbToLab } from './lib/colorMatch.js'
import { PAINTS } from './lib/paints.js'

const MAX_DIM = 1400

const PAINT_RGB = new Map(PAINTS.map(p => [p.name, p.rgb]))

const SHORT_NAME = {
  'Titanium White':             'White',
  'Ivory Black':                'Black',
  'Burnt Umber':                'Burnt Umber',
  'Raw Umber':                  'Raw Umber',
  'Yellow Ochre':               'Yellow Ochre',
  'Cadmium Yellow Light':       'Cad. Yellow',
  'Cadmium Red':                'Cad. Red',
  'Alizarin Crimson Permanent': 'Alizarin',
  'Ultramarine Blue':           'Ultramarine',
  'Phthalo Blue (Green Shade)': 'Phthalo Blue',
}
const shortName = n => SHORT_NAME[n] || n

// Elements
const dropZone        = document.getElementById('dropZone')
const uploadBtn       = document.getElementById('uploadBtn')
const fileInput       = document.getElementById('fileInput')
const urlInput        = document.getElementById('urlInput')
const urlBtn          = document.getElementById('urlBtn')
const statusEl        = document.getElementById('status')
const resultsEl       = document.getElementById('results')
const inputSection    = document.getElementById('inputSection')
const originalCanvas  = document.getElementById('originalCanvas')
const quantizedCanvas = document.getElementById('quantizedCanvas')
const overlayCanvas   = document.getElementById('overlayCanvas')
const swatchesEl      = document.getElementById('swatches')
const colorCountEl    = document.getElementById('colorCount')
const resetBtn        = document.getElementById('resetBtn')
const colorSlider     = document.getElementById('colorSlider')
const outlineBtn      = document.getElementById('outlineBtn')
const shoppingListEl      = document.getElementById('shoppingList')
const consolidateSlider   = document.getElementById('consolidateSlider')

let outlineMode = false

let cachedImageData    = null
let cachedQuantizedData= null
let cachedAggregated   = null
let colorMasks         = null
let labelRegions       = null
let hexToPaintLabel    = new Map()
let hexToMatch         = new Map()
let debounceTimer      = null

// --- Event listeners ---

uploadBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]) })
urlBtn.addEventListener('click', () => { const u = urlInput.value.trim(); if (u) handleUrl(u) })
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') urlBtn.click() })

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file?.type.startsWith('image/')) handleFile(file)
  else { const t = e.dataTransfer.getData('text/plain'); if (t) handleUrl(t) }
})

resetBtn.addEventListener('click', reset)

swatchesEl.addEventListener('click', e => {
  const header = e.target.closest('.group-header')
  if (header) header.closest('.paint-group').classList.toggle('collapsed')
})

outlineBtn.addEventListener('click', () => {
  outlineMode = !outlineMode
  outlineBtn.classList.toggle('active', outlineMode)
  if (cachedQuantizedData) drawQuantizedCanvas()
})

consolidateSlider.addEventListener('input', () => {
  if (cachedAggregated) renderSwatches(consolidateMixes(cachedAggregated, Number(consolidateSlider.value)))
})

colorSlider.addEventListener('input', () => {
  if (!cachedImageData) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => reprocess(Number(colorSlider.value)), 150)
})

// Overlay mouse events
overlayCanvas.addEventListener('mousemove', e => {
  if (!cachedQuantizedData || !colorMasks) return
  const rect = overlayCanvas.getBoundingClientRect()
  const sx = overlayCanvas.width  / rect.width
  const sy = overlayCanvas.height / rect.height
  const x = Math.min(overlayCanvas.width  - 1, Math.floor((e.clientX - rect.left) * sx))
  const y = Math.min(overlayCanvas.height - 1, Math.floor((e.clientY - rect.top)  * sy))

  const i = (y * cachedQuantizedData.width + x) * 4
  const d = cachedQuantizedData.data
  const hex = '#' + [d[i], d[i+1], d[i+2]].map(v => v.toString(16).padStart(2, '0')).join('')

  // Update overlay
  const ctx = overlayCanvas.getContext('2d')
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  const mask = colorMasks.get(hex)
  if (mask) ctx.putImageData(mask, 0, 0)
  drawLabels(ctx, hex)

  // Highlight matching swatch
  swatchesEl.querySelectorAll('.swatch').forEach(el =>
    el.classList.toggle('highlighted', el.dataset.hexes.split(',').includes(hex))
  )

  // Show tooltip
  const match = hexToMatch.get(hex)
  if (match) showTooltip(e.clientX, e.clientY, hex, match)
  else hideTooltip()
})

overlayCanvas.addEventListener('mouseleave', () => {
  const ctx = overlayCanvas.getContext('2d')
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  drawLabels(ctx, null)
  swatchesEl.querySelectorAll('.swatch').forEach(el => el.classList.remove('highlighted'))
  hideTooltip()
})

// --- Handlers ---

function handleFile(file) {
  const url = URL.createObjectURL(file)
  loadAndProcess(url, () => URL.revokeObjectURL(url))
}
function handleUrl(url) { loadAndProcess('/api/proxy?url=' + encodeURIComponent(url)) }

function loadAndProcess(src, onDone) {
  setStatus('Loading image...')
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => { onDone?.(); setStatus('Quantizing colors...'); setTimeout(() => processImage(img), 50) }
  img.onerror = () => setStatus('Failed to load image. Check the URL and try again.', true)
  img.src = src
}

function processImage(img) {
  const { width, height } = scaleDims(img.naturalWidth, img.naturalHeight, MAX_DIM)
  originalCanvas.width  = width
  originalCanvas.height = height
  originalCanvas.getContext('2d').drawImage(img, 0, 0, width, height)
  cachedImageData = originalCanvas.getContext('2d').getImageData(0, 0, width, height)
  colorSlider.value = 128
  reprocess(128)
}

function reprocess(numColors) {
  setStatus('Quantizing colors...')
  setTimeout(() => {
    const { imageData: qData, palette } = quantizeImage(cachedImageData, numColors)
    cachedQuantizedData = qData

    quantizedCanvas.width  = cachedImageData.width
    quantizedCanvas.height = cachedImageData.height
    drawQuantizedCanvas()
    colorCountEl.textContent = `(${palette.length})`

    setStatus('Matching paint colors...')
    setTimeout(() => {
      const matches = palette.map(entry => ({ ...entry, match: matchColor(entry.rgb, PAINTS) }))

      // Build canvas labels — one line per paint
      hexToPaintLabel = new Map(matches.map(({ hex, match }) => {
        const label = match.mix.map(m => `${String(m.ratio).padStart(2, '0')} ${shortName(m.name)}`).join('\n')
        return [hex, label]
      }))
      hexToMatch = new Map(matches.map(({ hex, match }) => [hex, match]))

      cachedAggregated = aggregateByRecipe(matches, Infinity)
      setupOverlay(qData, palette)
      renderSwatches(consolidateMixes(cachedAggregated, Number(consolidateSlider.value)))
      renderShoppingList(matches)
      showResults()
    }, 50)
  }, 20)
}

function drawQuantizedCanvas() {
  const imageData = outlineMode ? buildOutlineImageData(cachedQuantizedData) : cachedQuantizedData
  quantizedCanvas.getContext('2d').putImageData(imageData, 0, 0)
}

function buildOutlineImageData(imageData) {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i+1], b = data[i+2]

      let edge = false
      if (!edge && x > 0)          { const j=i-4;       if (data[j]!==r||data[j+1]!==g||data[j+2]!==b) edge=true }
      if (!edge && x < width-1)    { const j=i+4;       if (data[j]!==r||data[j+1]!==g||data[j+2]!==b) edge=true }
      if (!edge && y > 0)          { const j=i-width*4; if (data[j]!==r||data[j+1]!==g||data[j+2]!==b) edge=true }
      if (!edge && y < height-1)   { const j=i+width*4; if (data[j]!==r||data[j+1]!==g||data[j+2]!==b) edge=true }

      if (edge) {
        out[i]=0; out[i+1]=0; out[i+2]=0; out[i+3]=255
      } else {
        // Faint tint of the region color on white
        out[i]   = Math.round(r * 0.18 + 255 * 0.82)
        out[i+1] = Math.round(g * 0.18 + 255 * 0.82)
        out[i+2] = Math.round(b * 0.18 + 255 * 0.82)
        out[i+3] = 255
      }
    }
  }
  return new ImageData(out, width, height)
}

// --- Overlay ---

function setupOverlay(qImageData, palette) {
  overlayCanvas.width  = qImageData.width
  overlayCanvas.height = qImageData.height
  colorMasks   = buildColorMasks(qImageData, palette)
  labelRegions = computeRegions(qImageData, palette)
  const ctx = overlayCanvas.getContext('2d')
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  drawLabels(ctx, null)
}

function buildColorMasks(imageData, palette) {
  const { data, width, height } = imageData
  const masks = new Map()
  for (const { hex, rgb: [tr, tg, tb] } of palette) {
    const out = new Uint8ClampedArray(data.length)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === tr && data[i+1] === tg && data[i+2] === tb) {
        out[i] = 255; out[i+1] = 255; out[i+2] = 255; out[i+3] = 45
      } else {
        out[i+3] = 120
      }
    }
    masks.set(hex, new ImageData(out, width, height))
  }
  return masks
}

function computeRegions(imageData, palette) {
  const { data, width, height } = imageData
  const n = width * height
  const rgbs = palette.map(p => p.rgb)

  const pidx = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2]
    for (let j = 0; j < rgbs.length; j++) {
      if (rgbs[j][0] === r && rgbs[j][1] === g && rgbs[j][2] === b) { pidx[i] = j; break }
    }
  }

  // Threshold: regions larger than this get repeating labels
  const MIN_AREA = Math.max(150, Math.round(n / palette.length / 8))

  const visited    = new Uint8Array(n)
  const queue      = new Int32Array(n)
  const regions    = []
  const bestByColor = new Array(palette.length).fill(null) // largest region per color
  const labeledColors = new Set()

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    visited[start] = 1
    const ci = pidx[start]
    let head = 0, tail = 0
    queue[tail++] = start
    let sumX = 0, sumY = 0, area = 0

    while (head < tail) {
      const curr = queue[head++]
      const cx = curr % width, cy = (curr / width) | 0
      sumX += cx; sumY += cy; area++
      if (cx > 0        && !visited[curr-1]     && pidx[curr-1]     === ci) { visited[curr-1]     = 1; queue[tail++] = curr-1     }
      if (cx < width-1  && !visited[curr+1]     && pidx[curr+1]     === ci) { visited[curr+1]     = 1; queue[tail++] = curr+1     }
      if (cy > 0        && !visited[curr-width] && pidx[curr-width] === ci) { visited[curr-width] = 1; queue[tail++] = curr-width }
      if (cy < height-1 && !visited[curr+width] && pidx[curr+width] === ci) { visited[curr+width] = 1; queue[tail++] = curr+width }
    }

    const cx = Math.round(sumX / area)
    const cy = Math.round(sumY / area)

    if (area >= MIN_AREA) {
      regions.push({ hex: palette[ci].hex, cx, cy })
      labeledColors.add(ci)
    }

    if (!bestByColor[ci] || area > bestByColor[ci].area) {
      bestByColor[ci] = { area, cx, cy }
    }
  }

  // Guarantee every palette color has at least one label
  for (let ci = 0; ci < palette.length; ci++) {
    if (!labeledColors.has(ci) && bestByColor[ci]) {
      regions.push({ hex: palette[ci].hex, cx: bestByColor[ci].cx, cy: bestByColor[ci].cy })
    }
  }

  return regions
}

const LABEL_LINE_H = 15
const LABEL_PAD_X  = 10
const LABEL_PAD_Y  = 6

function drawLabels(ctx, hoveredHex) {
  if (!labelRegions) return
  ctx.save()
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  for (const { hex, cx, cy } of labelRegions) {
    const lines = (hexToPaintLabel.get(hex) || '').split('\n')
    const isHovered = hex === hoveredHex

    const maxW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0)
    const boxW = maxW + LABEL_PAD_X * 2
    const boxH = lines.length * LABEL_LINE_H + LABEL_PAD_Y * 2
    const x = Math.max(2, Math.min(overlayCanvas.width  - boxW - 2, cx - boxW / 2))
    const y = Math.max(2, Math.min(overlayCanvas.height - boxH - 2, cy - boxH / 2))

    ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, 4)
    else               ctx.rect(x, y, boxW, boxH)
    ctx.fill()

    ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.85)'
    lines.forEach((line, i) => {
      const lineY = y + LABEL_PAD_Y + LABEL_LINE_H * i + LABEL_LINE_H / 2
      ctx.fillText(line, x + LABEL_PAD_X, lineY)
    })
  }
  ctx.restore()
}

// --- Render ---

function consolidateMixes(aggregated, threshold) {
  if (threshold === 0) return aggregated
  const kept = []
  for (const entry of aggregated) {
    const entryLab = rgbToLab(entry.rgb)
    const match = kept.find(k => {
      const kLab = rgbToLab(k.rgb)
      return Math.hypot(entryLab[0]-kLab[0], entryLab[1]-kLab[1], entryLab[2]-kLab[2]) < threshold
    })
    if (match) {
      match.totalCoverage += entry.totalCoverage ?? entry.coverage
      entry.hexes.forEach(h => match.hexes.add(h))
    } else {
      kept.push({ ...entry, hexes: new Set(entry.hexes) })
    }
  }
  return kept
}

function aggregateByRecipe(matches, maxGroups = 16) {
  const groupMap = new Map()

  for (const m of matches) {
    const key = m.match.mix.map(p => `${p.ratio}:${p.name}`).join('|')
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        hex: m.hex, rgb: m.rgb, coverage: m.coverage,
        totalCoverage: m.coverage, match: m.match,
        hexes: new Set([m.hex])
      })
    } else {
      const g = groupMap.get(key)
      g.totalCoverage += m.coverage
      g.hexes.add(m.hex)
      if (m.coverage > g.coverage) { g.hex = m.hex; g.rgb = m.rgb; g.coverage = m.coverage }
    }
  }

  let groups = [...groupMap.values()].sort((a, b) => b.totalCoverage - a.totalCoverage)

  // Merge overflow groups into the nearest Lab match within the cap
  if (groups.length > maxGroups) {
    const keep = groups.slice(0, maxGroups)
    const keepLabs = keep.map(g => rgbToLab(g.rgb))
    for (const g of groups.slice(maxGroups)) {
      const gLab = rgbToLab(g.rgb)
      let bestIdx = 0, bestDist = Infinity
      for (let i = 0; i < keep.length; i++) {
        const d = Math.hypot(gLab[0]-keepLabs[i][0], gLab[1]-keepLabs[i][1], gLab[2]-keepLabs[i][2])
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      keep[bestIdx].totalCoverage += g.totalCoverage
      g.hexes.forEach(h => keep[bestIdx].hexes.add(h))
    }
    groups = keep
  }

  return groups
}

function renderShoppingList(matches) {
  // Sum each paint's weighted usage: coverage × ratio across all colors
  const totals = new Map()
  for (const { coverage, match } of matches) {
    for (const m of match.mix) {
      totals.set(m.name, (totals.get(m.name) || 0) + coverage * (m.ratio / 100))
    }
  }

  // Normalize to percentages of total paint volume
  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  const sorted = [...totals.entries()]
    .map(([name, val]) => ({ name, pct: Math.round((val / sum) * 100) }))
    .sort((a, b) => b.pct - a.pct)

  shoppingListEl.innerHTML = `
    <h4>Paint Shopping List</h4>
    <ul class="shop-list">
      ${sorted.map(({ name, pct }) => `
        <li>
          <span class="shop-name">${name}</span>
          <span class="shop-bar-wrap"><span class="shop-bar" style="width:${pct}%"></span></span>
          <span class="shop-pct">${pct}%</span>
        </li>`).join('')}
    </ul>`
}

function mixLines(mix) {
  return [...mix].sort((a, b) => b.ratio - a.ratio)
    .map(m => {
      const rgb = PAINT_RGB.get(m.name)
      const swatch = rgb ? `<span class="mix-paint-swatch" style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></span>` : ''
      return `<div class="mix-line"><span class="mix-ratio">${String(m.ratio).padStart(2,'0')}</span>${swatch}<span class="mix-name">${m.name}</span></div>`
    })
    .join('')
}

function buildAccordionGroup({ name, paintRgb, variants }) {
  const [r, g, b] = paintRgb
  const variantHtml = variants.map(({ hex, match, hexes }) => `
    <div class="swatch variant" data-hexes="${[...hexes].join(',')}">
      <div class="swatch-color" style="background:${hex}"></div>
      <div class="swatch-recipe">${mixLines(match.mix)}</div>
    </div>`).join('')
  return `
    <div class="paint-group collapsed">
      <div class="group-header">
        <div class="group-swatch" style="background:rgb(${r},${g},${b})"></div>
        <span class="group-name">${name}</span>
        <span class="group-count">${variants.length}</span>
        <svg class="group-arrow" width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      </div>
      ${variantHtml}
    </div>`
}

function groupEntries(entries, useSecondary) {
  const map = new Map()
  for (const entry of entries) {
    const sorted = [...entry.match.mix].sort((a, b) => b.ratio - a.ratio)
    const key = (useSecondary && sorted.length > 1) ? sorted[1].name : sorted[0].name
    if (!map.has(key)) map.set(key, {
      name: key,
      paintRgb: PAINTS.find(p => p.name === key)?.rgb ?? entry.rgb,
      totalCoverage: 0, variants: []
    })
    const g = map.get(key)
    g.totalCoverage += entry.totalCoverage ?? entry.coverage
    g.variants.push(entry)
  }
  return [...map.values()]
    .sort((a, b) => b.totalCoverage - a.totalCoverage)
    .map(g => ({ ...g, variants: g.variants.sort((a, b) => rgbToLab(b.rgb)[0] - rgbToLab(a.rgb)[0]) })) // light → dark
}

function renderSwatches(aggregated) {
  const dark = [], light = [], pure = []
  for (const entry of aggregated) {
    const dom = [...entry.match.mix].sort((a, b) => b.ratio - a.ratio)[0].name
    if (dom === 'Ivory Black')    dark.push(entry)
    else if (dom === 'Titanium White') light.push(entry)
    else                          pure.push(entry)
  }

  const cols = [
    { label: 'Dark Tints',   entries: dark,  secondary: true  },
    { label: 'Light Tints',  entries: light, secondary: true  },
    { label: 'Pigments',     entries: pure,  secondary: false },
  ]

  swatchesEl.innerHTML = cols.map(({ label, entries, secondary }) =>
    `<div class="palette-col">
      <div class="palette-col-header">${label}</div>
      ${groupEntries(entries, secondary).map(buildAccordionGroup).join('')}
    </div>`
  ).join('')
}

// --- UI helpers ---

// Tooltip
const colorTooltip = document.getElementById('colorTooltip')

function showTooltip(cx, cy, hex, match) {
  colorTooltip.innerHTML =
    `<div class="tooltip-header">
      <div class="tooltip-swatch" style="background:${hex}"></div>
      <span class="tooltip-hex">${hex.toUpperCase()}</span>
    </div>` + mixLines(match.mix)
  colorTooltip.classList.add('visible')
  positionTooltip(cx, cy)
}

function positionTooltip(cx, cy) {
  const offset = 14
  const tw = colorTooltip.offsetWidth
  const th = colorTooltip.offsetHeight
  let left = cx + offset
  let top  = cy + offset
  if (left + tw > window.innerWidth  - 8) left = cx - tw - offset
  if (top  + th > window.innerHeight - 8) top  = cy - th - offset
  colorTooltip.style.left = left + 'px'
  colorTooltip.style.top  = top  + 'px'
}

function hideTooltip() {
  colorTooltip.classList.remove('visible')
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg
  statusEl.hidden = false
  statusEl.className = 'status' + (isError ? ' status-error' : '')
}

function showResults() {
  statusEl.hidden = true
  inputSection.hidden = true
  resultsEl.hidden = false
}

function reset() {
  cachedImageData = cachedQuantizedData = colorMasks = labelRegions = null
  outlineMode = false
  outlineBtn.classList.remove('active')
  hexToPaintLabel = new Map()
  hexToMatch = new Map()
  hideTooltip()
  resultsEl.hidden = true
  inputSection.hidden = false
  fileInput.value = urlInput.value = ''
  swatchesEl.innerHTML = shoppingListEl.innerHTML = ''
}

function scaleDims(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h }
  const ratio = Math.min(max / w, max / h)
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

function pct(v) { return (v * 100).toFixed(1) + '%' }
