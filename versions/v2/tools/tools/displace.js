import { readImage, writeImage, sample, lum, hash } from './_helpers.js'

const displace = {
  id: 'displace',
  label: 'displace',
  desc: 'luminance-driven directional pixel offset',

  defaultParams: { amount: 28, angle: 0, source: 'luminance' },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">source</p>
        <div class="option-group" data-param="source">
          ${['luminance', 'noise', 'red'].map(v => `<button class="opt${params.source === v ? ' active' : ''}" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-amount">amount <output id="out-amount">${params.amount}px</output></label>
        <input id="ctrl-amount" type="range" min="-80" max="80" step="1" value="${params.amount}" data-param="amount" data-output="out-amount" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-angle">angle <output id="out-angle">${params.angle}°</output></label>
        <input id="ctrl-angle" type="range" min="0" max="360" step="1" value="${params.angle}" data-param="angle" data-output="out-angle" data-suffix="°">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const out = new Uint8ClampedArray(w * h * 4)
    const a = params.angle * Math.PI / 180
    const vx = Math.cos(a), vy = Math.sin(a)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        let m = params.source === 'red' ? data[i] / 255 : lum(data, i) / 255
        if (params.source === 'noise') m = hash(x * 0.06, y * 0.06, 4)
        const off = (m - 0.5) * params.amount * 2
        const si = sample(data, w, h, x + vx * off, y + vy * off)
        out[i] = data[si]; out[i + 1] = data[si + 1]; out[i + 2] = data[si + 2]; out[i + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default displace
