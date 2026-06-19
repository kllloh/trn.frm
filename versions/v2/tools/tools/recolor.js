const PRESETS = {
  duotone:   { shadow: '#0d0d0d', highlight: '#f0f0f0' },
  cyanotype: { shadow: '#1a2744', highlight: '#d4e5f5' },
  sepia:     { shadow: '#2c1a0e', highlight: '#f5e6c8' },
  riso:      { shadow: '#1a1a6e', highlight: '#f56042' },
  forest:    { shadow: '#0d2b1a', highlight: '#e8f5c0' },
  cyber:     { shadow: '#000000', highlight: '#00ff41' },
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerp(a, b, t) { return a + (b - a) * t }

const recolor = {
  id: 'recolor',
  label: 'recolor',
  desc: 'remap luminance to a two-color gradient',

  defaultParams: {
    preset:    'duotone',
    shadow:    '#0d0d0d',
    highlight: '#f0f0f0',
  },

  onPresetSelect(param, value, params) {
    if (param === 'preset' && PRESETS[value]) {
      params.shadow    = PRESETS[value].shadow
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
        <label class="control-label" for="ctrl-highlight">highlight</label>
        <input id="ctrl-highlight" type="color"
               value="${params.highlight}" data-param="highlight">
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
    const [hr, hg, hb] = hexToRgb(params.highlight)

    const out = new Uint8ClampedArray(iw * ih * 4)
    for (let i = 0; i < iw * ih; i++) {
      const t = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255
      out[i * 4]     = lerp(sr, hr, t)
      out[i * 4 + 1] = lerp(sg, hg, t)
      out[i * 4 + 2] = lerp(sb, hb, t)
      out[i * 4 + 3] = 255
    }

    outputCanvas.width  = iw
    outputCanvas.height = ih
    outputCanvas.getContext('2d').putImageData(new ImageData(out, iw, ih), 0, 0)
  },
}

export default recolor
