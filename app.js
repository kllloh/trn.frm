import { encodeGIF } from './tools/gif.js'
import dithering  from './tools/dithering.js'
import ascii      from './tools/ascii.js'
import edge       from './tools/edge.js'
import stippling  from './tools/stippling.js'
import half       from './tools/half.js'
import recolor    from './tools/recolor.js'
import distort    from './tools/distort.js'
import displace   from './tools/displace.js'
import scatter    from './tools/scatter.js'
import cellular   from './tools/cellular.js'
import gradients  from './tools/gradients.js'
import crt        from './tools/crt.js'
import text       from './tools/text.js'
import glth       from './tools/glth.js'
import blur       from './tools/blur.js'
import pixl       from './tools/pixl.js'
import nois       from './tools/nois.js'
import shrp       from './tools/shrp.js'
import chop       from './tools/chop.js'
import blok       from './tools/blok.js'

const TOOLS    = {
  dithering, ascii, edge, stippling, half,
  distort, displace, recolor, scatter, cellular,
  gradients, crt, text, glth,
  blur, pixl, nois, shrp, chop, blok,
}
const NODE_SZ     = 52
const SVG_NS      = 'http://www.w3.org/2000/svg'
const PORT_HIT    = 14   // px radius for port connection snap
const MARQUEE_HIT = 8    // px tolerance for marquee handles/edges
const MARQUEE_MIN = 4    // minimum marquee size in image pixels
const SCENE_W     = 4000 // logical scene width  (px at scale 1)
const SCENE_H     = 4000 // logical scene height

// ── State ────────────────────────────────────────────────
const state = {
  image:      null,
  nodes:      [],   // { id, toolId, tool, params, x, y, marquee:{x,y,w,h}|null }
  selectedId: null,
  nextId:     1,
  anim:       { frames: 16, fps: 12 },
  timeline:   { currentFrame: 0, playing: false, playRafId: null },
}

let previewOverrides = new Map()  // nodeId → { param: value } at current frame
let selectedKf       = null       // { nodeId, param, frame }
let kfDrag           = null       // { nodeId, param, frame, laneEl, diamondEl }

// ── DOM refs ─────────────────────────────────────────────
const toolNav       = document.getElementById('tool-nav')
const controlsPanel = document.getElementById('controls-panel')
const dropzone      = document.getElementById('dropzone')
const canvas        = document.getElementById('output-canvas')
const canvasWrap    = document.getElementById('canvas-wrap')
const sceneSizer    = document.getElementById('scene-sizer')
const scene         = document.getElementById('scene')
const main          = document.getElementById('main')
const overlay       = document.getElementById('overlay')
const fileInput     = document.getElementById('file-input')
const btnSave       = document.getElementById('btn-save')
const statusTool    = document.getElementById('status-tool').querySelector('span')
const statusInfo    = document.getElementById('status-info')
const btnGif         = document.getElementById('btn-gif')
const animFramesEl   = document.getElementById('anim-frames')
const animFpsEl      = document.getElementById('anim-fps')
const animOutFrames  = document.getElementById('anim-out-frames')
const animOutFps     = document.getElementById('anim-out-fps')
const tlPlayBtn      = document.getElementById('tl-play-btn')
const tlFrameNum     = document.getElementById('tl-frame-num')
const tlRulerLane    = document.getElementById('tl-ruler-lane')
const tlTracks       = document.getElementById('tl-tracks')
const tlPlayheadLine = document.getElementById('tl-playhead-line')

// canvas position within the scene (updated on image load)
let canvasX = 0
let canvasY = 0

// ── Node management ──────────────────────────────────────
function createNode(toolId, dropX, dropY) {
  const tool = TOOLS[toolId]
  if (!tool) return
  const id   = state.nextId++
  const node = {
    id, toolId, tool,
    params:  { ...tool.defaultParams },
    x: dropX - NODE_SZ / 2,
    y: dropY - NODE_SZ / 2,
    marquee:        null,
    marqueeOpacity: 1,
    chainZ:         id,     // render order: higher = on top
    inputFrom:      null,
    crossInput:     null,   // { fromNodeId, mix: 0-1 } — cross-chain blend
    animParams:     {},     // { paramName: { from, to } }
  }
  state.nodes.push(node)
  graphVersion++

  const el = document.createElement('div')
  el.className      = 'effect-node'
  el.dataset.nodeId = id
  el.style.left     = node.x + 'px'
  el.style.top      = node.y + 'px'
  el.innerHTML = `
    <div class="node-port input-port"  title="input"></div>
    <div class="node-port output-port" title="output"></div>
    <span class="node-label">${toolId.slice(0, 4).toUpperCase()}</span>
    <button class="node-close" title="remove">×</button>
    <span class="node-hint">drag on image</span>
  `
  scene.appendChild(el)
  setupNodeInteraction(el, id)
  selectNode(id)
  return node
}

function removeNode(id) {
  scene.querySelectorAll(`.mix-ctrl[data-node-id="${id}"], .opacity-ctrl[data-node-id="${id}"]`).forEach(el => el.remove())
  main.querySelector(`.effect-node[data-node-id="${id}"]`)?.remove()
  const removed = state.nodes.find(n => n.id === id)
  state.nodes = state.nodes.filter(n => n.id !== id)
  graphVersion++
  nodeOutputCache.delete(id)
  let marqueeGiven = false
  state.nodes.forEach(n => {
    if (n.inputFrom === id) {
      n.inputFrom = null
      // Promote the first direct child to chain root, inheriting the deleted root's marquee
      if (!marqueeGiven && removed?.inputFrom === null && removed.marquee) {
        n.marquee  = removed.marquee
        n.chainZ   = removed.chainZ ?? n.chainZ
        marqueeGiven = true
        normalizeChainMarquees(n)
      }
    }
    if (n.crossInput?.fromNodeId === id) n.crossInput = null
  })
  if (state.selectedId === id) {
    state.selectedId = null
    renderControls()
    updateStatusLabel()
    updateCursor()
  }
  updateOverlay()
  render()
}

function selectNode(id) {
  state.selectedId = id
  main.querySelectorAll('.effect-node').forEach(el => {
    const isSelected = Number(el.dataset.nodeId) === id
    el.classList.toggle('selected', isSelected)
    const node = state.nodes.find(n => n.id === Number(el.dataset.nodeId))
    if (node) updateNodeHint(node)
  })
  renderControls()
  updateStatusLabel()
  updateCursor()
  updateOverlay()
}

// ── Graph helpers ────────────────────────────────────────
function wouldCreateCycle(fromId, toId) {
  // BFS downstream from toId — if we reach fromId it's a cycle
  const visited = new Set()
  const queue   = [toId]
  while (queue.length) {
    const cur = queue.shift()
    if (cur === fromId) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const n of state.nodes) {
      if (n.inputFrom === cur) queue.push(n.id)
      if (n.crossInput?.fromNodeId === cur) queue.push(n.id)
    }
  }
  return false
}

let graphVersion = 0
let topoCache    = { version: -1, sorted: [] }
function topoSort() {
  if (topoCache.version === graphVersion) return topoCache.sorted
  const done   = new Set()
  const sorted = []
  const pass   = () => {
    let progress = false
    for (const n of state.nodes) {
      if (done.has(n.id)) continue
      const inputReady = n.inputFrom  === null || done.has(n.inputFrom)
      const crossReady = n.crossInput === null || done.has(n.crossInput.fromNodeId)
      if (inputReady && crossReady) {
        sorted.push(n); done.add(n.id); progress = true
      }
    }
    return progress
  }
  while (done.size < state.nodes.length && pass()) { /* iterate */ }
  topoCache = { version: graphVersion, sorted }
  return sorted
}

function updatePortStyles() {
  const hasInput  = new Set(state.nodes
    .filter(n => n.inputFrom !== null || n.crossInput !== null).map(n => n.id))
  const hasOutput = new Set([
    ...state.nodes.filter(n => n.inputFrom  !== null).map(n => n.inputFrom),
    ...state.nodes.filter(n => n.crossInput !== null).map(n => n.crossInput.fromNodeId),
  ])
  for (const n of state.nodes) {
    const el = main.querySelector(`.effect-node[data-node-id="${n.id}"]`)
    if (!el) continue
    el.querySelector('.input-port')?.classList.toggle('connected', hasInput.has(n.id))
    el.querySelector('.output-port')?.classList.toggle('connected', hasOutput.has(n.id))
  }
}

