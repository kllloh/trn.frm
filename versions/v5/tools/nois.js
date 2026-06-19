function prng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const nois = {
  id:    'nois',
  label: 'nois',
  desc:  'film grain noise',

  defaultParams: {
    mode:   'lum',
    amount: 40,
    size:   1,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          <button class="opt${params.mode === 'lum'   ? ' active' : ''}" data-value="lum">lum</button>
          <button class="opt${params.mode === 'color' ? ' active' : ''}" data-value="color">color</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-amount">
          amount <output id="out-amount">${params.amount}</output>
        </label>
        <input id="ctrl-amount" type="range" min="1" max="100" step="1"
               value="${params.amount}" data-param="amount" data-output="out-amount">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-size">
          grain <output id="out-size">${params.size}px</output>
        </label>
        <input id="ctrl-size" type="range" min="1" max="6" step="1"
               value="${params.size}" data-param="size" data-output="out-size" data-suffix="px">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight
    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')
    ctx.drawImage(sourceImage, 0, 0)

    const grain  = params.size
    const cols   = Math.ceil(iw / grain)
    const rows   = Math.ceil(ih / grain)
    const spread = params.amount / 100
    const rand   = prng(params.amount * 397 + params.size * 1031 + (params.mode === 'color' ? 7 : 0))

    const noise = new OffscreenCanvas(iw, ih)
    const nCtx  = noise.getContext('2d')
    const img   = nCtx.createImageData(iw, ih)
    const d     = img.data

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const n  = (rand() - 0.5) * spread * 255
        const nr = params.mode === 'lum' ? n : (rand() - 0.5) * spread * 255
        const ng = params.mode === 'lum' ? n : (rand() - 0.5) * spread * 255
        const nb = params.mode === 'lum' ? n : (rand() - 0.5) * spread * 255

        for (let gy = 0; gy < grain; gy++) {
          for (let gx = 0; gx < grain; gx++) {
            const x = col * grain + gx
            const y = row * grain + gy
            if (x >= iw || y >= ih) continue
            const i = (y * iw + x) * 4
            d[i]     = 128 + nr
            d[i + 1] = 128 + ng
            d[i + 2] = 128 + nb
            d[i + 3] = 255
          }
        }
      }
    }

    nCtx.putImageData(img, 0, 0)
    ctx.globalCompositeOperation = 'overlay'
    ctx.drawImage(noise, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  },
}

export default nois
