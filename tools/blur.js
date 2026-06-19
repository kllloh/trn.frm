const blur = {
  id:    'blur',
  label: 'blur',
  desc:  'gaussian, motion, and zoom blur',

  defaultParams: {
    mode:   'gaussian',
    amount: 8,
    angle:  0,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          <button class="opt${params.mode === 'gaussian' ? ' active' : ''}" data-value="gaussian">gaussian</button>
          <button class="opt${params.mode === 'motion'   ? ' active' : ''}" data-value="motion">motion</button>
          <button class="opt${params.mode === 'zoom'     ? ' active' : ''}" data-value="zoom">zoom</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-amount">
          amount <output id="out-amount">${params.amount}</output>
        </label>
        <input id="ctrl-amount" type="range" min="1" max="60" step="1"
               value="${params.amount}" data-param="amount" data-output="out-amount">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-angle">
          angle <output id="out-angle">${params.angle}°</output>
        </label>
        <input id="ctrl-angle" type="range" min="0" max="359" step="1"
               value="${params.angle}" data-param="angle" data-output="out-angle" data-suffix="°">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight
    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    if (params.mode === 'gaussian') {
      const tmp = new OffscreenCanvas(iw, ih)
      const tCtx = tmp.getContext('2d')
      tCtx.filter = `blur(${params.amount}px)`
      tCtx.drawImage(sourceImage, 0, 0)
      ctx.drawImage(tmp, 0, 0)
      return
    }

    // Get source pixels for motion / zoom
    const tmp = new OffscreenCanvas(iw, ih)
    tmp.getContext('2d').drawImage(sourceImage, 0, 0)
    const src  = tmp.getContext('2d').getImageData(0, 0, iw, ih).data
    const out  = ctx.createImageData(iw, ih)
    const dst  = out.data
    const steps = Math.max(2, Math.round(params.amount * 0.6))
    const cx = iw / 2, cy = ih / 2

    const sample = (x, y) => {
      const sx = Math.max(0, Math.min(iw - 1, Math.round(x)))
      const sy = Math.max(0, Math.min(ih - 1, Math.round(y)))
      return (sy * iw + sx) * 4
    }

    if (params.mode === 'motion') {
      const rad = params.angle * Math.PI / 180
      const dx  = Math.cos(rad)
      const dy  = Math.sin(rad)
      const half = steps / 2

      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          let r = 0, g = 0, b = 0
          for (let t = -half; t <= half; t++) {
            const pi = sample(x + t * dx, y + t * dy)
            r += src[pi]; g += src[pi + 1]; b += src[pi + 2]
          }
          const n = steps + 1
          const oi = (y * iw + x) * 4
          dst[oi] = r / n; dst[oi + 1] = g / n; dst[oi + 2] = b / n; dst[oi + 3] = 255
        }
      }
    } else {
      // zoom blur — sample along ray toward center
      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          let r = 0, g = 0, b = 0
          const nx = x - cx, ny = y - cy
          for (let t = 0; t <= steps; t++) {
            const f  = 1 - (t / steps) * (params.amount / 100)
            const pi = sample(cx + nx * f, cy + ny * f)
            r += src[pi]; g += src[pi + 1]; b += src[pi + 2]
          }
          const n = steps + 1
          const oi = (y * iw + x) * 4
          dst[oi] = r / n; dst[oi + 1] = g / n; dst[oi + 2] = b / n; dst[oi + 3] = 255
        }
      }
    }

    ctx.putImageData(out, 0, 0)
  },
}

export default blur
