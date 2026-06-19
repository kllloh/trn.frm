// ── Median-cut color quantizer ───────────────────────────

function medianCut(pixels, maxColors) {
  if (!pixels.length) return [{ r: 0, g: 0, b: 0 }]
  let buckets = [pixels.slice()]

  while (buckets.length < maxColors) {
    let bi = -1, br = -1
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]
      let mnR=255,mxR=0,mnG=255,mxG=0,mnB=255,mxB=0
      for (const { r, g, b: bl } of b) {
        if (r<mnR) mnR=r; if (r>mxR) mxR=r
        if (g<mnG) mnG=g; if (g>mxG) mxG=g
        if (bl<mnB) mnB=bl; if (bl>mxB) mxB=bl
      }
      const range = Math.max(mxR-mnR, mxG-mnG, mxB-mnB)
      if (range > br) { br = range; bi = i }
    }
    if (br === 0) break

    const bucket = buckets[bi]
    let mnR=255,mxR=0,mnG=255,mxG=0,mnB=255,mxB=0
    for (const { r, g, b: bl } of bucket) {
      if (r<mnR) mnR=r; if (r>mxR) mxR=r
      if (g<mnG) mnG=g; if (g>mxG) mxG=g
      if (bl<mnB) mnB=bl; if (bl>mxB) mxB=bl
    }
    const rR=mxR-mnR, rG=mxG-mnG, rB=mxB-mnB
    const ch = rR>=rG && rR>=rB ? 'r' : rG>=rB ? 'g' : 'b'
    bucket.sort((a, b) => a[ch] - b[ch])
    const mid = bucket.length >> 1
    buckets.splice(bi, 1, bucket.slice(0, mid), bucket.slice(mid))
  }

  return buckets.map(b => {
    let r=0, g=0, bl=0
    for (const p of b) { r+=p.r; g+=p.g; bl+=p.b }
    return { r: Math.round(r/b.length), g: Math.round(g/b.length), b: Math.round(bl/b.length) }
  })
}

function buildPalette(data) {
  const pixels = []
  for (let i = 0; i < data.length; i += 20) pixels.push({ r: data[i], g: data[i+1], b: data[i+2] })
  const pal = medianCut(pixels.length ? pixels : [{ r:0,g:0,b:0 }], 256)
  while (pal.length < 256) pal.push({ r: 0, g: 0, b: 0 })
  return pal
}

// 5-bit-per-channel lookup table (32^3 = 32768 entries) for fast nearest-color
function buildLut(palette) {
  const lut = new Uint8Array(32768)
  for (let ri = 0; ri < 32; ri++) {
    for (let gi = 0; gi < 32; gi++) {
      for (let bi = 0; bi < 32; bi++) {
        const r=(ri<<3)|4, g=(gi<<3)|4, b=(bi<<3)|4
        let best=0, bestD=Infinity
        for (let j=0; j<256; j++) {
          const p=palette[j]
          const d=(r-p.r)**2+(g-p.g)**2+(b-p.b)**2
          if (d<bestD) { bestD=d; best=j; if (d===0) break }
        }
        lut[(ri<<10)|(gi<<5)|bi] = best
      }
    }
  }
  return lut
}

// Floyd-Steinberg dithering to palette index
function indexFrame(data, width, height, palette, lut) {
  const indexed = new Uint8Array(width * height)
  const eR = new Float32Array(width * height)
  const eG = new Float32Array(width * height)
  const eB = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i  = y * width + x
      const pi = i * 4
      const r  = Math.max(0, Math.min(255, data[pi]   + eR[i]))
      const g  = Math.max(0, Math.min(255, data[pi+1] + eG[i]))
      const b  = Math.max(0, Math.min(255, data[pi+2] + eB[i]))

      const best = lut[((r>>3)<<10)|((g>>3)<<5)|(b>>3)]
      indexed[i] = best

      const er = r - palette[best].r
      const eg = g - palette[best].g
      const eb = b - palette[best].b

      if (x+1 < width) {
        eR[i+1] += er*7/16; eG[i+1] += eg*7/16; eB[i+1] += eb*7/16
      }
      if (y+1 < height) {
        if (x > 0) { eR[i+width-1] += er*3/16; eG[i+width-1] += eg*3/16; eB[i+width-1] += eb*3/16 }
        eR[i+width] += er*5/16; eG[i+width] += eg*5/16; eB[i+width] += eb*5/16
        if (x+1 < width) { eR[i+width+1] += er/16; eG[i+width+1] += eg/16; eB[i+width+1] += eb/16 }
      }
    }
  }
  return indexed
}

