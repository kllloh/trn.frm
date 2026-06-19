// ── Value noise ──────────────────────────────────────────
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix,        fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return (
    hash(ix,     iy)     * (1 - ux) * (1 - uy) +
    hash(ix + 1, iy)     * ux       * (1 - uy) +
    hash(ix,     iy + 1) * (1 - ux) * uy       +
    hash(ix + 1, iy + 1) * ux       * uy
  )
}

// ── Displacement functions ───────────────────────────────
function waveDisplace(x, y, amplitude, frequency) {
  return {
    dx: Math.sin(y * frequency * 0.02) * amplitude,
    dy: Math.sin(x * frequency * 0.02) * amplitude * 0.4,
  }
}

function noiseDisplace(x, y, amplitude, frequency) {
  const f = frequency * 0.004
  return {
    dx: (smoothNoise(x * f,       y * f)       - 0.5) * 2 * amplitude,
    dy: (smoothNoise(x * f + 5.2, y * f + 1.3) - 0.5) * 2 * amplitude,
  }
}

function rippleDisplace(x, y, cx, cy, amplitude, frequency) {
  const dist  = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
  const angle = Math.atan2(y - cy, x - cx)
  const r     = Math.sin(dist * frequency * 0.012) * amplitude
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r }
}

// ── Tool ─────────────────────────────────────────────────
const distort = {
  id: 'distort',
  label: 'distort',
  desc: 'warp pixels with noise-based displacement',

  defaultParams: {
    type:      'noise',
    amplitude: 20,
    frequency: 5,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">type</p>
        <div class="option-group" data-param="type">
          ${['noise', 'wave', 'ripple'].map(t => `
            <button class="opt${params.type === t ? ' active' : ''}"
                    data-value="${t}">${t}</button>
          `).join('')}
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-amplitude">
          amplitude <output id="out-amplitude">${params.amplitude}px</output>
        </label>
        <input id="ctrl-amplitude" type="range"
               min="1" max="80" step="1"
               value="${params.amplitude}"
               data-param="amplitude" data-output="out-amplitude" data-suffix="px">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-frequency">
          frequency <output id="out-frequency">${params.frequency}</output>
        </label>
        <input id="ctrl-frequency" type="range"
               min="1" max="20" step="1"
               value="${params.frequency}"
               data-param="frequency" data-output="out-frequency">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight

    const tmp    = new OffscreenCanvas(iw, ih)
    const tmpCtx = tmp.getContext('2d')
    tmpCtx.drawImage(sourceImage, 0, 0)
    const { data } = tmpCtx.getImageData(0, 0, iw, ih)

    const { type, amplitude, frequency } = params
    const cx = iw / 2
    const cy = ih / 2

    const out = new Uint8ClampedArray(iw * ih * 4)

    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        let dx = 0, dy = 0

        if (type === 'wave') {
          ;({ dx, dy } = waveDisplace(x, y, amplitude, frequency))
        } else if (type === 'noise') {
          ;({ dx, dy } = noiseDisplace(x, y, amplitude, frequency))
        } else {
          ;({ dx, dy } = rippleDisplace(x, y, cx, cy, amplitude, frequency))
        }

        const sx = Math.max(0, Math.min(iw - 1, Math.round(x + dx)))
        const sy = Math.max(0, Math.min(ih - 1, Math.round(y + dy)))
        const si = (sy * iw + sx) * 4
        const di = (y  * iw + x)  * 4
        out[di]     = data[si]
        out[di + 1] = data[si + 1]
        out[di + 2] = data[si + 2]
        out[di + 3] = 255
      }
    }

    outputCanvas.width  = iw
    outputCanvas.height = ih
    outputCanvas.getContext('2d').putImageData(new ImageData(out, iw, ih), 0, 0)
  },
}

export default distort
