import { readImage, lum, hash } from './_helpers.js'

const stippling = {
  id: 'stippling',
  label: 'stippling',
  desc: 'density-based stochastic stipple marks',

  defaultParams: { spacing: 6, density: 85, radius: 1.4, seed: 3 },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-spacing">spacing <output id="out-spacing">${params.spacing}px</output></label>
        <input id="ctrl-spacing" type="range" min="3" max="20" step="1" value="${params.spacing}" data-param="spacing" data-output="out-spacing" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-density">density <output id="out-density">${params.density}%</output></label>
        <input id="ctrl-density" type="range" min="10" max="160" step="1" value="${params.density}" data-param="density" data-output="out-density" data-suffix="%">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-radius">radius <output id="out-radius">${params.radius}</output></label>
        <input id="ctrl-radius" type="range" min="0.5" max="4" step="0.1" value="${params.radius}" data-param="radius" data-output="out-radius">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-seed">seed <output id="out-seed">${params.seed}</output></label>
        <input id="ctrl-seed" type="range" min="0" max="20" step="1" value="${params.seed}" data-param="seed" data-output="out-seed">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    outputCanvas.width = w
    outputCanvas.height = h
    const ctx = outputCanvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#000'
    for (let y = 0; y < h; y += params.spacing) {
      for (let x = 0; x < w; x += params.spacing) {
        const jx = (hash(x, y, params.seed) - 0.5) * params.spacing
        const jy = (hash(x + 9, y - 4, params.seed) - 0.5) * params.spacing
        const sx = Math.max(0, Math.min(w - 1, Math.round(x + jx)))
        const sy = Math.max(0, Math.min(h - 1, Math.round(y + jy)))
        const dark = 1 - lum(data, (sy * w + sx) * 4) / 255
        if (hash(x - 2, y + 7, params.seed) < dark * params.density / 100) {
          ctx.beginPath()
          ctx.arc(sx, sy, params.radius * (0.55 + dark), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  },
}

export default stippling
