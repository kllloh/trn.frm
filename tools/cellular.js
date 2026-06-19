import { readImage, writeImage, lum } from './_helpers.js'

const cellular = {
  id: 'cellular',
  label: 'cellular',
  desc: 'cellular automata threshold texture',

  defaultParams: { threshold: 128, iterations: 3, scale: 3, colour: true },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-threshold">threshold <output id="out-threshold">${params.threshold}</output></label>
        <input id="ctrl-threshold" type="range" min="0" max="255" step="1" value="${params.threshold}" data-param="threshold" data-output="out-threshold">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-iterations">iterations <output id="out-iterations">${params.iterations}</output></label>
        <input id="ctrl-iterations" type="range" min="0" max="8" step="1" value="${params.iterations}" data-param="iterations" data-output="out-iterations">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-scale">scale <output id="out-scale">${params.scale}px</output></label>
        <input id="ctrl-scale" type="range" min="1" max="10" step="1" value="${params.scale}" data-param="scale" data-output="out-scale" data-suffix="px">
      </div>
      <div class="control-group"><label class="toggle"><input type="checkbox" data-param="colour" ${params.colour ? 'checked' : ''}><span class="toggle-track"></span>colour</label></div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const cw = Math.max(1, Math.floor(w / params.scale))
    const ch = Math.max(1, Math.floor(h / params.scale))
    let grid = new Uint8Array(cw * ch)
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = Math.min(w - 1, x * params.scale)
        const sy = Math.min(h - 1, y * params.scale)
        grid[y * cw + x] = lum(data, (sy * w + sx) * 4) < params.threshold ? 1 : 0
      }
    }
    for (let it = 0; it < params.iterations; it++) {
      const next = new Uint8Array(grid)
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          let n = 0
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
            if (!xx && !yy) continue
            const sx = Math.max(0, Math.min(cw - 1, x + xx))
            const sy = Math.max(0, Math.min(ch - 1, y + yy))
            n += grid[sy * cw + sx]
          }
          next[y * cw + x] = n >= 5 ? 1 : n <= 2 ? 0 : grid[y * cw + x]
        }
      }
      grid = next
    }
    const out = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = Math.min(cw - 1, Math.floor(x / params.scale))
        const gy = Math.min(ch - 1, Math.floor(y / params.scale))
        const g = grid[gy * cw + gx]
        const i = (y * w + x) * 4
        if (params.colour && g) {
          out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2]
        } else {
          out[i] = out[i + 1] = out[i + 2] = g ? 0 : 255
        }
        out[i + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default cellular