function connectedNodes(node) {
  const seen = new Set()
  const out  = []
  const walk = id => {
    if (seen.has(id)) return
    seen.add(id)
    const cur = state.nodes.find(n => n.id === id)
    if (!cur) return
    out.push(cur)
    if (cur.inputFrom !== null) walk(cur.inputFrom)
    for (const child of state.nodes) {
      if (child.inputFrom === id) walk(child.id)
    }
  }
  walk(node.id)
  return out
}

function chainRoot(node) {
  let cur = node
  const seen = new Set()
  while (cur?.inputFrom !== null && !seen.has(cur.id)) {
    seen.add(cur.id)
    cur = state.nodes.find(n => n.id === cur.inputFrom)
  }
  return cur ?? node
}

function effectiveMarquee(node) {
  // Use the node's own marquee if it has one, then walk up to chain root
  return node.marquee ?? chainRoot(node).marquee
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function normalizeMarquee(mq) {
  const maxX = Math.max(0, canvas.width - MARQUEE_MIN)
  const maxY = Math.max(0, canvas.height - MARQUEE_MIN)
  const x = clamp(mq.x, 0, maxX)
  const y = clamp(mq.y, 0, maxY)
  const w = clamp(mq.w, MARQUEE_MIN, canvas.width - x)
  const h = clamp(mq.h, MARQUEE_MIN, canvas.height - y)
  return { x, y, w, h }
}

function hasRenderedChild(node, renderedIds) {
  return state.nodes.some(n => n.inputFrom === node.id && renderedIds.has(n.id))
}

function isTerminalNode(node) {
  return !state.nodes.some(n => n.inputFrom === node.id)
}

function chainSequence(root) {
  const out = [], seen = new Set()
  let cur = root
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id); out.push(cur)
    cur = state.nodes.find(n => n.inputFrom === cur.id) ?? null
  }
  return out
}

function updateNodeHint(node) {
  const el = main.querySelector(`.effect-node[data-node-id="${node.id}"]`)
  const hint = el?.querySelector('.node-hint')
  if (!hint) return
  const isSelected = node.id === state.selectedId
  hint.hidden = !isSelected || node.inputFrom !== null || !!node.marquee
}

function normalizeChainMarquees(node) {
  const root  = chainRoot(node)
  const group = connectedNodes(root)

  // Root owns the chain marquee — migrate from the first secondary that has one
  if (!root.marquee) {
    for (const n of group) {
      if (n !== root && n.marquee) { root.marquee = n.marquee; break }
    }
  }
  // Clear marquees from all secondary nodes so the root is the sole owner
  for (const n of group) {
    if (n !== root) n.marquee = null
  }

  group.forEach(n => updateNodeHint(n))
}

// ── Node drag (reposition) ───────────────────────────────
let nodeDrag = null   // { id, startMx, startMy, startNx, startNy }
let connDrag = null   // { fromNodeId, liveX, liveY }

function setupNodeInteraction(el, id) {
  el.querySelector('.node-close').addEventListener('click', e => {
    e.stopPropagation()
    removeNode(id)
  })

  el.addEventListener('click', e => {
    if (!e.target.classList.contains('node-close') &&
        !e.target.classList.contains('node-port')) selectNode(id)
  })

  // Output port: begin connection drag
  el.querySelector('.output-port').addEventListener('mousedown', e => {
    e.preventDefault()
    e.stopPropagation()
    const sr = scene.getBoundingClientRect()
    connDrag = {
      fromNodeId: id,
      liveX: (e.clientX - sr.left) / zoom.scale,
      liveY: (e.clientY - sr.top)  / zoom.scale,
    }
    updateOverlay()
  })

  // Input port: click to disconnect
  el.querySelector('.input-port').addEventListener('click', e => {
    e.stopPropagation()
    const node = state.nodes.find(n => n.id === id)
    if (node?.inputFrom !== null) {
      node.inputFrom = null
      updatePortStyles()
      render()
      updateOverlay()
    }
  })

  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('node-close')) return
    if (e.target.classList.contains('node-port')) return
    e.preventDefault()
    e.stopPropagation()   // don't start marquee underneath
    const node = state.nodes.find(n => n.id === id)
    nodeDrag = {
      id,
      startMx: e.clientX, startMy: e.clientY,
      startNx: node.x,    startNy: node.y,
    }
    el.style.zIndex = 20
  })
}

// ── Marquee drawing ──────────────────────────────────────
let marqueeDrag    = null    // { startIx, startIy, live:{x,y,w,h}|null }
let marqueeEdit    = null    // { nodeId, mode, startIx, startIy, original, live }
let marqueeSettled = false   // prevent click-deselect after marquee commit

function marqueeHit(node, sx, sy) {
  if (!node?.marquee) return null

  const p  = screenToImage(sx, sy)
  const mq = node.marquee
  const cr = canvas.getBoundingClientRect()
  const tx = MARQUEE_HIT / cr.width  * canvas.width
  const ty = MARQUEE_HIT / cr.height * canvas.height

  const left   = mq.x
  const right  = mq.x + mq.w
  const top    = mq.y
  const bottom = mq.y + mq.h

  const nearL = Math.abs(p.x - left) <= tx
  const nearR = Math.abs(p.x - right) <= tx
  const nearT = Math.abs(p.y - top) <= ty
  const nearB = Math.abs(p.y - bottom) <= ty
  const inX   = p.x >= left - tx && p.x <= right + tx
  const inY   = p.y >= top - ty && p.y <= bottom + ty

  if (nearL && nearT) return 'nw'
  if (nearR && nearT) return 'ne'
  if (nearL && nearB) return 'sw'
  if (nearR && nearB) return 'se'
  if (nearL && inY) return 'w'
  if (nearR && inY) return 'e'
  if (nearT && inX) return 'n'
  if (nearB && inX) return 's'
  if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return 'move'
  return null
}

