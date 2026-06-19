import dithering  from './tools/dithering.js'
import ascii      from './tools/ascii.js'
import edge       from './tools/edge.js'
import stippling  from './tools/stippling.js'
import dots       from './tools/dots.js'
import patterns   from './tools/patterns.js'
import recolor    from './tools/recolor.js'
import distort    from './tools/distort.js'
import displace   from './tools/displace.js'
import bevel      from './tools/bevel.js'
import scatter    from './tools/scatter.js'
import cellular   from './tools/cellular.js'
import gradients  from './tools/gradients.js'
import crt        from './tools/crt.js'

const TOOLS    = {
  dithering, ascii, edge, stippling, dots, patterns,
  distort, displace, bevel, recolor, scatter, cellular,
  gradients, crt,
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
}

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
    marquee:    null,
    inputFrom:  null,
    crossInput: null,   // { fromNodeId, mix: 0-1 } — cross-chain blend
  }
  state.nodes.push(node)

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
  scene.querySelectorAll(`.mix-ctrl[data-node-id="${id}"]`).forEach(el => el.remove())
  main.querySelector(`.effect-node[data-node-id="${id}"]`)?.remove()
  state.nodes = state.nodes.filter(n => n.id !== id)
  state.nodes.forEach(n => {
    if (n.inputFrom === id) n.inputFrom = null
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

function topoSort() {
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

function updateNodeHint(node) {
  const el = main.querySelector(`.effect-node[data-node-id="${node.id}"]`)
  const hint = el?.querySelector('.node-hint')
  if (!hint) return
  const isSelected = node.id === state.selectedId
  hint.hidden = !isSelected || node.inputFrom !== null || !!node.marquee
}

function normalizeChainMarquees(node) {
  // Each node keeps its own marquee; just refresh hints for the whole chain.
  const root  = chainRoot(node)
  const group = connectedNodes(root)
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

  // Only start marquee when pressing on the canvas element itself
  const cr = canvas.getBoundingClientRect()
  if (e.clientX < cr.left || e.clientX > cr.right ||
      e.clientY < cr.top  || e.clientY > cr.bottom) return

  e.preventDefault()
  const ip = screenToImage(e.clientX, e.clientY)

  const hit = marqueeHit(sel, e.clientX, e.clientY)
  if (hit) {
    marqueeEdit = {
      nodeId: sel.id,
      mode: hit,
      startIx: ip.x,
      startIy: ip.y,
      original: { ...sel.marquee },
      live: { ...sel.marquee },
    }
    return
  }

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
  const hit = node ? marqueeHit(node, e.clientX, e.clientY) : null
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
    updateOverlay()
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
          } else {
            // Target is a free root → intra-chain, each node keeps its own marquee
            n.inputFrom = connDrag.fromNodeId
            normalizeChainMarquees(n)
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
function updateOverlay() {
  overlay.innerHTML = ''
  if (!state.image || canvas.hidden) return

  // canvas centre in scene space (fallback target for tethers before marquee exists)
  const canvasCX = canvasX + canvas.width  / 2
  const canvasCY = canvasY + canvas.height / 2

  for (const node of state.nodes) {
    const nodeCX = node.x + NODE_SZ / 2
    const nodeCY = node.y + NODE_SZ / 2
    const isSelected = node.id === state.selectedId

    const editMq  = (isSelected && marqueeEdit?.nodeId === node.id) ? marqueeEdit.live : null
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
        rect.setAttribute('class', 'marquee-rect' + (isSelected ? ' active' : ''))
        overlay.appendChild(rect)

        if (isSelected) {
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

// ── Controls ─────────────────────────────────────────────
function renderControls() {
  const node = state.nodes.find(n => n.id === state.selectedId)
  if (!node) { controlsPanel.innerHTML = ''; return }

  controlsPanel.innerHTML = node.tool.renderControls(node.params)

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
      node.params[param] = Number(input.value)
      if (outId) document.getElementById(outId).value = input.value + sfx
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

// ── Render pipeline ──────────────────────────────────────
let renderPending = false

function render() {
  if (!state.image) return
  if (renderPending) return
  renderPending = true

  requestAnimationFrame(() => {
    renderPending = false
    const iw = state.image.naturalWidth
    const ih = state.image.naturalHeight
    canvas.width  = iw
    canvas.height = ih
    const ctx = canvas.getContext('2d')
    ctx.drawImage(state.image, 0, 0)

    // Process every node in dependency order (topoSort already places cross-chain
    // sources before their consumers, so nodeOutputs is always populated in time).
    const sorted      = topoSort()
    const nodeOutputs = new Map()
    const renderedIds = new Set()

    for (const node of sorted) {
      // Skip nodes that have no marquee and no one downstream needs their output
      const mq           = effectiveMarquee(node)
      const neededByOther = state.nodes.some(
        n => n.inputFrom === node.id || n.crossInput?.fromNodeId === node.id)
      if (!neededByOther && (!mq || mq.w < 1 || mq.h < 1)) continue

      // Primary source: upstream intra-chain output or current canvas state
      let src
      if (node.inputFrom !== null && nodeOutputs.has(node.inputFrom)) {
        src = nodeOutputs.get(node.inputFrom)
      } else {
        src = new OffscreenCanvas(iw, ih)
        src.naturalWidth = iw; src.naturalHeight = ih
        src.getContext('2d').drawImage(canvas, 0, 0)
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

      const eff = new OffscreenCanvas(iw, ih)
      eff.naturalWidth = iw; eff.naturalHeight = ih
      node.tool.render(src, node.params, eff)
      nodeOutputs.set(node.id, eff)
      renderedIds.add(node.id)
    }

    // Composite terminal nodes (no intra-chain children) to the visible canvas
    for (const node of sorted) {
      const eff = nodeOutputs.get(node.id)
      if (!eff || hasRenderedChild(node, renderedIds)) continue
      const mq = effectiveMarquee(node)
      if (!mq || mq.w < 1 || mq.h < 1) continue
      ctx.drawImage(eff, mq.x, mq.y, mq.w, mq.h, mq.x, mq.y, mq.w, mq.h)
    }

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
    // Centre canvas in the scene
    canvasX = Math.round((SCENE_W - img.naturalWidth)  / 2)
    canvasY = Math.round((SCENE_H - img.naturalHeight) / 2)
    canvas.style.left = canvasX + 'px'
    canvas.style.top  = canvasY + 'px'
    dropzone.hidden   = true
    canvas.hidden     = false
    btnSave.disabled  = false
    resetZoom()
    render()
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
  if (e.key === 'Escape' && state.selectedId !== null) { selectNode(null); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId !== null) {
    if (!e.target.matches('input, textarea')) { removeNode(state.selectedId); return }
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
  document.querySelectorAll('.effect-node, .mix-ctrl').forEach(el => {
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
