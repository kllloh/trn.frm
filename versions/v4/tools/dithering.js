// ── Bayer matrices ──────────────────────────────────────
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

const BAYER8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

// ── Quantise a value to nearest level step ───────────────
function quantise(v, levels) {
  const step = 255 / (levels - 1)
  return Math.round(v / step) * step
}

// ── Channel extraction from RGBA ImageData ───────────────
function toGray(data, w, h) {
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return gray
}

function toChannels(data, w, h) {
  const r = new Float32Array(w * h)
  const g = new Float32Array(w * h)
  const b = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    r[i] = data[i * 4]
    g[i] = data[i * 4 + 1]
    b[i] = data[i * 4 + 2]
  }
  return [r, g, b]
}

// ── Algorithms ───────────────────────────────────────────
function threshold(gray, w, h, levels) {
  const out = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = quantise(gray[i], levels)
  return out
}

function floydSteinberg(gray, w, h, levels) {
  const buf = new Float32Array(gray)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const old = buf[i]
      const q   = quantise(Math.max(0, Math.min(255, old)), levels)
      const err = old - q
      buf[i] = q
      if (x + 1 < w)         buf[i + 1]     += err * 7 / 16
      if (y + 1 < h) {
        if (x > 0)           buf[i + w - 1] += err * 3 / 16
                             buf[i + w]     += err * 5 / 16
        if (x + 1 < w)      buf[i + w + 1] += err * 1 / 16
      }
    }
  }
  return buf
}

function atkinson(gray, w, h, levels) {
  const buf = new Float32Array(gray)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i   = y * w + x
      const old = buf[i]
      const q   = quantise(Math.max(0, Math.min(255, old)), levels)
      const err = (old - q) / 8
      buf[i] = q
      if (x + 1 < w)         buf[i + 1]         += err
      if (x + 2 < w)         buf[i + 2]         += err
      if (y + 1 < h) {
        if (x > 0)           buf[i + w - 1]     += err
                             buf[i + w]         += err
        if (x + 1 < w)      buf[i + w + 1]     += err
      }
      if (y + 2 < h)         buf[i + 2 * w]     += err
    }
  }
  return buf
}

function orderedBayer(gray, w, h, levels, matrix) {
  const n    = matrix.length
  const size = n * n
  const step = 255 / (levels - 1)
  const out  = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i       = y * w + x
      const t       = (matrix[y % n][x % n] / size - 0.5) * step
      const adjusted = gray[i] + t
      out[i] = quantise(Math.max(0, Math.min(255, adjusted)), levels)
    }
  }
  return out
}

// ── Apply algorithm to a single channel ──────────────────
function applyAlgo(channel, w, h, levels, algorithm) {
  switch (algorithm) {
    case 'atkinson':  return atkinson(channel, w, h, levels)
    case 'bayer-4':   return orderedBayer(channel, w, h, levels, BAYER4)
    case 'bayer-8':   return orderedBayer(channel, w, h, levels, BAYER8)
    case 'threshold': return threshold(channel, w, h, levels)
    default:          return floydSteinberg(channel, w, h, levels)
  }
}

// ── Build output ImageData (mono or colour) ──────────────
function buildImageData(result, w, h, invert) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let v = Math.max(0, Math.min(255, result[i]))
    if (invert) v = 255 - v
    data[i * 4]     = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return new ImageData(data, w, h)
}

function buildColorImageData(r, g, b, w, h, invert) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let rv = Math.max(0, Math.min(255, r[i]))
    let gv = Math.max(0, Math.min(255, g[i]))
    let bv = Math.max(0, Math.min(255, b[i]))
    if (invert) { rv = 255 - rv; gv = 255 - gv; bv = 255 - bv }
    data[i * 4]     = rv
    data[i * 4 + 1] = gv
    data[i * 4 + 2] = bv
    data[i * 4 + 3] = 255
  }
  return new ImageData(data, w, h)
}

// ── Tool definition ──────────────────────────────────────
const dithering = {
  id: 'dithering',
  label: 'dithering',
  desc: 'reduce colors with ordered or error-diffusion dithering',

  defaultParams: {
    mode:      'colour',
    algorithm: 'floyd-steinberg',
    levels:    2,
    scale:     1,
    invert:    false,
  },

  renderControls(params) {
    const algos = [
      { value: 'floyd-steinberg', label: 'floyd-steinberg' },
      { value: 'atkinson',        label: 'atkinson' },
      { value: 'bayer-4',         label: 'bayer 4×4' },
      { value: 'bayer-8',         label: 'bayer 8×8' },
      { value: 'threshold',       label: 'threshold' },
    ]

    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          <button class="opt${params.mode === 'mono'   ? ' active' : ''}" data-value="mono">mono</button>
          <button class="opt${params.mode === 'colour' ? ' active' : ''}" data-value="colour">colour</button>
        </div>
      </div>

      <div class="control-group">
        <p class="control-label">algorithm</p>
        <div class="option-group" data-param="algorithm">
          ${algos.map(a => `
            <button class="opt${params.algorithm === a.value ? ' active' : ''}"
                    data-value="${a.value}">${a.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-levels">
          levels <output id="out-levels">${params.levels}</output>
        </label>
        <input id="ctrl-levels" type="range"
               min="2" max="16" step="1"
               value="${params.levels}"
               data-param="levels" data-output="out-levels">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-scale">
          pixel scale <output id="out-scale">${params.scale}×</output>
        </label>
        <input id="ctrl-scale" type="range"
               min="1" max="12" step="1"
               value="${params.scale}"
               data-param="scale" data-output="out-scale" data-suffix="×">
      </div>

      <div class="control-group">
        <label class="toggle">
          <input type="checkbox" data-param="invert" ${params.invert ? 'checked' : ''}>
          <span class="toggle-track"></span>
          invert
        </label>
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { mode, algorithm, levels, scale, invert } = params
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight

    const w = Math.max(1, Math.floor(iw / scale))
    const h = Math.max(1, Math.floor(ih / scale))

    const tmp    = new OffscreenCanvas(w, h)
    const tmpCtx = tmp.getContext('2d')
    tmpCtx.drawImage(sourceImage, 0, 0, w, h)
    const { data } = tmpCtx.getImageData(0, 0, w, h)

    let outData
    if (mode === 'colour') {
      const [r, g, b] = toChannels(data, w, h)
      outData = buildColorImageData(
        applyAlgo(r, w, h, levels, algorithm),
        applyAlgo(g, w, h, levels, algorithm),
        applyAlgo(b, w, h, levels, algorithm),
        w, h, invert,
      )
    } else {
      outData = buildImageData(applyAlgo(toGray(data, w, h), w, h, levels, algorithm), w, h, invert)
    }

    // stamp result to a small offscreen canvas, scale up to output
    const stamp    = new OffscreenCanvas(w, h)
    const stampCtx = stamp.getContext('2d')
    stampCtx.putImageData(outData, 0, 0)

    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(stamp, 0, 0, iw, ih)
  },
}

export default dithering