function editMarquee(original, mode, dx, dy) {
  if (mode === 'move') {
    return {
      x: clamp(original.x + dx, 0, canvas.width - original.w),
      y: clamp(original.y + dy, 0, canvas.height - original.h),
      w: original.w,
      h: original.h,
    }
  }

  let x1 = original.x
  let y1 = original.y
  let x2 = original.x + original.w
  let y2 = original.y + original.h

  if (mode.includes('w')) x1 += dx
  if (mode.includes('e')) x2 += dx
  if (mode.includes('n')) y1 += dy
  if (mode.includes('s')) y2 += dy

  x1 = clamp(x1, 0, canvas.width)
  x2 = clamp(x2, 0, canvas.width)
  y1 = clamp(y1, 0, canvas.height)
  y2 = clamp(y2, 0, canvas.height)

  if (x2 - x1 < MARQUEE_MIN) {
    if (mode.includes('w')) x1 = clamp(x2 - MARQUEE_MIN, 0, canvas.width)
    else x2 = clamp(x1 + MARQUEE_MIN, 0, canvas.width)
  }
  if (y2 - y1 < MARQUEE_MIN) {
    if (mode.includes('n')) y1 = clamp(y2 - MARQUEE_MIN, 0, canvas.height)
    else y2 = clamp(y1 + MARQUEE_MIN, 0, canvas.height)
  }

  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

canvasWrap.addEventListener('mousedown', e => {
  if (nodeDrag) return
  if (!state.image || canvas.hidden) return
  if (!state.selectedId) return

  const sel = state.nodes.find(n => n.id === state.selectedId)
  if (!sel) return

  // Expand bounds by MARQUEE_HIT so handles at canvas edges are still clickable
  const cr = canvas.getBoundingClientRect()
  if (e.clientX < cr.left - MARQUEE_HIT || e.clientX > cr.right  + MARQUEE_HIT ||
      e.clientY < cr.top  - MARQUEE_HIT || e.clientY > cr.bottom + MARQUEE_HIT) return

  e.preventDefault()
  const ip = screenToImage(e.clientX, e.clientY)

  // Hit-test against the chain root's marquee (secondary nodes inherit it)
  const root = chainRoot(sel)
  const hit  = marqueeHit(root, e.clientX, e.clientY)
  if (hit) {
    marqueeEdit = {
      nodeId: root.id,
      mode: hit,
      startIx: ip.x,
      startIy: ip.y,
      original: { ...root.marquee },
      live: { ...root.marquee },
    }
    return
  }

  // Only allow drawing a new marquee for a single-node chain root
  if (sel.inputFrom !== null) return   // secondary nodes can't draw new marquees
  if (!isTerminalNode(sel)) return     // roots with children can't draw new marquees
  marqueeDrag = { startIx: ip.x, startIy: ip.y, live: null }
})

// ── Zoom / scroll ─────────────────────────────────────────
const zoom = { scale: 1 }

function applyZoom() {
  scene.style.transform      = `scale(${zoom.scale})`
  sceneSizer.style.width     = SCENE_W * zoom.scale + 'px'
  sceneSizer.style.height    = SCENE_H * zoom.scale + 'px'
  updateStatusInfo()
  updateOverlay()
  updateCursor()
}

function resetZoom() {
  zoom.scale = 1
  applyZoom()
  // Scroll so the canvas is centred in the viewport
  if (state.image) {
    const wr = canvasWrap.getBoundingClientRect()
    canvasWrap.scrollLeft = canvasX - Math.max(0, (wr.width  - state.image.naturalWidth)  / 2)
    canvasWrap.scrollTop  = canvasY - Math.max(0, (wr.height - state.image.naturalHeight) / 2)
  }
}

function updateCursor() {
  if (marqueeEdit) {
    canvasWrap.style.cursor = marqueeEdit.mode === 'move' ? 'move' : `${marqueeEdit.mode}-resize`
  } else if (state.selectedId && !canvas.hidden) {
    canvasWrap.style.cursor = 'crosshair'
  } else {
    canvasWrap.style.cursor = ''
  }
}

function updateMarqueeCursor(e) {
  if (nodeDrag || connDrag || marqueeDrag || marqueeEdit) return
  const node = state.nodes.find(n => n.id === state.selectedId)
  const root = node ? chainRoot(node) : null
  const hit  = root ? marqueeHit(root, e.clientX, e.clientY) : null
  if (hit) {
    canvasWrap.style.cursor = hit === 'move' ? 'move' : `${hit}-resize`
  } else {
    updateCursor()
  }
}

canvasWrap.addEventListener('wheel', e => {
  if (!state.image) return
  e.preventDefault()
  const fac = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const ns  = Math.min(Math.max(zoom.scale * fac, 0.25), 20)

  // Keep the point under the cursor fixed while zooming
  const wr = canvasWrap.getBoundingClientRect()
  const mx = e.clientX - wr.left
  const my = e.clientY - wr.top
  const sx = (canvasWrap.scrollLeft + mx) / zoom.scale
  const sy = (canvasWrap.scrollTop  + my) / zoom.scale

  zoom.scale = ns
  applyZoom()

  canvasWrap.scrollLeft = sx * ns - mx
  canvasWrap.scrollTop  = sy * ns - my
}, { passive: false })

canvasWrap.addEventListener('dblclick', () => resetZoom())

// ── Global mouse handlers ────────────────────────────────
window.addEventListener('mousemove', e => {
  // node drag — delta divided by zoom.scale to stay in scene space
  if (nodeDrag) {
    const node = state.nodes.find(n => n.id === nodeDrag.id)
    if (node) {
      node.x = nodeDrag.startNx + (e.clientX - nodeDrag.startMx) / zoom.scale
      node.y = nodeDrag.startNy + (e.clientY - nodeDrag.startMy) / zoom.scale
      const el = main.querySelector(`.effect-node[data-node-id="${nodeDrag.id}"]`)
      if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px' }
      updateOverlay()
    }
    return
  }

  // connection drag — track in scene-local coords
  if (connDrag) {
    const sr = scene.getBoundingClientRect()
    connDrag.liveX = (e.clientX - sr.left) / zoom.scale
    connDrag.liveY = (e.clientY - sr.top)  / zoom.scale
    updateOverlay()
    return
  }

  // marquee move/resize
  if (marqueeEdit) {
    const ip = screenToImage(e.clientX, e.clientY)
    marqueeEdit.live = editMarquee(
      marqueeEdit.original,
      marqueeEdit.mode,
      ip.x - marqueeEdit.startIx,
      ip.y - marqueeEdit.startIy,
    )
    // Commit live position to node so render() sees the updated marquee
    const node = state.nodes.find(n => n.id === marqueeEdit.nodeId)
    if (node) {
      node.marquee = normalizeMarquee(marqueeEdit.live)
      normalizeChainMarquees(node)
    }
    updateOverlay()
    render()
    return
  }

  // marquee draw
  if (marqueeDrag) {
    const ip = screenToImage(e.clientX, e.clientY)
    marqueeDrag.live = {
      x: Math.min(marqueeDrag.startIx, ip.x),
      y: Math.min(marqueeDrag.startIy, ip.y),
      w: Math.abs(ip.x - marqueeDrag.startIx),
      h: Math.abs(ip.y - marqueeDrag.startIy),
    }
    updateOverlay()
    return
  }

  updateMarqueeCursor(e)
})

window.addEventListener('mouseup', e => {
  if (nodeDrag) {
    const el = main.querySelector(`.effect-node[data-node-id="${nodeDrag.id}"]`)
    if (el) el.style.zIndex = ''
    nodeDrag = null
    return
  }

  if (connDrag) {
    const sr = scene.getBoundingClientRect()
    // Find input port within PORT_HIT distance (compare in scene-local coords)
    for (const n of state.nodes) {
      if (n.id === connDrag.fromNodeId) continue
      const el = main.querySelector(`.effect-node[data-node-id="${n.id}"]`)
      if (!el) continue
      const inPort = el.querySelector('.input-port')
      if (!inPort) continue
      const pr = inPort.getBoundingClientRect()
      const px = (pr.left + pr.width  / 2 - sr.left) / zoom.scale
      const py = (pr.top  + pr.height / 2 - sr.top)  / zoom.scale
      const dx = connDrag.liveX - px
      const dy = connDrag.liveY - py
      if (Math.sqrt(dx * dx + dy * dy) < PORT_HIT) {
        if (!wouldCreateCycle(connDrag.fromNodeId, n.id)) {
          if (n.inputFrom !== null) {
            // Target already has a primary chain input → cross-chain blend with mixer
            n.crossInput = { fromNodeId: connDrag.fromNodeId, mix: 0.5 }
            graphVersion++
          } else {
            // Target is a free root → intra-chain
            const fromRoot = chainRoot(state.nodes.find(nd => nd.id === connDrag.fromNodeId))
            if (n.marquee && fromRoot?.marquee) {
              // Both chains have marquees — connecting would discard one. Block and warn.
              showWarning(`Both chains have marquees — remove one before connecting.`)
              break
            }
            n.inputFrom = connDrag.fromNodeId
            normalizeChainMarquees(n)
            graphVersion++
          }
          updatePortStyles()
          updateOverlay()
          render()
        }
        break
      }
    }
    connDrag = null
    updateOverlay()
    return
  }

  if (marqueeEdit) {
    const node = state.nodes.find(n => n.id === marqueeEdit.nodeId)
    if (node && marqueeEdit.live) {
      node.marquee = normalizeMarquee(marqueeEdit.live)
      normalizeChainMarquees(node)
      marqueeSettled = true
      render()
    }
    marqueeEdit = null
    updateOverlay()
    return
  }

  if (marqueeDrag) {
    const live = marqueeDrag.live
    if (live && live.w > 3 && live.h > 3) {
      const node = state.nodes.find(n => n.id === state.selectedId)
      if (node) {
        node.marquee = { ...live }
        normalizeChainMarquees(node)
        marqueeSettled = true
        render()
      }
    }
    marqueeDrag = null
    updateOverlay()
    return
  }

})


// click on main background → deselect
main.addEventListener('click', e => {
  if (marqueeSettled) { marqueeSettled = false; return }
  if (!e.target.closest('.effect-node') && !e.target.closest('#canvas-wrap') && !e.target.closest('.mix-ctrl')) {
    if (state.selectedId !== null) selectNode(null)
  }
})

// ── Coordinate utils ─────────────────────────────────────
function screenToImage(sx, sy) {
  const r = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(canvas.width,  (sx - r.left) / r.width  * canvas.width)),
    y: Math.max(0, Math.min(canvas.height, (sy - r.top)  / r.height * canvas.height)),
  }
}

