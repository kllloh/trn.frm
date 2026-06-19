import dithering  from './tools/dithering.js'
import recolor    from './tools/recolor.js'
import distort    from './tools/distort.js'
import gradients  from './tools/gradients.js'

// ── Tool registry ────────────────────────────────────────
const TOOLS = { dithering, recolor, distort, gradients }

// ── State ────────────────────────────────────────────────
const state = {
  image:      null,
  slots:      [null, null, null, null], // { tool, params, amount }
  activeSlot: null,
}

// ── DOM refs ─────────────────────────────────────────────
const toolNav       = document.getElementById('tool-nav')
const controlsPanel = document.getElementById('controls-panel')
const dropzone      = document.getElementById('dropzone')
const canvas        = document.getElementById('output-canvas')
const canvasWrap    = document.getElementById('canvas-wrap')
const fileInput     = document.getElementById('file-input')
const btnSave       = document.getElementById('btn-save')
const statusTool    = document.getElementById('status-tool').querySelector('span')
const statusInfo    = document.getElementById('status-info')
const slotEls       = [...document.querySelectorAll('.slot')]
const sliderEls     = [...document.querySelectorAll('.slot-amount')]
const clearBtnEls   = [...document.querySelectorAll('.slot-clear')]

// ── Slot management ──────────────────────────────────────
function addToSlot(idx, toolId) {
  const tool = TOOLS[toolId]
  if (!tool) return
  state.slots[idx] = { tool, params: { ...tool.defaultParams }, amount: 100 }
  syncSliderValue(idx, 100)
  selectSlot(idx)
  updateSlotUI(idx)
  render()
}

function clearSlot(idx) {
  state.slots[idx] = null
  if (state.activeSlot === idx) {
    state.activeSlot = null
    renderControls()
    updateStatusLabel()
  }
  updateSlotUI(idx)
  render()
}

function selectSlot(idx) {
  if (state.slots[idx] === null) return
  state.activeSlot = idx
  slotEls.forEach((el, i) => el.classList.toggle('selected', i === idx))
  renderControls()
  updateStatusLabel()
}

function syncSliderValue(idx, val) {
  const slider = sliderEls.find(s => Number(s.dataset.slot) === idx)
  if (slider) slider.value = val
}

function updateSlotUI(idx) {
  const slotEl    = slotEls[idx]
  const labelEl   = slotEl.querySelector('.slot-label')
  const clearBtn  = clearBtnEls[idx]
  const slot      = state.slots[idx]

  slotEl.classList.toggle('filled', !!slot)
  if (!slot) {
    slotEl.classList.remove('selected')
    labelEl.textContent = ''
    clearBtn.hidden = true
  } else {
    labelEl.textContent = slot.tool.id.slice(0, 4).toUpperCase()
    clearBtn.hidden = false
  }
}

function updateStatusLabel() {
  const slot = state.activeSlot !== null ? state.slots[state.activeSlot] : null
  const activeCount = state.slots.filter(Boolean).length
  if (slot) {
    statusTool.textContent = slot.tool.label
  } else if (activeCount === 0) {
    statusTool.textContent = 'no effects'
  } else {
    statusTool.textContent = `${activeCount} effect${activeCount > 1 ? 's' : ''}`
  }
}

// ── Controls ─────────────────────────────────────────────
function renderControls() {
  const slot = state.activeSlot !== null ? state.slots[state.activeSlot] : null
  if (!slot) { controlsPanel.innerHTML = ''; return }

  const { tool, params } = slot
  controlsPanel.innerHTML = tool.renderControls(params)

  controlsPanel.querySelectorAll('.option-group').forEach(group => {
    const param = group.dataset.param
    group.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.opt').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        slot.params[param] = btn.dataset.value
        if (tool.onPresetSelect) {
          tool.onPresetSelect(param, btn.dataset.value, slot.params)
          renderControls()
        }
        render()
      })
    })
  })

  controlsPanel.querySelectorAll('input[type="range"]').forEach(input => {
    const param  = input.dataset.param
    const outId  = input.dataset.output
    const suffix = input.dataset.suffix ?? ''
    input.addEventListener('input', () => {
      slot.params[param] = Number(input.value)
      if (outId) document.getElementById(outId).value = input.value + suffix
      render()
    })
  })

  controlsPanel.querySelectorAll('input[type="color"]').forEach(input => {
    const param = input.dataset.param
    input.addEventListener('input', () => {
      slot.params[param] = input.value
      render()
    })
  })

  controlsPanel.querySelectorAll('input[type="checkbox"]').forEach(input => {
    const param = input.dataset.param
    input.addEventListener('change', () => {
      slot.params[param] = input.checked
      render()
    })
  })
}

