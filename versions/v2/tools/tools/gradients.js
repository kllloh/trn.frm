// ── Presets ──────────────────────────────────────────────
const PRESETS = {
  spectrum:   { shadow: '#0d1b6e', mid: '#ffd700', highlight: '#ff2200' },
  sunset:     { shadow: '#1a0533', mid: '#ff6b35', highlight: '#ffecd2' },
  ocean:      { shadow: '#001a33', mid: '#0077b6', highlight: '#caf0f8' },
  heat:       { shadow: '#000000', mid: '#ff4500', highlight: '#ffff00' },
  forest:     { shadow: '#0d2b1a', mid: '#4a9e3f', highlight: '#e8f5c0' },
  lavender:   { shadow: '#1a0533', mid: '#9b5de5', highlight: '#f0e6ff' },
  mono:       { shadow: '#000000', mid: '#808080', highlight: '#ffffff' },
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerp(a, b, t) { return a + (b - a) * t }

// 3-stop gradient map: shadow → mid → highlight
function mapLuminance(lum, sr, sg, sb, mr, mg, mb, hr, hg, hb) {
  const t = lum / 255
  if (t < 0.5) {
    const u = t * 2
    return [lerp(sr, mr, u), lerp(sg, mg, u), lerp(sb, mb, u)]
  }
  const u = (t - 0.5) * 2
  return [lerp(mr, hr, u), lerp(mg, hg, u), lerp(mb, hb, u)]
}

function blendPixel(mode, sr, sg, sb, dr, dg, db, opacity) {
  let br, bg, bb
  switch (mode) {
    case 'multiply':
      br = (sr * dr) / 255
      bg = (sg * dg) / 255
      bb = (sb * db) / 255
      break
    case 'screen':
      br = 255 - ((255 - sr) * (255 - dr)) / 255
      bg = 255 - ((255 - sg) * (255 - dg)) / 255
      bb = 255 - ((255 - sb) * (255 - db)) / 255
      break
    case 'overlay':
      br = dr < 128 ? (2 * sr * dr) / 255 : 255 - (2 * (255 - sr) * (255 - dr)) / 255
      bg = dg < 128 ? (2 * sg * dg) / 255 : 255 - (2 * (255 - sg) * (255 - dg)) / 255
      bb = db < 128 ? (2 * sb * db) / 255 : 255 - (2 * (255 - sb) * (255 - db)) / 255
      break
    default: // replace
      br = sr; bg = sg; bb = sb
  }
  return [
    lerp(dr, br, opacity),
    lerp(dg, bg, opacity),
    lerp(db, bb, opacity),
  ]
}

// ── Tool ─────────────────────────────────────────────────
const gradients = {
  id: 'gradients',
  label: 'gradients',
  desc: 'map image luminance to a 3-stop colour gradient',

  defaultParams: {
    preset:    'spectrum',
    shadow:    '#0d1b6e',
    mid:       '#ffd700',
    highlight: '#ff2200',
    blend:     'replace',
    opacity:   100,
  },

  onPresetSelect(param, value, params) {
    if (param === 'preset' && PRESETS[value]) {
      params.shadow    = PRESETS[value].shadow
      params.mid       = PRESETS[value].mid
      params.highlight = PRESETS[value].highlight
    }
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">preset</p>
        <div class="option-group" data-param="preset">
          ${Object.keys(PRESETS).map(p => `
            <button class="opt${params.preset === p ? ' active' : ''}"
                    data-value="${p}">${p}</button>
          `).join('')}
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-shadow">shadow</label>
        <input id="ctrl-shadow" type="color"
               value="${params.shadow}" data-param="shadow">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-mid">midtone</label>
        <input id="ctrl-mid" type="color"
               value="${params.mid}" data-param="mid">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-highlight">highlight</label>
        <input id="ctrl-highlight" type="color"
               value="${params.highlight}" data-param="highlight">
      </div>

      <div class="control-group">
        <p class="control-label">blend</p>
        <div class="option-group" data-param="blend">
          ${['replace', 'multiply', 'screen', 'overlay'].map(b => `
            <button class="opt${params.blend === b ? ' active' : ''}"
                    data-value="${b}">${b}</button>
          `).join('')}
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-opacity">
          opacity <output id="out-opacity">${params.opacity}%</output>
        </label>
        <input id="ctrl-opacity" type="range"
               min="0" max="100" step="1"
               value="${params.opacity}"
               data-param="opacity" data-output="out-opacity" data-suffix="%">
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

    const [sr, sg, sb] = hexToRgb(params.shadow)
    const [mr, mg, mb] = hexToRgb(params.mid)
    const [hr, hg, hb] = hexToRgb(params.highlight)
    const opacity = params.opacity / 100

    const out = new Uint8ClampedArray(iw * ih * 4)

    for (let i = 0; i < iw * ih; i++) {
      const dr = data[i * 4]
      const dg = data[i * 4 + 1]
      const db = data[i * 4 + 2]
      const lum = 0.299 * dr + 0.587 * dg + 0.114 * db
      const [gr, gg, gb] = mapLuminance(lum, sr, sg, sb, mr, mg, mb, hr, hg, hb)
      const [or, og, ob] = blendPixel(params.blend, gr, gg, gb, dr, dg, db, opacity)
      out[i * 4]     = or
      out[i * 4 + 1] = og
      out[i * 4 + 2] = ob
      out[i * 4 + 3] = 255
    }

    outputCanvas.width  = iw
    outputCanvas.height = ih
    outputCanvas.getContext('2d').putImageData(new ImageData(out, iw, ih), 0, 0)
  },
}

export default gradients