// imageToScene: converts image pixel coords to scene coords (canvas is at canvasX,canvasY)
function imageToScene(ix, iy) {
  return { x: canvasX + ix, y: canvasY + iy }
}

// ── SVG overlay ──────────────────────────────────────────
// All coordinates are in scene-local pixels (same space as node.x/y and the canvas).
// The SVG lives inside #scene so no screen-space conversion needed.
let overlayPending = false
function updateOverlay() {
  if (overlayPending) return
  overlayPending = true
  requestAnimationFrame(() => {
    overlayPending = false
    _updateOverlayImmediate()
  })
}
function _updateOverlayImmediate() {
  overlay.innerHTML = ''
  if (!state.image || canvas.hidden) return

  // canvas centre in scene space (fallback target for tethers before marquee exists)
  const canvasCX = canvasX + canvas.width  / 2
  const canvasCY = canvasY + canvas.height / 2

  // The active root is the chain root of the selected node — its marquee gets handles
  const selectedNode = state.nodes.find(n => n.id === state.selectedId)
  const activeRoot   = selectedNode ? chainRoot(selectedNode) : null

  for (const node of state.nodes) {
    const nodeCX = node.x + NODE_SZ / 2
    const nodeCY = node.y + NODE_SZ / 2
    const isSelected   = node.id === state.selectedId
    const isActiveRoot = activeRoot?.id === node.id

    // Show live edit for whichever node's marquee is being edited (not just selected)
    const editMq  = (marqueeEdit?.nodeId === node.id) ? marqueeEdit.live : null
    const ownMq   = editMq ?? ((isSelected && marqueeDrag?.live) ? marqueeDrag.live : node.marquee)
    const sharedMq = ownMq ?? effectiveMarquee(node)

    // default tether target: canvas centre
    let targetX = canvasCX
    let targetY = canvasCY

    if (sharedMq && sharedMq.w > 0 && sharedMq.h > 0) {
      // marquee coords in scene space
      const rx = canvasX + sharedMq.x
      const ry = canvasY + sharedMq.y
      const rw = sharedMq.w
      const rh = sharedMq.h

      const useRight = nodeCX > rx + rw / 2
      targetX = useRight ? rx + rw : rx
      targetY = ry

      if (ownMq) {
        const rect = document.createElementNS(SVG_NS, 'rect')
        rect.setAttribute('x', rx)
        rect.setAttribute('y', ry)
        rect.setAttribute('width', rw)
        rect.setAttribute('height', rh)
        rect.setAttribute('class', 'marquee-rect' + (isActiveRoot ? ' active' : ''))
        overlay.appendChild(rect)

        // Label: chain node names above the top-left corner
        const labelStr = chainSequence(node).map(n => n.toolId.slice(0, 4).toUpperCase()).join('.')
        const fontSize = 11
        const padX = 4, padY = 3
        const labelW = labelStr.length * 6.6 + padX * 2
        const labelH = fontSize + padY * 2

        const labelBg = document.createElementNS(SVG_NS, 'rect')
        labelBg.setAttribute('x', rx)
        labelBg.setAttribute('y', ry - labelH)
        labelBg.setAttribute('width', labelW)
        labelBg.setAttribute('height', labelH)
        labelBg.setAttribute('class', 'marquee-label-bg')
        overlay.appendChild(labelBg)

        const labelTxt = document.createElementNS(SVG_NS, 'text')
        labelTxt.setAttribute('x', rx + padX)
        labelTxt.setAttribute('y', ry - padY)
        labelTxt.setAttribute('class', 'marquee-label-text')
        labelTxt.textContent = labelStr
        overlay.appendChild(labelTxt)

        // Draw handles for the active chain root, regardless of which chain node is selected
        if (isActiveRoot) {
          const handles = [
            [rx,        ry],        [rx + rw / 2, ry],        [rx + rw, ry],
            [rx,        ry + rh / 2],                          [rx + rw, ry + rh / 2],
            [rx,        ry + rh],   [rx + rw / 2, ry + rh],   [rx + rw, ry + rh],
          ]
          for (const [hx, hy] of handles) {
            const handle = document.createElementNS(SVG_NS, 'rect')
            handle.setAttribute('x', hx - 3)
            handle.setAttribute('y', hy - 3)
            handle.setAttribute('width', 6)
            handle.setAttribute('height', 6)
            handle.setAttribute('class', 'marquee-handle')
            overlay.appendChild(handle)
          }
        }
      }
    }

    // Terminal node → tether to marquee corner
    if (sharedMq && isTerminalNode(node)) {
      const outX = node.x + NODE_SZ
      const outY = nodeCY
      const cx   = Math.max(40, Math.abs(targetX - outX) / 2)
      const tether = document.createElementNS(SVG_NS, 'path')
      tether.setAttribute('d', `M${outX},${outY} C${outX+cx},${outY} ${targetX-cx},${targetY} ${targetX},${targetY}`)
      tether.setAttribute('class', 'conn-line')
      overlay.appendChild(tether)
    }
  }

  // node-to-node bezier connections
  for (const node of state.nodes) {
    if (node.inputFrom === null) continue
    const from = state.nodes.find(n => n.id === node.inputFrom)
    if (!from) continue
    const x1 = from.x + NODE_SZ, y1 = from.y + NODE_SZ / 2
    const x2 = node.x,           y2 = node.y + NODE_SZ / 2
    const cx = Math.max(40, Math.abs(x2 - x1) / 2)
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', `M${x1},${y1} C${x1+cx},${y1} ${x2-cx},${y2} ${x2},${y2}`)
    path.setAttribute('class', 'conn-line')
    overlay.appendChild(path)
  }

  // cross-chain connections (dashed bezier)
  for (const node of state.nodes) {
    if (!node.crossInput) continue
    const from = state.nodes.find(n => n.id === node.crossInput.fromNodeId)
    if (!from) continue
    const x1 = from.x + NODE_SZ, y1 = from.y + NODE_SZ / 2
    const x2 = node.x,           y2 = node.y + NODE_SZ / 2
    const cx = Math.max(40, Math.abs(x2 - x1) / 2)
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', `M${x1},${y1} C${x1+cx},${y1} ${x2-cx},${y2} ${x2},${y2}`)
    path.setAttribute('class', 'cross-line')
    overlay.appendChild(path)
  }

  // live connection drag preview
  if (connDrag) {
    const from = state.nodes.find(n => n.id === connDrag.fromNodeId)
    if (from) {
      const x1 = from.x + NODE_SZ, y1 = from.y + NODE_SZ / 2
      const x2 = connDrag.liveX,   y2 = connDrag.liveY
      const cx = Math.max(40, Math.abs(x2 - x1) / 2)
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', `M${x1},${y1} C${x1+cx},${y1} ${x2-cx},${y2} ${x2},${y2}`)
      path.setAttribute('class', 'conn-line')
      overlay.appendChild(path)
    }
  }

  syncMixers()
  syncOpacityControls()
}

// ── Mixer UIs (cross-chain blend controls) ───────────────
function syncMixers() {
  // Remove mixers whose cross-chain connection no longer exists
  scene.querySelectorAll('.mix-ctrl').forEach(el => {
    const node = state.nodes.find(n => n.id === Number(el.dataset.nodeId))
    if (!node?.crossInput) el.remove()
  })

  for (const node of state.nodes) {
    if (!node.crossInput) continue
    const fromNode = state.nodes.find(n => n.id === node.crossInput.fromNodeId)
    if (!fromNode) continue

    // Position at bezier midpoint = average of the two port positions
    const x1 = fromNode.x + NODE_SZ, y1 = fromNode.y + NODE_SZ / 2
    const x2 = node.x,               y2 = node.y + NODE_SZ / 2
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2

    let ctrl = scene.querySelector(`.mix-ctrl[data-node-id="${node.id}"]`)
    if (!ctrl) {
      ctrl = document.createElement('div')
      ctrl.className      = 'mix-ctrl'
      ctrl.dataset.nodeId = node.id
      ctrl.innerHTML = `
        <input type="range" class="mix-range" min="0" max="100" step="1"
               value="${Math.round(node.crossInput.mix * 100)}">
        <span class="mix-val">${Math.round(node.crossInput.mix * 100)}%</span>
        <button class="mix-remove" title="disconnect">×</button>
      `
      // Prevent slider interaction from starting marquee/node drag
      ctrl.addEventListener('mousedown', e => e.stopPropagation())

      ctrl.querySelector('.mix-range').addEventListener('input', ev => {
        node.crossInput.mix = Number(ev.target.value) / 100
        ctrl.querySelector('.mix-val').textContent = ev.target.value + '%'
        render()
      })

      ctrl.querySelector('.mix-remove').addEventListener('click', ev => {
        ev.stopPropagation()
        node.crossInput = null
        ctrl.remove()
        updatePortStyles()
        updateOverlay()
        render()
      })

      scene.appendChild(ctrl)
    }

    ctrl.style.left = (mx - 52) + 'px'
    ctrl.style.top  = (my - 13) + 'px'
  }
}

