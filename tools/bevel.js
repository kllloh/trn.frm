import { readImage, writeImage, lum, clamp } from './_helpers.js'

const bevel = {
  id: 'bevel',
  label: 'bevel',
  desc: 'emboss height from luminance',

  defaultParams: { depth: 3, contrast: 1.5, blend: 55 },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-depth">depth <output id="out-depth">${params.depth}px</output></label>
        <input id="ctrl-depth" type="range" min="1" max="12" step="1" value="${params.depth}" data-param="depth" data-output="out-depth" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-contrast">contrast <output id="out-contrast">${params.contrast}</output></label>
        <input id="ctrl-contrast" type="range" min="0.5" max="4" step="0.1" value="${params.contrast}" data-param="contrast" data-output="out-contrast">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-blend">blend <output id="out-blend">${params.blend}%</output></label>
        <input id="ctrl-blend" type="range" min="0" max="100" step="1" value="${params.blend}" data-param="blend" data-output="out-blend" data-suffix="%">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const out = new Uint8ClampedArray(w * h * 4)
    const d = params.depth
    const b = params.blend / 100
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const x1 = Math.max(0, x - d), y1 = Math.max(0, y - d)
        const x2 = Math.min(w - 1, x + d), y2 = Math.min(h - 1, y + d)
        const a = lum(data, (y1 * w + x1) * 4)
        const c = lum(data, (y2 * w + x2) * 4)
        const shade = clamp(128 + (a - c) * params.contrast)
        out[i]     = clamp(data[i]     * (1 - b) + shade * b)
        out[i + 1] = clamp(data[i + 1] * (1 - b) + shade * b)
        out[i + 2] = clamp(data[i + 2] * (1 - b) + shade * b)
        out[i + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default bevel