// ── Pipeline render ──────────────────────────────────────
let renderPending = false

function render() {
  if (!state.image) return
  if (renderPending) return
  renderPending = true

  requestAnimationFrame(() => {
    renderPending = false

    const activeSlots = state.slots.filter(Boolean)

    if (activeSlots.length === 0) {
      // draw source directly
      canvas.width  = state.image.naturalWidth
      canvas.height = state.image.naturalHeight
      canvas.getContext('2d').drawImage(state.image, 0, 0)
      canvas.hidden = false
      dropzone.hidden = true
      updateStatusInfo()
      return
    }

    // chain effects through OffscreenCanvas instances
    let currentSource = state.image

    for (let i = 0; i < state.slots.length; i++) {
      const slot = state.slots[i]
      if (!slot) continue

      const iw = currentSource.naturalWidth ?? currentSource.width
      const ih = currentSource.naturalHeight ?? currentSource.height
      const offscreen = new OffscreenCanvas(iw, ih)
      // expose naturalWidth/naturalHeight so tools can read them directly
      offscreen.naturalWidth  = iw
      offscreen.naturalHeight = ih

      slot.tool.render(currentSource, slot.params, offscreen)

      // blend with original source at slot.amount opacity
      if (slot.amount < 100) {
        const origCtx = new OffscreenCanvas(iw, ih).getContext('2d')
        origCtx.drawImage(currentSource, 0, 0)
        const origData = origCtx.getImageData(0, 0, iw, ih).data

        const effCtx  = offscreen.getContext('2d')
        const effData = effCtx.getImageData(0, 0, iw, ih)
        const px      = effData.data
        const t       = slot.amount / 100

        for (let j = 0; j < px.length; j += 4) {
          px[j]     = origData[j]     + (px[j]     - origData[j])     * t
          px[j + 1] = origData[j + 1] + (px[j + 1] - origData[j + 1]) * t
          px[j + 2] = origData[j + 2] + (px[j + 2] - origData[j + 2]) * t
        }
        effCtx.putImageData(effData, 0, 0)
      }

      currentSource = offscreen
    }

    // blit final result to visible canvas
    const fw = currentSource.naturalWidth ?? currentSource.width
    const fh = currentSource.naturalHeight ?? currentSource.height
    canvas.width  = fw
    canvas.height = fh
    canvas.getContext('2d').drawImage(currentSource, 0, 0)
    canvas.hidden   = false
    dropzone.hidden = true
    updateStatusInfo()
  })
}

function updateStatusInfo() {
  const { naturalWidth: w, naturalHeight: h } = state.image ?? {}
  if (!w || !h) return
  const pct = Math.round(zoom.scale * 100)
  statusInfo.textContent = `${w} × ${h}px${pct !== 100 ? `  ${pct}%` : ''}`
}

// ── Zoom / pan ───────────────────────────────────────────
const zoom = { scale: 1, x: 0, y: 0 }
let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0

function applyZoom() {
  canvas.style.transformOrigin = '0 0'
  canvas.style.transform = `translate(${zoom.x}px,${zoom.y}px) scale(${zoom.scale})`
  canvasWrap.style.cursor = zoom.scale > 1 ? 'grab' : ''
  updateStatusInfo()
}

function resetZoom() {
  zoom.scale = 1; zoom.x = 0; zoom.y = 0
  canvas.style.transform = ''
  canvas.style.transformOrigin = ''
  canvasWrap.style.cursor = ''
  updateStatusInfo()
}

canvasWrap.addEventListener('wheel', e => {
  if (!state.image) return
  e.preventDefault()
  const wrapRect = canvasWrap.getBoundingClientRect()
  // mouse relative to wrap
  const mx = e.clientX - wrapRect.left
  const my = e.clientY - wrapRect.top
  // canvas layout origin (unaffected by CSS transform)
  const cx = mx - canvas.offsetLeft
  const cy = my - canvas.offsetTop
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const newScale = Math.min(Math.max(zoom.scale * factor, 0.25), 20)
  const ratio = newScale / zoom.scale
  zoom.x = cx + (zoom.x - cx) * ratio
  zoom.y = cy + (zoom.y - cy) * ratio
  zoom.scale = newScale
  applyZoom()
}, { passive: false })