// ── Chain render-order helpers ────────────────────────────
function moveChainUp(root) {
  const roots = state.nodes
    .filter(n => n.inputFrom === null && n.marquee)
    .sort((a, b) => (a.chainZ ?? 0) - (b.chainZ ?? 0))
  const idx = roots.indexOf(root)
  if (idx === -1 || idx === roots.length - 1) return
  const next = roots[idx + 1]
  ;[root.chainZ, next.chainZ] = [next.chainZ, root.chainZ]
  render(); updateOverlay()
}

function moveChainDown(root) {
  const roots = state.nodes
    .filter(n => n.inputFrom === null && n.marquee)
    .sort((a, b) => (a.chainZ ?? 0) - (b.chainZ ?? 0))
  const idx = roots.indexOf(root)
  if (idx === -1 || idx === 0) return
  const prev = roots[idx - 1]
  ;[root.chainZ, prev.chainZ] = [prev.chainZ, root.chainZ]
  render(); updateOverlay()
}

// ── Opacity controls (per marquee chain) ─────────────────
function syncOpacityControls() {
  // Remove orphaned controls
  scene.querySelectorAll('.opacity-ctrl').forEach(el => {
    const node = state.nodes.find(n => n.id === Number(el.dataset.nodeId))
    if (!node?.marquee) el.remove()
  })

  const fontSize = 11, padX = 4, padY = 3
  const labelH = fontSize + padY * 2

  for (const node of state.nodes) {
    if (!node.marquee) continue

    const isSelected = node.id === state.selectedId
    const editMq = (marqueeEdit?.nodeId === node.id) ? marqueeEdit.live : null
    const liveMq = editMq ?? ((isSelected && marqueeDrag?.live) ? marqueeDrag.live : node.marquee)
    if (!liveMq) continue

    const labelStr = chainSequence(node).map(n => n.toolId.slice(0, 4).toUpperCase()).join('.')
    const labelW   = labelStr.length * 6.6 + padX * 2
    const rx = canvasX + liveMq.x
    const ry = canvasY + liveMq.y

    let ctrl = scene.querySelector(`.opacity-ctrl[data-node-id="${node.id}"]`)
    if (!ctrl) {
      ctrl = document.createElement('div')
      ctrl.className      = 'opacity-ctrl'
      ctrl.dataset.nodeId = node.id
      ctrl.innerHTML = `
        <input type="range" min="0" max="100" step="1" value="${Math.round((node.marqueeOpacity ?? 1) * 100)}">
        <div class="order-btns">
          <button class="order-btn" data-dir="up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 15 12 7 20 15"/></svg></button>
          <button class="order-btn" data-dir="down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 9 12 17 20 9"/></svg></button>
        </div>
      `
      ctrl.addEventListener('mousedown', e => e.stopPropagation())
      ctrl.querySelector('input').addEventListener('input', ev => {
        node.marqueeOpacity = Number(ev.target.value) / 100
        render()
      })
      ctrl.querySelector('[data-dir="up"]').addEventListener('click', e => {
        e.stopPropagation(); moveChainUp(node)
      })
      ctrl.querySelector('[data-dir="down"]').addEventListener('click', e => {
        e.stopPropagation(); moveChainDown(node)
      })
      scene.appendChild(ctrl)
    }

    ctrl.querySelector('input').value = Math.round((node.marqueeOpacity ?? 1) * 100)
    ctrl.style.left   = (rx + labelW) + 'px'
    ctrl.style.top    = (ry - labelH) + 'px'
    ctrl.style.height = labelH + 'px'
  }
}

// ── Controls ─────────────────────────────────────────────
function renderControls() {
  const node = state.nodes.find(n => n.id === state.selectedId)
  if (!node) { controlsPanel.innerHTML = ''; return }

  // Show interpolated values when timeline is at a non-zero position
  const f = state.timeline.currentFrame
  const displayParams = { ...node.params }
  for (const [param, kfs] of Object.entries(node.animParams)) {
    if (kfs.length) displayParams[param] = interpolateAt(kfs, f)
  }

  controlsPanel.innerHTML = node.tool.renderControls(displayParams)

  controlsPanel.querySelectorAll('.option-group').forEach(group => {
    const param = group.dataset.param
    group.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.opt').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        node.params[param] = btn.dataset.value
        if (node.tool.onPresetSelect) {
          node.tool.onPresetSelect(param, btn.dataset.value, node.params)
          renderControls()
        }
        render()
      })
    })
  })

  controlsPanel.querySelectorAll('input[type="range"]').forEach(input => {
    const param = input.dataset.param, outId = input.dataset.output, sfx = input.dataset.suffix ?? ''
    input.addEventListener('input', () => {
      const val = Number(input.value)
      node.params[param] = val
      if (outId) document.getElementById(outId).value = input.value + sfx
      if (node.animParams[param]?.length) {
        addOrUpdateKeyframe(node, param, state.timeline.currentFrame, val)
        updateTimeline()
      }
      render()
    })
  })

  controlsPanel.querySelectorAll('input[type="color"]').forEach(input => {
    const param = input.dataset.param
    input.addEventListener('input', () => { node.params[param] = input.value; render() })
  })

  controlsPanel.querySelectorAll('input[type="checkbox"]').forEach(input => {
    const param = input.dataset.param
    input.addEventListener('change', () => { node.params[param] = input.checked; render() })
  })

  controlsPanel.querySelectorAll('textarea[data-param]').forEach(textarea => {
    const param = textarea.dataset.param
    textarea.addEventListener('input', () => { node.params[param] = textarea.value; render() })
  })

  // Inject ◎ anim-toggle into every range slider's label
  controlsPanel.querySelectorAll('input[type="range"][data-param]').forEach(input => {
    const param = input.dataset.param
    const label = input.closest('.control-group')?.querySelector('.control-label')
    if (!label) return

    const isAnimated = !!node.animParams[param]?.length
    const btn = document.createElement('button')
    btn.className   = 'anim-toggle' + (isAnimated ? ' active' : '')
    btn.title       = isAnimated ? 'animated — click to remove' : 'click to animate'
    btn.textContent = '◎'
    label.appendChild(btn)

    btn.addEventListener('click', () => {
      if (node.animParams[param]?.length) {
        delete node.animParams[param]
        computePreviewOverrides()
      } else {
        const cur = Number(input.value)
        const N   = state.anim.frames
        node.animParams[param] = [
          { frame: 0,     value: Number(input.min) },
          { frame: N - 1, value: Number(input.max) },
        ]
        selectedKf = { nodeId: node.id, param, frame: state.timeline.currentFrame }
      }
      updateTimeline()
      renderControls()
      render()
    })
  })
}

// ── Warning banner ───────────────────────────────────────
let warningTimer = null
function showWarning(msg) {
  let el = document.getElementById('app-warning')
  if (!el) {
    el = document.createElement('div')
    el.id = 'app-warning'
    el.innerHTML = '<span></span><button id="app-warning-close">×</button>'
    el.querySelector('button').addEventListener('click', clearWarning)
    main.appendChild(el)
  }
  el.querySelector('span').textContent = msg
  el.classList.add('visible')
  clearTimeout(warningTimer)
  warningTimer = setTimeout(clearWarning, 4000)
}

function clearWarning() {
  clearTimeout(warningTimer)
  document.getElementById('app-warning')?.classList.remove('visible')
}

