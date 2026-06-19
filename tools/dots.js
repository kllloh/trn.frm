import { readImage, lum } from './_helpers.js'

const dots = {
  id: 'dots',
  label: 'dots',
  desc: 'halftone dot field',

  defaultParams: { size: 12, scale: 90, mode: 'colour', invert: false },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          ${['colour', 'mono'].map(v => `<button class="opt${params.mode === v ? ' active' : ''}" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-size">grid <output id="out-size">${params.size}px</output></label>
        <input id="ctrl-size" type="range" min="4" max="40" step="1" value="${params.size}" data-param="size" data-output="out-size" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-scale">scale <output id="out-dot-scale">${params.scale}%</output></label>
        <input id="ctrl-scale" type="range" min="20" max="140" step="1" value="${params.scale}" data-param="scale" data-output="out-dot-scale" data-suffix="%">
      </div>
      <div class="control-group"><label class="toggle"><input type="checkbox" data-param="invert" ${params.invert ? 'checked' : ''}><span class="toggle-track"></span>invert</label></div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    outputCanvas.width = w
    outputCanvas.height = h
    const ctx = outputCanvas.getContext('2d')
    ctx.fillStyle = params.invert ? '#000' : '#fff'
    ctx.fillRect(0, 0, w, h)
    const step = params.size
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const sx = Math.min(w - 1, Math.max(0, Math.round(x)))
        const sy = Math.min(h - 1, Math.max(0, Math.round(y)))
        const i = (sy * w + sx) * 4
        const l = lum(data, i) / 255
        const t = params.invert ? l : 1 - l
        const r = Math.max(0, t) * step * 0.5 * params.scale / 100
        if (r < 0.2) continue
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        if (params.mode === 'colour') ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`
        else ctx.fillStyle = params.invert ? '#fff' : '#000'
        ctx.fill()
      }
    }
  },
}

export default dots
