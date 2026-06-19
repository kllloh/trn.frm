import { readImage, lum } from './_helpers.js'

const patterns = {
  id: 'patterns',
  label: 'patterns',
  desc: 'hatch and tile patterns driven by luminance',

  defaultParams: { cell: 12, mode: 'hatch', weight: 1.2 },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          ${['hatch', 'cross', 'tiles'].map(v => `<button class="opt${params.mode === v ? ' active' : ''}" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-cell">cell <output id="out-cell">${params.cell}px</output></label>
        <input id="ctrl-cell" type="range" min="5" max="36" step="1" value="${params.cell}" data-param="cell" data-output="out-cell" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-weight">weight <output id="out-weight">${params.weight}</output></label>
        <input id="ctrl-weight" type="range" min="0.5" max="4" step="0.1" value="${params.weight}" data-param="weight" data-output="out-weight">
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
    ctx.strokeStyle = '#000'
    ctx.lineWidth = params.weight
    const c = params.cell
    for (let y = 0; y < h; y += c) {
      for (let x = 0; x < w; x += c) {
        const sx = Math.min(w - 1, x + c / 2 | 0)
        const sy = Math.min(h - 1, y + c / 2 | 0)
        const d = 1 - lum(data, (sy * w + sx) * 4) / 255
        ctx.beginPath()
        if (params.mode === 'tiles') {
          const s = c * (0.15 + d * 0.75)
          ctx.rect(x + (c - s) / 2, y + (c - s) / 2, s, s)
        } else {
          if (d > 0.12) { ctx.moveTo(x, y + c); ctx.lineTo(x + c, y) }
          if (params.mode === 'cross' && d > 0.42) { ctx.moveTo(x, y); ctx.lineTo(x + c, y + c) }
          if (d > 0.72) { ctx.moveTo(x, y + c / 2); ctx.lineTo(x + c, y + c / 2) }
        }
        ctx.stroke()
      }
    }
  },
}

export default patterns