// ── Status ───────────────────────────────────────────────
function updateStatusLabel() {
  const node = state.nodes.find(n => n.id === state.selectedId)
  if (node) {
    statusTool.textContent = node.tool.label
  } else if (state.nodes.length === 0) {
    statusTool.textContent = 'no effects'
  } else {
    statusTool.textContent = `${state.nodes.length} effect${state.nodes.length > 1 ? 's' : ''}`
  }
}

function updateStatusInfo() {
  const { naturalWidth: w, naturalHeight: h } = state.image ?? {}
  if (!w || !h) return
  const pct = Math.round(zoom.scale * 100)
  statusInfo.textContent = `${w} × ${h}px${pct !== 100 ? `  ${pct}%` : ''}`
}

// ── Off-screen frame render (used for GIF export) ────────
function renderImmediate(paramOverrides = new Map()) {
  if (!state.image) return null
  const iw = state.image.naturalWidth
  const ih = state.image.naturalHeight

  const scratch = new OffscreenCanvas(iw, ih)
  scratch.naturalWidth = iw; scratch.naturalHeight = ih
  const ctx = scratch.getContext('2d')
  ctx.drawImage(state.image, 0, 0)

  const sorted      = topoSort()
  const nodeOutputs = new Map()
  let   snap        = null
  const getSnap = () => {
    if (!snap) {
      snap = new OffscreenCanvas(iw, ih)
      snap.naturalWidth = iw; snap.naturalHeight = ih
      snap.getContext('2d').drawImage(scratch, 0, 0)
    }
    return snap
  }

  for (const node of sorted) {
    const mq = effectiveMarquee(node)
    const needed = state.nodes.some(n => n.inputFrom === node.id || n.crossInput?.fromNodeId === node.id)
    if (!needed && (!mq || mq.w < 1 || mq.h < 1)) continue

    const overrides = paramOverrides.get(node.id)
    const params    = overrides ? { ...node.params, ...overrides } : node.params

    let src = (node.inputFrom !== null && nodeOutputs.has(node.inputFrom))
      ? nodeOutputs.get(node.inputFrom) : getSnap()

    if (node.crossInput !== null && nodeOutputs.has(node.crossInput.fromNodeId)) {
      const crossSrc = nodeOutputs.get(node.crossInput.fromNodeId)
      const blended  = new OffscreenCanvas(iw, ih)
      blended.naturalWidth = iw; blended.naturalHeight = ih
      const bCtx = blended.getContext('2d')
      bCtx.drawImage(src, 0, 0)
      bCtx.globalAlpha = node.crossInput.mix
      bCtx.drawImage(crossSrc, 0, 0)
      bCtx.globalAlpha = 1
      src = blended
    }

    const eff = new OffscreenCanvas(iw, ih)
    eff.naturalWidth = iw; eff.naturalHeight = ih
    node.tool.render(src, params, eff, effectiveMarquee(node))
    nodeOutputs.set(node.id, eff)
  }

  // Composite chains in chainZ order
  const chainGroupMap = new Map()
  for (const node of sorted) {
    const root = chainRoot(node)
    if (!chainGroupMap.has(root.id)) chainGroupMap.set(root.id, [])
    chainGroupMap.get(root.id).push(node)
  }
  const compositeSorted = [...chainGroupMap.entries()]
    .sort(([aId], [bId]) => {
      const aZ = state.nodes.find(n => n.id === aId)?.chainZ ?? 0
      const bZ = state.nodes.find(n => n.id === bId)?.chainZ ?? 0
      return aZ - bZ
    })
    .flatMap(([, nodes]) => nodes)

  for (const node of compositeSorted) {
    const eff = nodeOutputs.get(node.id)
    if (!eff) continue
    const mq = effectiveMarquee(node)
    if (!mq || mq.w < 1 || mq.h < 1) continue
    const root     = chainRoot(node)
    const terminal = chainSequence(root).at(-1)
    if (terminal?.tool?.id !== 'text' && !isTerminalNode(node)) continue
    ctx.globalAlpha = root.marqueeOpacity ?? 1
    ctx.drawImage(eff, mq.x, mq.y, mq.w, mq.h, mq.x, mq.y, mq.w, mq.h)
  }
  ctx.globalAlpha = 1
  return ctx.getImageData(0, 0, iw, ih)
}

async function exportGif() {
  if (!state.image) return

  const { frames: frameCount, fps } = state.anim
  const iw = state.image.naturalWidth
  const ih = state.image.naturalHeight

  btnGif.disabled = true
  const gifFrames = []

  for (let f = 0; f < frameCount; f++) {
    showWarning(`rendering frame ${f + 1} / ${frameCount}…`)

    const paramOverrides = new Map()
    for (const node of state.nodes) {
      const ap = node.animParams
      if (!ap || !Object.keys(ap).length) continue
      const ov = {}
      for (const [param, kfs] of Object.entries(ap)) {
        if (kfs.length) ov[param] = interpolateAt(kfs, f)
      }
      if (Object.keys(ov).length) paramOverrides.set(node.id, ov)
    }

    const imgData = renderImmediate(paramOverrides)
    if (imgData) gifFrames.push(imgData)

    if (f % 3 === 2) await new Promise(r => setTimeout(r, 0))
  }

  showWarning(`encoding gif…`)
  await new Promise(r => setTimeout(r, 0))

  try {
    const data = await encodeGIF(gifFrames, {
      fps, loop: true,
      onProgress: (done, total) => showWarning(`encoding gif… ${done}/${total}`),
    })
    const blob = new Blob([data], { type: 'image/gif' })
    const a    = document.createElement('a')
    a.download = 'trn-frm-output.gif'
    a.href     = URL.createObjectURL(blob)
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  } catch (e) {
    showWarning('gif export failed: ' + e.message)
  }

  clearWarning()
  btnGif.disabled = false
}

// ── Render pipeline ──────────────────────────────────────
let renderPending = false

// Node output cache — avoids re-running effects whose params and upstream haven't changed
const nodeOutputCache = new Map() // nodeId → { key, canvas, epoch, iw, ih }
let   renderEpoch     = 0         // bumped whenever the source image changes
function invalidateRenderCache() { renderEpoch++; nodeOutputCache.clear() }

