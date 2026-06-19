import { readImage, writeImage, lum, clamp } from './_helpers.js'

const KX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
const KY = [-1,-2,-1,  0, 0, 0,  1, 2, 1]

const edge = {
  id: 'edge',
  label: 'edge',
  desc: 'sobel edge detection with optional source blend',

  defaultParams: { mode: 'mono', strength: 160, threshold: 28, invert: false },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          ${['mono', 'source'].map(v => `<button class="opt${params.mode === v ? ' active' : ''}" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-strength">strength <output id="out-strength">${params.strength}</output></label>
        <input id="ctrl-strength" type="range" min="20" max="255" step="1" value="${params.strength}" data-param="strength" data-output="out-strength">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-threshold">threshold <output id="out-threshold">${params.threshold}</output></label>
        <input id="ctrl-threshold" type="range" min="1" max="120" step="1" value="${params.threshold}" data-param="threshold" data-output="out-threshold">
      </div>
      <div class="control-group"><label class="toggle"><input type="checkbox" data-param="invert" ${params.invert ? 'checked' : ''}><span class="toggle-track"></span>invert</label></div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const gray = new Float32Array(w * h)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = lum(data, i)
    const out = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let gx = 0, gy = 0, k = 0
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++, k++) {
            const sx = Math.max(0, Math.min(w - 1, x + xx))
            const sy = Math.max(0, Math.min(h - 1, y + yy))
            const v = gray[sy * w + sx]
            gx += v * KX[k]; gy += v * KY[k]
          }
        }
        let e = Math.sqrt(gx * gx + gy * gy) / Math.max(1, params.threshold)
        e = clamp(e * params.strength)
        if (params.invert) e = 255 - e
        const di = (y * w + x) * 4
        if (params.mode === 'source') {
          out[di] = clamp(data[di] * e / 255)
          out[di + 1] = clamp(data[di + 1] * e / 255)
          out[di + 2] = clamp(data[di + 2] * e / 255)
        } else {
          out[di] = out[di + 1] = out[di + 2] = e
        }
        out[di + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default edge
