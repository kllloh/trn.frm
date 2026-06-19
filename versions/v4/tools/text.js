const FONTS = {
  mono:    '"JetBrains Mono", monospace',
  sans:    'system-ui, sans-serif',
  serif:   'Georgia, serif',
  display: 'Impact, fantasy',
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrapLines(ctx, text, maxWidth) {
  const out = []
  for (const paragraph of String(text).split('\n')) {
    if (paragraph === '') { out.push(''); continue }
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (line && ctx.measureText(test).width > maxWidth) {
        out.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out
}

const text = {
  id:    'text',
  label: 'text',
  desc:  'overlay text on image',

  defaultParams: {
    text:  'TEXT',
    font:  'mono',
    size:  80,
    style: 'regular',
    color: '#ffffff',
    align: 'center',
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-text">content</label>
        <textarea id="ctrl-text" data-param="text" rows="3">${esc(params.text)}</textarea>
      </div>

      <div class="control-group">
        <p class="control-label">font</p>
        <div class="option-group" data-param="font">
          ${Object.keys(FONTS).map(f => `
            <button class="opt${params.font === f ? ' active' : ''}"
                    data-value="${f}">${f}</button>
          `).join('')}
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-size">
          size <output id="out-size">${params.size}</output>
        </label>
        <input id="ctrl-size" type="range"
               min="8" max="400" step="1"
               value="${params.size}"
               data-param="size" data-output="out-size">
      </div>

      <div class="control-group">
        <p class="control-label">weight</p>
        <div class="option-group" data-param="style">
          <button class="opt${params.style !== 'bold' ? ' active' : ''}" data-value="regular">regular</button>
          <button class="opt${params.style === 'bold'  ? ' active' : ''}" data-value="bold">bold</button>
        </div>
      </div>

      <div class="control-group">
        <p class="control-label">align</p>
        <div class="option-group" data-param="align">
          <button class="opt${params.align === 'left'   ? ' active' : ''}" data-value="left">left</button>
          <button class="opt${params.align === 'center' ? ' active' : ''}" data-value="center">middle</button>
          <button class="opt${params.align === 'right'  ? ' active' : ''}" data-value="right">right</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-color">color</label>
        <input id="ctrl-color" type="color" value="${esc(params.color)}" data-param="color">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas, marquee) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight

    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    const family = FONTS[params.font] || FONTS.mono
    const weight = params.style === 'bold' ? 'bold' : 'normal'
    ctx.font      = `${weight} ${params.size}px ${family}`
    ctx.fillStyle = params.color || '#ffffff'

    const align   = params.align || 'center'
    const mqX     = marquee ? marquee.x : 0
    const mqY     = marquee ? marquee.y : 0
    const mqW     = marquee ? marquee.w : iw
    const mqH     = marquee ? marquee.h : ih

    ctx.textAlign    = align
    ctx.textBaseline = 'middle'

    const anchorX = align === 'left'  ? mqX :
                    align === 'right' ? mqX + mqW :
                                        mqX + mqW / 2

    const lines      = wrapLines(ctx, params.text, mqW)
    const lineHeight = params.size * 1.25
    const blockH     = lines.length * lineHeight
    const startY     = mqY + (mqH - blockH) / 2 + lineHeight / 2

    lines.forEach((line, i) => ctx.fillText(line, anchorX, startY + i * lineHeight))
  },
}

export default text