canvasWrap.addEventListener('mousedown', e => {
  if (!state.image || zoom.scale <= 1) return
  isPanning = true
  panStartX = e.clientX; panStartY = e.clientY
  panOriginX = zoom.x;  panOriginY = zoom.y
  canvasWrap.style.cursor = 'grabbing'
  e.preventDefault()
})

window.addEventListener('mousemove', e => {
  if (!isPanning) return
  zoom.x = panOriginX + (e.clientX - panStartX)
  zoom.y = panOriginY + (e.clientY - panStartY)
  applyZoom()
})

window.addEventListener('mouseup', () => {
  if (!isPanning) return
  isPanning = false
  canvasWrap.style.cursor = zoom.scale > 1 ? 'grab' : ''
})

canvasWrap.addEventListener('dblclick', () => resetZoom())

// ── Image loading ────────────────────────────────────────
function loadImage(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    if (state.image) URL.revokeObjectURL(state.image.src)
    state.image       = img
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
  const a    = document.createElement('a')
  a.download = 'trn-frm-output.png'
  a.href     = canvas.toDataURL('image/png')
  a.click()
}

// ── Drag: tool-box → slot ────────────────────────────────
toolNav.addEventListener('dragstart', e => {
  const item = e.target.closest('.tool-box:not(.wip)')
  if (!item) { e.preventDefault(); return }
  e.dataTransfer.setData('tool', item.dataset.tool)
  e.dataTransfer.effectAllowed = 'copy'
})

slotEls.forEach((slotEl, idx) => {
  slotEl.addEventListener('dragover', e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    slotEl.classList.add('drag-over')
  })

  slotEl.addEventListener('dragleave', e => {
    if (!slotEl.contains(e.relatedTarget)) slotEl.classList.remove('drag-over')
  })

  slotEl.addEventListener('drop', e => {
    e.preventDefault()
    slotEl.classList.remove('drag-over')
    const toolId = e.dataTransfer.getData('tool')
    if (toolId) addToSlot(idx, toolId)
  })

  slotEl.addEventListener('click', () => selectSlot(idx))
})

// Slot clear buttons
clearBtnEls.forEach((btn, idx) => {
  btn.addEventListener('click', e => {
    e.stopPropagation()
    clearSlot(idx)
  })
})

// Slot intensity sliders
sliderEls.forEach(slider => {
  const idx = Number(slider.dataset.slot)
  slider.addEventListener('input', () => {
    if (state.slots[idx]) {
      state.slots[idx].amount = Number(slider.value)
      render()
    }
  })
})

// ── Random / reset ───────────────────────────────────────
const availableTools = Object.keys(TOOLS)

document.getElementById('btn-random').addEventListener('click', () => {
  const shuffled = [...availableTools].sort(() => Math.random() - 0.5)
  for (let i = 0; i < 4; i++) {
    const toolId = shuffled[i % shuffled.length]
    addToSlot(i, toolId)
  }
})

document.getElementById('btn-reset-slots').addEventListener('click', () => {
  for (let i = 0; i < 4; i++) clearSlot(i)
})

// ── File open / save ─────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => fileInput.click())
btnSave.addEventListener('click', save)

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0])
  fileInput.value = ''
})

canvasWrap.addEventListener('dragover', e => {
  e.preventDefault()
  canvasWrap.classList.add('drag-over')
  dropzone.classList.add('drag-over')
})

canvasWrap.addEventListener('dragleave', e => {
  if (!canvasWrap.contains(e.relatedTarget)) {
    canvasWrap.classList.remove('drag-over')
    dropzone.classList.remove('drag-over')
  }
})

canvasWrap.addEventListener('drop', e => {
  e.preventDefault()
  canvasWrap.classList.remove('drag-over')
  dropzone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file?.type.startsWith('image/')) loadImage(file)
})

dropzone.addEventListener('click', () => fileInput.click())

document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.key === 'o') { e.preventDefault(); fileInput.click() }
  if (e.key === 's') { e.preventDefault(); save() }
})

// ── Theme toggle ─────────────────────────────────────────
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
updateStatusLabel()
