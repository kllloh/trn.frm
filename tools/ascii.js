import { readImage, lum } from './_helpers.js'

const ascii = {
  id: 'ascii',
  label: 'ascii',
  desc: 'render image as text glyph blocks',

  defaultParams: { cell: 10, charset: 'dense', invert: false, colour: true },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">charset</p>
        <div class="option-group" data-param="charset">
          ${['dense', 'simple', 'binary'].map(v => `<button class="opt${params.charset === v ? ' active' : ''}" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-cell">cell <output id="out-cell">${params.cell}px</output></label>
        <input id="ctrl-cell" type="range" min="5" max="28" step="1" value="${params.cell}" data-param="cell" data-output="out-cell" data-suffix="px">
      </div>
      <div class="control-group"><label class="toggle"><input type="checkbox" data-param="colour" ${params.colour ? 'checked' : ''}><span class="toggle-track"></span>colour</label></div>
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
    const chars = {
      dense: ' .:-=+*#%@',
      simple: ' .:*#',
      binary: ' #',
    }[params.charset]
    ctx.font = `${params.cell}px "JetBrains Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let y = params.cell / 2; y < h; y += params.cell) {
      for (let x = params.cell / 2; x < w; x += params.cell) {
        const sx = Math.min(w - 1, Math.round(x))
        const sy = Math.min(h - 1, Math.round(y))
        const i = (sy * w + sx) * 4
        let t = lum(data, i) / 255
        if (params.invert) t = 1 - t
        const ch = chars[Math.max(0, Math.min(chars.length - 1, Math.round((1 - t) * (chars.length - 1))))]
        ctx.fillStyle = params.colour ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : (params.invert ? '#fff' : '#000')
        ctx.fillText(ch, x, y)
      }
    }
  },
}

export default ascii