function render() {
  if (!state.image) return
  if (renderPending) return
  renderPending = true

  requestAnimationFrame(() => {
    renderPending = false
    const iw = state.image.naturalWidth
    const ih = state.image.naturalHeight

    // Only reset canvas dimensions when they actually change (avoids clearing the context)
    if (canvas.width !== iw || canvas.height !== ih) {
      canvas.width  = iw
      canvas.height = ih
    }
    const ctx = canvas.getContext('2d')
    ctx.drawImage(state.image, 0, 0)

    // Process every node in dependency order (topoSort already places cross-chain
    // sources before their consumers, so nodeOutputs is always populated in time).
    const sorted      = topoSort()
    const nodeOutputs = new Map()
    const renderedIds = new Set() // tracks which nodes were actually re-rendered this pass

    // Shared canvas snapshot reused for all chain-root src copies (avoids N allocations)
    let canvasSnapshot = null
    const getSnapshot = () => {
      if (!canvasSnapshot) {
        canvasSnapshot = new OffscreenCanvas(iw, ih)
        canvasSnapshot.naturalWidth = iw; canvasSnapshot.naturalHeight = ih
        canvasSnapshot.getContext('2d').drawImage(canvas, 0, 0)
      }
      return canvasSnapshot
    }

    for (const node of sorted) {
      // Skip nodes that have no marquee and no one downstream needs their output
      const mq            = effectiveMarquee(node)
      const neededByOther = state.nodes.some(
        n => n.inputFrom === node.id || n.crossInput?.fromNodeId === node.id)
      if (!neededByOther && (!mq || mq.w < 1 || mq.h < 1)) continue

      // Cache check — skip re-rendering if params and upstream are unchanged
      const upstreamChanged = (node.inputFrom  !== null && renderedIds.has(node.inputFrom))
                           || (node.crossInput !== null && renderedIds.has(node.crossInput.fromNodeId))
      const cached   = nodeOutputCache.get(node.id)
      const mq_      = effectiveMarquee(node)
      const mqKey    = mq_ ? `${mq_.x},${mq_.y},${mq_.w},${mq_.h}` : ''
      const previewOv    = previewOverrides.get(node.id)
      const activeParams = previewOv ? { ...node.params, ...previewOv } : node.params
      const paramKey = JSON.stringify(activeParams) + '|' + (node.crossInput?.mix ?? '') + '|' + mqKey
      if (cached && cached.paramKey === paramKey && cached.epoch === renderEpoch
          && cached.iw === iw && cached.ih === ih && !upstreamChanged) {
        nodeOutputs.set(node.id, cached.canvas)
        continue
      }

      // Primary source: upstream intra-chain output or current canvas state
      let src
      if (node.inputFrom !== null && nodeOutputs.has(node.inputFrom)) {
        src = nodeOutputs.get(node.inputFrom)
      } else {
        src = getSnapshot()
      }

      // Cross-chain blend: mix in the other chain's output before applying this node's effect
      if (node.crossInput !== null && nodeOutputs.has(node.crossInput.fromNodeId)) {
        const crossSrc = nodeOutputs.get(node.crossInput.fromNodeId)
        const blended  = new OffscreenCanvas(iw, ih)
        blended.naturalWidth = iw; blended.naturalHeight = ih
        const bCtx = blended.getContext('2d')
        bCtx.drawImage(src, 0, 0)
        bCtx.globalAlpha = node.crossInput.mix
        bCtx.drawImage(crossSrc, 0, 0)
        bCtx.globalAlpha = 1
        src = blended
      }

      // Reuse cached canvas if dimensions match, otherwise allocate a new one
      let eff = cached?.canvas
      if (!eff || eff.width !== iw || eff.height !== ih) {
        eff = new OffscreenCanvas(iw, ih)
        eff.naturalWidth = iw; eff.naturalHeight = ih
      }
      node.tool.render(src, activeParams, eff, effectiveMarquee(node))
      nodeOutputs.set(node.id, eff)
      nodeOutputCache.set(node.id, { paramKey, canvas: eff, epoch: renderEpoch, iw, ih })
      renderedIds.add(node.id)
    }

    // Composite in chainZ order (lower = behind, higher = in front).
    // Group sorted nodes by chain root, then order the groups by chainZ.
    const chainGroupMap = new Map()
    for (const node of sorted) {
      const root = chainRoot(node)
      if (!chainGroupMap.has(root.id)) chainGroupMap.set(root.id, [])
      chainGroupMap.get(root.id).push(node)
    }
    const compositeSorted = [...chainGroupMap.entries()]
      .sort(([aId], [bId]) => {
        const aZ = (state.nodes.find(n => n.id === aId)?.chainZ ?? 0)
        const bZ = (state.nodes.find(n => n.id === bId)?.chainZ ?? 0)
        return aZ - bZ
      })
      .flatMap(([, nodes]) => nodes)

    for (const node of compositeSorted) {
      const eff = nodeOutputs.get(node.id)
      if (!eff) continue
      const mq = effectiveMarquee(node)
      if (!mq || mq.w < 1 || mq.h < 1) continue
      // If the chain's terminal node is a text node, composite every node in the
      // chain (background effects render first, text overlays on top). Otherwise
      // only composite the terminal so intermediate outputs aren't double-drawn.
      const root     = chainRoot(node)
      const terminal = chainSequence(root).at(-1)
      const textTerminal = terminal?.tool?.id === 'text'
      if (!textTerminal && !isTerminalNode(node)) continue
      ctx.globalAlpha = root.marqueeOpacity ?? 1
      ctx.drawImage(eff, mq.x, mq.y, mq.w, mq.h, mq.x, mq.y, mq.w, mq.h)
    }
    ctx.globalAlpha = 1

    canvas.hidden   = false
    dropzone.hidden = true
    updateStatusInfo()
    updateOverlay()
  })
}

// ── Image loading ────────────────────────────────────────
function loadImage(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    if (state.image) URL.revokeObjectURL(state.image.src)
    state.image = img
    invalidateRenderCache()
    // Centre canvas in the scene
    canvasX = Math.round((SCENE_W - img.naturalWidth)  / 2)
    canvasY = Math.round((SCENE_H - img.naturalHeight) / 2)
    canvas.style.left = canvasX + 'px'
    canvas.style.top  = canvasY + 'px'
    dropzone.hidden   = true
    canvas.hidden     = false
    btnSave.disabled  = false
    btnGif.disabled   = false
    stopPlay()
    state.timeline.currentFrame = 0
    previewOverrides.clear()
    resetZoom()
    render()
    updateTimeline()
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

// ── Export ───────────────────────────────────────────────
function save() {
  if (!state.image) return
  const a = document.createElement('a')
  a.download = 'trn-frm-output.png'
  a.href     = canvas.toDataURL('image/png')
  a.click()
}

// ── Timeline functions ───────────────────────────────────

function interpolateAt(keyframes, frame) {
  if (!keyframes?.length) return null
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame)
  if (frame <= sorted[0].frame) return sorted[0].value
  if (frame >= sorted.at(-1).frame) return sorted.at(-1).value
  for (let i = 0; i < sorted.length - 1; i++) {
    if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) {
      const t = (frame - sorted[i].frame) / (sorted[i + 1].frame - sorted[i].frame)
      return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * t
    }
  }
  return sorted.at(-1).value
}

function computePreviewOverrides() {
  previewOverrides.clear()
  const f = state.timeline.currentFrame
  for (const node of state.nodes) {
    const ov = {}
    for (const [param, kfs] of Object.entries(node.animParams)) {
      if (kfs.length) ov[param] = interpolateAt(kfs, f)
    }
    if (Object.keys(ov).length) previewOverrides.set(node.id, ov)
  }
}

function addOrUpdateKeyframe(node, param, frame, value) {
  if (!node.animParams[param]) node.animParams[param] = []
  const kfs = node.animParams[param]
  const existing = kfs.find(k => k.frame === frame)
  if (existing) { existing.value = value } else { kfs.push({ frame, value }) }
  kfs.sort((a, b) => a.frame - b.frame)
}

function updatePlayhead() {
  const N   = state.anim.frames
  const f   = state.timeline.currentFrame
  const pct = N > 1 ? (f / (N - 1)) * 100 : 0
  tlPlayheadLine.style.left = pct + '%'
  tlFrameNum.textContent    = `${f + 1} / ${N}`
}

function setCurrentFrame(f) {
  const N = state.anim.frames
  state.timeline.currentFrame = Math.max(0, Math.min(N - 1, f))
  computePreviewOverrides()
  renderPending = false   // bypass debounce so every frame scrub renders
  render()
  updatePlayhead()
}

let playLastTime = 0
function playTick(time) {
  if (!state.timeline.playing) return
  const msPerFrame = 1000 / state.anim.fps
  if (time - playLastTime >= msPerFrame) {
    playLastTime = time
    setCurrentFrame((state.timeline.currentFrame + 1) % state.anim.frames)
  }
  state.timeline.playRafId = requestAnimationFrame(playTick)
}

function startPlay() {
  state.timeline.playing = true
  playLastTime = 0
  tlPlayBtn.textContent = '■'
  state.timeline.playRafId = requestAnimationFrame(playTick)
}

function stopPlay() {
  state.timeline.playing = false
  cancelAnimationFrame(state.timeline.playRafId)
  tlPlayBtn.textContent = '▶'
}

function buildRuler() {
  tlRulerLane.innerHTML = ''
  const N = state.anim.frames
  const step = N <= 20 ? 1 : N <= 60 ? 5 : 10
  for (let f = 0; f < N; f++) {
    const pct   = N > 1 ? (f / (N - 1)) * 100 : 0
    const major = f === 0 || f === N - 1 || f % step === 0
    const tick  = document.createElement('div')
    tick.className = 'tl-tick' + (major ? ' tl-tick-major' : '')
    tick.style.left = pct + '%'
    tlRulerLane.appendChild(tick)
    if (major) {
      const lbl = document.createElement('span')
      lbl.className   = 'tl-tick-lbl'
      lbl.style.left  = pct + '%'
      lbl.textContent = f + 1
      tlRulerLane.appendChild(lbl)
    }
  }
}

