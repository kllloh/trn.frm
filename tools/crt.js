import { readImage, writeImage, sample, clamp } from './_helpers.js'

const crt = {
  id: 'crt',
  label: 'crt',
  desc: 'scanlines, phosphor mask, and chromatic offset',

  defaultParams: { scanline: 38, mask: 24, chroma: 3, vignette: 25 },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-scanline">scanline <output id="out-scanline">${params.scanline}%</output></label>
        <input id="ctrl-scanline" type="range" min="0" max="80" step="1" value="${params.scanline}" data-param="scanline" data-output="out-scanline" data-suffix="%">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-mask">mask <output id="out-mask">${params.mask}%</output></label>
        <input id="ctrl-mask" type="range" min="0" max="70" step="1" value="${params.mask}" data-param="mask" data-output="out-mask" data-suffix="%">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-chroma">chroma <output id="out-chroma">${params.chroma}px</output></label>
        <input id="ctrl-chroma" type="range" min="0" max="10" step="1" value="${params.chroma}" data-param="chroma" data-output="out-chroma" data-suffix="px">
      </div>
      <div class="control-group">
        <label class="control-label" for="ctrl-vignette">vignette <output id="out-vignette">${params.vignette}%</output></label>
        <input id="ctrl-vignette" type="range" min="0" max="80" step="1" value="${params.vignette}" data-param="vignette" data-output="out-vignette" data-suffix="%">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const { w, h, data } = readImage(sourceImage)
    const out = new Uint8ClampedArray(w * h * 4)
    const cx = w / 2, cy = h / 2
    const maxD = Math.sqrt(cx * cx + cy * cy)
    for (let y = 0; y < h; y++) {
      const scan = y % 3 === 0 ? 1 - params.scanline / 100 : 1
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const ri = sample(data, w, h, x + params.chroma, y)
        const gi = sample(data, w, h, x, y)
        const bi = sample(data, w, h, x - params.chroma, y)
        const mask = 1 - ((x % 3) / 2) * params.mask / 100
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxD
        const vig = 1 - d * d * params.vignette / 100
        out[i] = clamp(data[ri] * scan * mask * vig)
        out[i + 1] = clamp(data[gi + 1] * scan * vig)
        out[i + 2] = clamp(data[bi + 2] * scan * (1.05 - mask * 0.05) * vig)
        out[i + 3] = 255
      }
    }
    writeImage(outputCanvas, w, h, out)
  },
}

export default crt
