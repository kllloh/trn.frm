const half = {
  id:    'half',
  label: 'half',
  desc:  'halftone dot screen',

  defaultParams: {
    size:   14,
    angle:  45,
    scale:  95,
    mode:   'mono',
    color:  '#000000',
    bg:     '#ffffff',
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          <button class="opt${params.mode === 'mono'  ? ' active' : ''}" data-value="mono">mono</button>
          <button class="opt${params.mode === 'color' ? ' active' : ''}" data-value="color">color</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-size">
          grid <output id="out-size">${params.size}px</output>
        </label>
        <input id="ctrl-size" type="range" min="4" max="48" step="1"
               value="${params.size}" data-param="size" data-output="out-size" data-suffix="px">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-angle">
          angle <output id="out-angle">${params.angle}°</output>
        </label>
        <input id="ctrl-angle" type="range" min="0" max="90" step="1"
               value="${params.angle}" data-param="angle" data-output="out-angle" data-suffix="°">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-scale">
          scale <output id="out-scale">${params.scale}%</output>
        </label>
        <input id="ctrl-scale" type="range" min="10" max="140" step="1"
               value="${params.scale}" data-param="scale" data-output="out-scale" data-suffix="%">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-color">dot</label>
        <input id="ctrl-color" type="color" value="${params.color}" data-param="color">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-bg">background</label>
        <input id="ctrl-bg" type="color" value="${params.bg}" data-param="bg">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight

    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    const tmp = new OffscreenCanvas(iw, ih)
    tmp.getContext('2d').drawImage(sourceImage, 0, 0)
    const { data } = tmp.getContext('2d').getImageData(0, 0, iw, ih)

    const step  = params.size
    const angle = params.angle * Math.PI / 180
    const cos   = Math.cos(angle)
    const sin   = Math.sin(angle)
    const cx    = iw / 2
    const cy    = ih / 2
    const diag  = Math.sqrt(iw * iw + ih * ih) / 2 + step * 2

    ctx.fillStyle = params.mode === 'mono' ? params.bg : '#ffffff'
    ctx.fillRect(0, 0, iw, ih)

    for (let gy = -diag; gy <= diag; gy += step) {
      for (let gx = -diag; gx <= diag; gx += step) {
        // Map rotated grid point → image space
        const ix = cx + gx * cos - gy * sin
        const iy = cy + gx * sin + gy * cos

        if (ix < 0 || ix >= iw || iy < 0 || iy >= ih) continue

        const sx = Math.min(iw - 1, Math.max(0, Math.round(ix)))
        const sy = Math.min(ih - 1, Math.max(0, Math.round(iy)))
        const pi = (sy * iw + sx) * 4

        const r = data[pi], g = data[pi + 1], b = data[pi + 2]
        const lum    = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        const radius = (1 - lum) * step * 0.5 * (params.scale / 100)

        if (radius < 0.3) continue

        ctx.beginPath()
        ctx.arc(ix, iy, Math.min(radius, step * 0.55), 0, Math.PI * 2)
        ctx.fillStyle = params.mode === 'color'
          ? `rgb(${r},${g},${b})`
          : params.color
        ctx.fill()
      }
    }
  },
}

export default half