// ── GIF LZW encoder ──────────────────────────────────────

function lzwEncode(indexed, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const eodCode   = clearCode + 1

  let codeSize = minCodeSize + 1
  let table    = new Map()
  let nextCode = eodCode + 1

  const bytes = []
  let buf = 0, bits = 0
  const emit = code => {
    buf |= code << bits
    bits += codeSize
    while (bits >= 8) { bytes.push(buf & 0xFF); buf >>= 8; bits -= 8 }
  }

  const reset = () => {
    table = new Map()
    nextCode = eodCode + 1
    codeSize = minCodeSize + 1
  }

  reset()
  emit(clearCode)

  let prefix = indexed[0]
  for (let i = 1; i < indexed.length; i++) {
    const pixel = indexed[i]
    const key   = (prefix << 8) | pixel
    const found = table.get(key)
    if (found !== undefined) {
      prefix = found
    } else {
      emit(prefix)
      if (nextCode <= 4095) {
        table.set(key, nextCode++)
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++
      } else {
        emit(clearCode)
        reset()
      }
      prefix = pixel
    }
  }
  emit(prefix)
  emit(eodCode)
  if (bits > 0) bytes.push(buf & 0xFF)

  // Pack into 255-byte sub-blocks
  const out = []
  for (let i = 0; i < bytes.length; i += 255) {
    const end = Math.min(i + 255, bytes.length)
    out.push(end - i)
    for (let j = i; j < end; j++) out.push(bytes[j])
  }
  out.push(0)
  return new Uint8Array(out)
}

// ── GIF file assembler ───────────────────────────────────

// frames: array of ImageData; fps: frames per second; loop: boolean
export async function encodeGIF(frames, { fps = 12, loop = true, onProgress } = {}) {
  if (!frames.length) throw new Error('no frames')
  const { width, height } = frames[0]
  const delay = Math.max(2, Math.round(100 / fps))  // centiseconds

  const out = []
  const u8  = n => out.push(n & 0xFF)
  const u16 = n => { out.push(n & 0xFF); out.push((n >> 8) & 0xFF) }
  const str = s => { for (let i = 0; i < s.length; i++) u8(s.charCodeAt(i)) }

  // Header + Logical Screen Descriptor (no global color table)
  str('GIF89a')
  u16(width); u16(height)
  u8(0x70)  // color resolution = 8 bits, no GCT
  u8(0x00)  // background color
  u8(0x00)  // pixel aspect ratio

  // Netscape looping extension
  if (loop) {
    u8(0x21); u8(0xFF); u8(0x0B)
    str('NETSCAPE2.0')
    u8(0x03); u8(0x01); u16(0); u8(0x00)
  }

  for (let fi = 0; fi < frames.length; fi++) {
    const { data } = frames[fi]

    const palette = buildPalette(data)
    const lut     = buildLut(palette)
    const indexed = indexFrame(data, width, height, palette, lut)

    // Graphics Control Extension
    u8(0x21); u8(0xF9); u8(0x04)
    u8(0x04)   // disposal = do-not-dispose, no transparency
    u16(delay)
    u8(0x00); u8(0x00)

    // Image Descriptor (local color table: 256 entries, N=7, flag=0x87)
    u8(0x2C)
    u16(0); u16(0); u16(width); u16(height)
    u8(0x87)  // local CT present, 256 colors

    // Local Color Table
    for (const { r, g, b } of palette) { u8(r); u8(g); u8(b) }

    // Image Data (minCodeSize=8 for 256-color palette)
    u8(8)
    const compressed = lzwEncode(indexed, 8)
    for (let j = 0; j < compressed.length; j++) out.push(compressed[j])

    onProgress?.(fi + 1, frames.length)
    if (fi % 2 === 1) await new Promise(r => setTimeout(r, 0))
  }

  u8(0x3B)  // GIF trailer
  return new Uint8Array(out)
}