function buildTracks() {
  tlTracks.innerHTML = ''
  const N       = state.anim.frames
  const hasAnim = state.nodes.some(n => Object.values(n.animParams).some(k => k.length))

  if (!hasAnim) {
    const hint = document.createElement('div')
    hint.id          = 'tl-empty-hint'
    hint.textContent = 'select a node and click ◎ on a slider to animate it'
    tlTracks.appendChild(hint)
    return
  }

  for (const node of state.nodes) {
    for (const [param, keyframes] of Object.entries(node.animParams)) {
      if (!keyframes.length) continue

      const row = document.createElement('div')
      row.className = 'tl-row'

      const labelEl = document.createElement('div')
      labelEl.className   = 'tl-track-label'
      labelEl.textContent = `${node.toolId.slice(0, 4).toUpperCase()} · ${param}`
      labelEl.title       = labelEl.textContent
      row.appendChild(labelEl)

      const lane = document.createElement('div')
      lane.className = 'tl-track-lane'

      lane.addEventListener('click', e => {
        if (kfDrag) return
        const rect = lane.getBoundingClientRect()
        const t    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const f    = Math.round(t * (N - 1))
        const val  = interpolateAt(keyframes, f) ?? node.params[param]
        addOrUpdateKeyframe(node, param, f, val)
        selectedKf = { nodeId: node.id, param, frame: f }
        setCurrentFrame(f)
        updateTimeline()
        renderControls()
      })

      for (const kf of keyframes) {
        const pct        = N > 1 ? (kf.frame / (N - 1)) * 100 : 0
        const isSelected = selectedKf?.nodeId === node.id
          && selectedKf?.param === param && selectedKf?.frame === kf.frame
        const diamond = document.createElement('div')
        diamond.className = 'tl-kf' + (isSelected ? ' selected' : '')
        diamond.style.left = pct + '%'
        diamond.title      = `frame ${kf.frame + 1}: ${+(kf.value.toFixed(2))}`

        diamond.addEventListener('click', e => {
          e.stopPropagation()
          selectedKf = { nodeId: node.id, param, frame: kf.frame }
          setCurrentFrame(kf.frame)
          updateTimeline()
        })

        diamond.addEventListener('mousedown', e => {
          e.preventDefault()
          e.stopPropagation()
          kfDrag = { nodeId: node.id, param, frame: kf.frame, laneEl: lane, diamondEl: diamond }
        })

        lane.appendChild(diamond)
      }

      row.appendChild(lane)
      tlTracks.appendChild(row)
    }
  }
}

function updateTimeline() {
  buildRuler()
  buildTracks()
  updatePlayhead()
}

// Ruler click → scrub
tlRulerLane.addEventListener('click', e => {
  const N    = state.anim.frames
  const rect = tlRulerLane.getBoundingClientRect()
  const t    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  setCurrentFrame(Math.round(t * (N - 1)))
})

// Play button
tlPlayBtn.addEventListener('click', () => {
  if (state.timeline.playing) stopPlay(); else startPlay()
})

// Keyframe drag (uses the existing global mousemove/mouseup)
window.addEventListener('mousemove', e => {
  if (!kfDrag) return
  const node = state.nodes.find(n => n.id === kfDrag.nodeId)
  if (!node) { kfDrag = null; return }
  const N    = state.anim.frames
  const rect = kfDrag.laneEl.getBoundingClientRect()
  const t    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const newF = Math.round(t * (N - 1))
  if (newF === kfDrag.frame) return

  const kfs   = node.animParams[kfDrag.param]
  const kfObj = kfs?.find(k => k.frame === kfDrag.frame)
  if (!kfObj) return

  // Don't collide with another keyframe
  if (kfs.some(k => k.frame === newF && k !== kfObj)) return

  kfObj.frame  = newF
  kfDrag.frame = newF
  if (selectedKf?.nodeId === kfDrag.nodeId && selectedKf?.param === kfDrag.param) {
    selectedKf.frame = newF
  }
  kfs.sort((a, b) => a.frame - b.frame)

  // Reposition diamond without full rebuild
  const pct = N > 1 ? (newF / (N - 1)) * 100 : 0
  kfDrag.diamondEl.style.left = pct + '%'
  kfDrag.diamondEl.title      = `frame ${newF + 1}: ${+(kfObj.value.toFixed(2))}`

  setCurrentFrame(newF)
})

window.addEventListener('mouseup', () => {
  if (kfDrag) { kfDrag = null; updateTimeline() }
})

// ── Anim panel wiring ────────────────────────────────────
animFramesEl.addEventListener('input', () => {
  state.anim.frames   = Number(animFramesEl.value)
  animOutFrames.value = animFramesEl.value
  // Clamp current frame to new range
  state.timeline.currentFrame = Math.min(state.timeline.currentFrame, state.anim.frames - 1)
  updateTimeline()
})
animFpsEl.addEventListener('input', () => {
  state.anim.fps    = Number(animFpsEl.value)
  animOutFps.value  = animFpsEl.value
})
btnGif.addEventListener('click', exportGif)

// ── Drag: toolbox → main area ────────────────────────────
toolNav.addEventListener('dragstart', e => {
  const item = e.target.closest('.tool-box:not(.wip)')
  if (!item) { e.preventDefault(); return }
  e.dataTransfer.setData('tool', item.dataset.tool)
  e.dataTransfer.effectAllowed = 'copy'
})

main.addEventListener('dragover', e => {
  e.preventDefault()
  if (!e.dataTransfer.types.includes('tool')) {
    canvasWrap.classList.add('drag-over')
    dropzone.classList.add('drag-over')
  }
})

main.addEventListener('dragleave', e => {
  if (!main.contains(e.relatedTarget)) {
    canvasWrap.classList.remove('drag-over')
    dropzone.classList.remove('drag-over')
  }
})

main.addEventListener('drop', e => {
  e.preventDefault()
  canvasWrap.classList.remove('drag-over')
  dropzone.classList.remove('drag-over')
  const toolId = e.dataTransfer.getData('tool')
  if (toolId) {
    const sr = scene.getBoundingClientRect()
    createNode(toolId, (e.clientX - sr.left) / zoom.scale, (e.clientY - sr.top) / zoom.scale)
  } else if (e.dataTransfer.files[0]?.type.startsWith('image/')) {
    loadImage(e.dataTransfer.files[0])
  }
})

dropzone.addEventListener('click', () => fileInput.click())

// ── File open / save ─────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => fileInput.click())
btnSave.addEventListener('click', save)

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0])
  fileInput.value = ''
})

// ── Keyboard ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.selectedId !== null) {
    if (!e.target.matches('input, textarea')) { selectNode(null); return }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea')) {
    if (selectedKf) {
      const node = state.nodes.find(n => n.id === selectedKf.nodeId)
      if (node?.animParams[selectedKf.param]) {
        node.animParams[selectedKf.param] = node.animParams[selectedKf.param]
          .filter(k => k.frame !== selectedKf.frame)
        if (!node.animParams[selectedKf.param].length) delete node.animParams[selectedKf.param]
        selectedKf = null
        computePreviewOverrides()
        render()
        updateTimeline()
        renderControls()
      }
      return
    }
    if (state.selectedId !== null) { removeNode(state.selectedId); return }
  }
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.key === 'o') { e.preventDefault(); fileInput.click() }
  if (e.key === 's') { e.preventDefault(); save() }
})

// ── Overlay toggle ────────────────────────────────────────
let overlayVisible = true
const overlayToggle = document.getElementById('overlay-toggle')

overlayToggle.addEventListener('click', () => {
  overlayVisible = !overlayVisible
  overlay.style.display = overlayVisible ? '' : 'none'
  document.querySelectorAll('.effect-node, .mix-ctrl, .opacity-ctrl').forEach(el => {
    el.style.display = overlayVisible ? '' : 'none'
  })
  overlayToggle.classList.toggle('off', !overlayVisible)
})

// ── Grid ─────────────────────────────────────────────────
const gridToggle = document.getElementById('grid-toggle')
gridToggle.classList.add('off')

gridToggle.addEventListener('click', () => {
  const on = main.classList.toggle('show-grid')
  gridToggle.classList.toggle('off', !on)
})

// ── Theme ─────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle')
const root        = document.documentElement

function applyTheme(theme) {
  root.dataset.theme = theme
  localStorage.setItem('trn-theme', theme)
}

themeToggle.addEventListener('click', () => {
  applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light')
})

applyTheme(localStorage.getItem('trn-theme') ?? 'dark')

// ── Init ─────────────────────────────────────────────────
sceneSizer.style.width  = SCENE_W + 'px'
sceneSizer.style.height = SCENE_H + 'px'
updateStatusLabel()
updateTimeline()
