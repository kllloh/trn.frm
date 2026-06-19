// Seeded PRNG (LCG) for deterministic noise
function prng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const clth = {
  id:    'glth',
  label: 'glth',
  desc:  'digital artifact glitch',

  defaultParams: {
    mode:      'rgb',
    intensity: 50,
    chaos:     40,
  },

  renderControls(params) {
    return `
      <div class="control-group">
        <p class="control-label">mode</p>
        <div class="option-group" data-param="mode">
          <button class="opt${params.mode === 'rgb'  ? ' active' : ''}" data-value="rgb">rgb</button>
          <button class="opt${params.mode === 'lcd'  ? ' active' : ''}" data-value="lcd">lcd</button>
          <button class="opt${params.mode === 'band' ? ' active' : ''}" data-value="band">band</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-intensity">
          intensity <output id="out-intensity">${params.intensity}</output>
        </label>
        <input id="ctrl-intensity" type="range" min="0" max="100" step="1"
               value="${params.intensity}" data-param="intensity" data-output="out-intensity">
      </div>

      <div class="control-group">
        <label class="control-label" for="ctrl-chaos">
          chaos <output id="out-chaos">${params.chaos}</output>
        </label>
        <input id="ctrl-chaos" type="range" min="0" max="100" step="1"
               value="${params.chaos}" data-param="chaos" data-output="out-chaos">
      </div>
    `
  },

  render(sourceImage, params, outputCanvas) {
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight

    outputCanvas.width  = iw
    outputCanvas.height = ih
    const ctx = outputCanvas.getContext('2d')

    const tmp    = new OffscreenCanvas(iw, ih)
    tmp.getContext('2d').drawImage(sourceImage, 0, 0)
    const src = tmp.getContext('2d').getImageData(0, 0, iw, ih).data

    const out = ctx.createImageData(iw, ih)
    const dst = out.data

    const intensity = params.intensity / 100
    const chaos     = params.chaos / 100
    const rand      = prng(42)

    const clamp = (v, lo = 0, hi = 255) => v < lo ? lo : v > hi ? hi : v

    if (params.mode === 'rgb') {
      // RGB channel separation + horizontal glitch blocks
      const maxShift = Math.round(intensity * iw * 0.18)
      const rShift   =  Math.round(maxShift * 0.65)
      const bShift   = -Math.round(maxShift * 0.45)

      // Random horizontal glitch blocks with large displacement
      const blockDisp = new Int32Array(ih)
      const numBlocks = Math.round(chaos * 25)
      for (let b = 0; b < numBlocks; b++) {
        const y0 = Math.floor(rand() * ih)
        const h  = Math.floor(rand() * 18) + 1
        const d  = Math.round((rand() - 0.5) * iw * 0.5)
        for (let y = y0; y < Math.min(ih, y0 + h); y++) blockDisp[y] = d
      }

      for (let y = 0; y < ih; y++) {
        const bd = blockDisp[y]
        for (let x = 0; x < iw; x++) {
          const rx = clamp(x + rShift + bd, 0, iw - 1)
          const gx = clamp(x + bd,          0, iw - 1)
          const bx = clamp(x + bShift + bd, 0, iw - 1)
          const oi = (y * iw + x)  * 4
          const ri = (y * iw + rx) * 4
          const gi = (y * iw + gx) * 4
          const bi = (y * iw + bx) * 4
          dst[oi]     = src[ri]
          dst[oi + 1] = src[gi + 1]
          dst[oi + 2] = src[bi + 2]
          dst[oi + 3] = src[(y * iw + x) * 4 + 3]
        }
      }

    } else if (params.mode === 'lcd') {
      // LCD subpixel grid — vertical R/G/B stripe columns
      const stripe = Math.max(1, Math.round(1 + intensity * 3))  // 1–4px per sub-pixel
      const boost  = 1.4 + chaos * 2.0
      const dim    = 0.08

      for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
          const col = Math.floor(x / stripe) % 3
          // Sample from the centre of the owning pixel triplet for a blocky look
          const bx = Math.floor(x / (stripe * 3)) * (stripe * 3)
                   + col * stripe + Math.floor(stripe / 2)
          const si = (y * iw + Math.min(iw - 1, bx)) * 4
          const oi = (y * iw + x) * 4
          dst[oi]     = col === 0 ? clamp(src[si]     * boost) : clamp(src[si]     * dim)
          dst[oi + 1] = col === 1 ? clamp(src[si + 1] * boost) : clamp(src[si + 1] * dim)
          dst[oi + 2] = col === 2 ? clamp(src[si + 2] * boost) : clamp(src[si + 2] * dim)
          dst[oi + 3] = 255
        }
      }

    } else if (params.mode === 'band') {
      // Horizontal scan-band displacement with per-channel colour shift
      const maxDisp = Math.round(intensity * iw * 0.35)

      // Build bands of varying heights
      let y = 0
      while (y < ih) {
        const minH  = Math.max(1, Math.round(2 + (1 - chaos) * 30))
        const maxH  = Math.max(minH + 1, Math.round(minH + chaos * 60))
        const h     = Math.floor(rand() * (maxH - minH)) + minH
        const y1    = Math.min(ih, y + h)

        // Each band: shared displacement + small per-channel offset
        const disp  = Math.round((rand() - 0.5) * maxDisp * 2)
        const rOff  = Math.round((rand() - 0.5) * maxDisp * 0.4)
        const bOff  = Math.round((rand() - 0.5) * maxDisp * 0.4)

        for (let py = y; py < y1; py++) {
          for (let px = 0; px < iw; px++) {
            const rx = clamp(px + disp + rOff, 0, iw - 1)
            const gx = clamp(px + disp,        0, iw - 1)
            const bx = clamp(px + disp + bOff, 0, iw - 1)
            const oi = (py * iw + px) * 4
            const ri = (py * iw + rx) * 4
            const gi = (py * iw + gx) * 4
            const bi = (py * iw + bx) * 4
            dst[oi]     = src[ri]
            dst[oi + 1] = src[gi + 1]
            dst[oi + 2] = src[bi + 2]
            dst[oi + 3] = 255
          }
        }
        y = y1
      }
    }

    ctx.putImageData(out, 0, 0)
  },
}

export default clth
