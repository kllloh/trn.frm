function prng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const chop = {
  id:    'chop',
  label: 'chop',
  desc:  'slice displacement glitch',

  defaultParams: {
    slices: 30,
    shift:  60,
    chaos:  50,
    seed:   1,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <label class="control-label" for="ctrl-slices">
          slices <output id="out-slices">${params.slices}</output>
        </label>
        <input id="ctrl-slices" type="range" min="2" max="120" step="1"
               value="${params.slices}" data-param="slices" data-output="out-slices">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-shift">
          shift <output id="out-shift">${params.shift}</output>
        </label>
        <input id="ctrl-shift" type="range" min="0" max="200" step="1"
               value="${params.shift}" data-param="shift" data-output="out-shift">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-chaos">
          chaos <output id="out-chaos">${params.chaos}%</output>
        </label>
        <input id="ctrl-chaos" type="range" min="0" max="100" step="1"
               value="${params.chaos}" data-param="chaos" data-output="out-chaos" data-suffix="%">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-seed">
          seed <output id="out-seed">${params.seed}</output>
        </label>
        <input id="ctrl-seed" type="range" min="1" max="99" step="1"
               value="${params.seed}" data-param="seed" data-output="out-seed">
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

    const rand     = prng(params.seed * 7919)
    const sliceH   = Math.max(1, Math.round(ih / params.slices))
    const maxShift = params.shift
    const chaos    = params.chaos / 100

    let y = 0
    while (y < ih) {
      // Vary slice height by chaos
      const h = Math.max(1, Math.round(sliceH * (1 + (rand() - 0.5) * chaos * 1.5)))

      // Most slices have no shift; chaos controls how many are displaced
      if (rand() < chaos * 0.7 + 0.05) {
        const dx = Math.round((rand() - 0.5) * maxShift * 2)
        if (dx !== 0) {
          const sliceH2 = Math.min(h, ih - y)
          ctx.drawImage(sourceImage, 0, y, iw, sliceH2, dx, y, iw, sliceH2)
        }
      }

      y += h
    }
  },
}

export default chop
