const shrp = {
  id:    'shrp',
  label: 'shrp',
  desc:  'unsharp mask sharpening',

  defaultParams: {
    amount: 80,
    radius: 2,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-amount">
          amount <output id="out-amount">${params.amount}%</output>
        </label>
        <input id="ctrl-amount" type="range" min="0" max="300" step="1"
               value="${params.amount}" data-param="amount" data-output="out-amount" data-suffix="%">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-radius">
          radius <output id="out-radius">${params.radius}px</output>
        </label>
        <input id="ctrl-radius" type="range" min="1" max="20" step="1"
               value="${params.radius}" data-param="radius" data-output="out-radius" data-suffix="px">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight
    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    // Blurred version
    const blurred = new OffscreenCanvas(iw, ih)
    const bCtx    = blurred.getContext('2d')
    bCtx.filter   = `blur(${params.radius}px)`
    bCtx.drawImage(sourceImage, 0, 0)

    // Get pixel data for both
    const srcCanvas = new OffscreenCanvas(iw, ih)
    srcCanvas.getContext('2d').drawImage(sourceImage, 0, 0)
    const srcData = srcCanvas.getContext('2d').getImageData(0, 0, iw, ih).data
    const blurData = bCtx.getImageData(0, 0, iw, ih).data

    const out = ctx.createImageData(iw, ih)
    const dst = out.data
    const amt = params.amount / 100

    for (let i = 0; i < srcData.length; i += 4) {
      dst[i]     = Math.max(0, Math.min(255, srcData[i]     + amt * (srcData[i]     - blurData[i])))
      dst[i + 1] = Math.max(0, Math.min(255, srcData[i + 1] + amt * (srcData[i + 1] - blurData[i + 1])))
      dst[i + 2] = Math.max(0, Math.min(255, srcData[i + 2] + amt * (srcData[i + 2] - blurData[i + 2])))
      dst[i + 3] = srcData[i + 3]
    }

    ctx.putImageData(out, 0, 0)
  },
}

export default shrp
