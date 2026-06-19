const blok = {
  id:    'blok',
  label: 'blok',
  desc:  'solid colour block fill',

  defaultParams: {
    color:  '#000000',
    radius: 0,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-color">color</label>
        <input id="ctrl-color" type="color" value="${params.color}" data-param="color">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-radius">
          corners <output id="out-radius">${params.radius}px</output>
        </label>
        <input id="ctrl-radius" type="range" min="0" max="500" step="1"
               value="${params.radius}" data-param="radius" data-output="out-radius" data-suffix="px">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas, marquee) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight
    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    const x = marquee ? marquee.x : 0
    const y = marquee ? marquee.y : 0
    const w = marquee ? marquee.w : iw
    const h = marquee ? marquee.h : ih
    const r = Math.min(params.radius, w / 2, h / 2)

    ctx.fillStyle = params.color
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  },
}

export default blok
