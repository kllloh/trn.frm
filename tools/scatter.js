import { readImage, writeImage, sample, hash } from './_helpers.js'

const scatter = {
  id: 'scatter',
  label: 'scatter',
  desc: 'scatter pixels into granular offsets',

  defaultParams: { amount: 16, grain: 6, seed: 2 },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-amount">amount <output id="out-amount">${params.amount}px</output></label>
        <input id="ctrl-amount" type="range" min="1" max="80" step="1" value="${params.amount}" data-param="amount" data-output="out-amount" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-grain">grain <output id="out-grain">${params.grain}px</output></label>
        <input id="ctrl-grain" type="range" min="1" max="30" step="1" value="${params.grain}" data-param="grain" data-output="out-grain" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-seed">seed <output id="out-seed">${params.seed}</output></label>
        <input id="ctrl-seed" type="range" min="0" max="30" step="1" value="${params.seed}" data-param="seed" data-output="out-seed">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const out = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = Math.floor(x / params.grain)
        const gy = Math.floor(y / params.grain)
        const dx = (hash(gx, gy, params.seed) - 0.5) * params.amount * 2
        const dy = (hash(gx + 11, gy - 5, params.seed) - 0.5) * params.amount * 2
        const i = (y * w + x) * 4
        const si = sample(data, w, h, x + dx, y + dy)
        out[i] = data[si]; out[i + 1] = data[si + 1]; out[i + 2] = data[si + 2]; out[i + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default scatter
