export function readImage(sourceImage) {
  const w = sourceImage.naturalWidth
  const h = sourceImage.naturalHeight
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(sourceImage, 0, 0)
  return { w, h, data: ctx.getImageData(0, 0, w, h).data }
}

export function writeImage(outputCanvas, w, h, data) {
  outputCanvas.width = w
  outputCanvas.height = h
  outputCanvas.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0)
}

export function lum(data, i) {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

export function clamp(v, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v))
}

export function sample(data, w, h, x, y) {
  const sx = Math.max(0, Math.min(w - 1, Math.round(x)))
  const sy = Math.max(0, Math.min(h - 1, Math.round(y)))
  return (sy * w + sx) * 4
}

export function hash(x, y, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

export function copyImage(outputCanvas, w, h, data) {
  writeImage(outputCanvas, w, h, new Uint8ClampedArray(data))
}
