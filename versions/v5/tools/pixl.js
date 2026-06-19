const pixl = {
  id:    'pixl',
  label: 'pixl',
  desc:  'pixelate / mosaic',

  defaultParams: {
    size: 12,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-size">
          size <output id="out-size">${params.size}px</output>
        </label>
        <input id="ctrl-size" type="range" min="2" max="80" step="1"
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

    const size = Math.max(1, params.size)
    const cols = Math.ceil(iw / size)
    const rows = Math.ceil(ih / size)

    const tmp  = new OffscreenCanvas(cols, rows)
    const tCtx = tmp.getContext('2d')
    tCtx.imageSmoothingEnabled = true
    tCtx.drawImage(sourceImage, 0, 0, cols, rows)

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, cols, rows, 0, 0, iw, ih)
  },
}

export default pixl
