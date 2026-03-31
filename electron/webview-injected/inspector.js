/**
 * Injected into guest pages via webContents.executeJavaScript (main process).
 * Depends on `window.__jarvisInspectorHost.send(type, payload)` from webview-inspector-preload.cjs.
 */
;(function jarvisInspectorInjected() {
  if (typeof window === 'undefined') return

  var inspectModeEnabled = false
  var moveHandler = null
  var clickHandler = null
  var overlay = null

  function hostSend(type, payload) {
    try {
      if (window.__jarvisInspectorHost && typeof window.__jarvisInspectorHost.send === 'function') {
        window.__jarvisInspectorHost.send(type, payload)
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function nodeIdFromPath(pathIndices) {
    if (!pathIndices || pathIndices.length === 0) return 'j_root'
    return 'j_' + pathIndices.join('_')
  }

  function walkElement(el, pathIndices) {
    var nodeId = nodeIdFromPath(pathIndices)
    var rect = el.getBoundingClientRect()
    var attrs = {}
    var i
    var a
    for (i = 0; i < el.attributes.length; i++) {
      a = el.attributes[i]
      attrs[a.name] = a.value.length > 2000 ? a.value.slice(0, 2000) + '\u2026' : a.value
    }
    var classes = []
    if (el.classList) {
      for (i = 0; i < el.classList.length; i++) classes.push(el.classList[i])
    }
    var node = {
      nodeId: nodeId,
      tagName: (el.tagName || '').toLowerCase(),
      id: el.id || undefined,
      classes: classes,
      attributes: attrs,
      inlineStyle: el.getAttribute('style') || undefined,
      children: [],
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
    for (i = 0; i < el.children.length; i++) {
      node.children.push(walkElement(el.children[i], pathIndices.concat(i)))
    }
    return node
  }

  function domPathForElement(el) {
    var parts = []
    var cur = el
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var p = cur.parentElement
      if (!p) break
      parts.unshift(Array.prototype.indexOf.call(p.children, cur))
      cur = p
    }
    return parts
  }

  function elementByNodeId(nodeId) {
    if (nodeId === 'j_root') return document.documentElement
    if (!nodeId || nodeId.indexOf('j_') !== 0) return null
    var rest = nodeId.slice(2)
    if (!rest) return document.documentElement
    var idxs = rest.split('_').map(function (s) {
      return parseInt(s, 10)
    })
    var n = document.documentElement
    var j
    for (j = 0; j < idxs.length; j++) {
      if (!n || !n.children || idxs[j] < 0 || idxs[j] >= n.children.length) return null
      n = n.children[idxs[j]]
    }
    return n
  }

  function ensureOverlay() {
    if (overlay && overlay.parentNode) return overlay
    overlay = document.createElement('div')
    overlay.id = '__jarvis-inspector-overlay'
    overlay.setAttribute('data-jarvis-inspector', 'overlay')
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      border: '2px solid #0ea5e9',
      borderRadius: '2px',
      zIndex: '2147483646',
      boxSizing: 'border-box',
      display: 'none',
    })
    document.documentElement.appendChild(overlay)
    return overlay
  }

  function showOverlayFor(el) {
    if (!el || !el.getBoundingClientRect) return
    var r = el.getBoundingClientRect()
    var o = ensureOverlay()
    o.style.display = 'block'
    o.style.left = r.left + window.scrollX + 'px'
    o.style.top = r.top + window.scrollY + 'px'
    o.style.width = r.width + 'px'
    o.style.height = r.height + 'px'
  }

  function hideOverlay() {
    if (overlay) {
      overlay.style.display = 'none'
    }
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay)
    }
    overlay = null
  }

  window.__jarvisInspectorCaptureSnapshot = function __jarvisInspectorCaptureSnapshot() {
    try {
      var root = document.documentElement
      if (!root) return { nodeId: 'j_root', tagName: 'html', classes: [], attributes: {}, children: [] }
      return walkElement(root, [])
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) }
    }
  }

  window.__jarvisInspectorHighlightNode = function __jarvisInspectorHighlightNode(nodeId) {
    try {
      var el = elementByNodeId(nodeId)
      if (el) showOverlayFor(el)
      else hideOverlay()
    } catch (_e) {
      hideOverlay()
    }
  }

  window.__jarvisInspectorClearHighlight = function __jarvisInspectorClearHighlight() {
    try {
      hideOverlay()
    } catch (_e) {
      /* ignore */
    }
  }

  window.__jarvisInspectorApplyLayoutEdit = function __jarvisInspectorApplyLayoutEdit(action) {
    try {
      if (!action || typeof action !== 'object') return { ok: false, error: 'Invalid action' }
      var kind = action.kind
      var sourceId = action.sourceNodeId
      var targetId = action.targetNodeId
      if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
        return { ok: false, error: 'Missing node ids' }
      }
      var source = elementByNodeId(sourceId)
      var target = elementByNodeId(targetId)
      if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) {
        return { ok: false, error: 'Element not found' }
      }
      if (source === document.documentElement || target === document.documentElement) {
        return { ok: false, error: 'Cannot move document element' }
      }
      if (source === target) return { ok: false, error: 'Same node' }

      if (kind === 'appendChild') {
        if (source.contains && source.contains(target)) {
          return { ok: false, error: 'Cannot nest under own descendant' }
        }
        target.appendChild(source)
      } else if (kind === 'moveBefore') {
        var parentB = target.parentNode
        if (!parentB) return { ok: false, error: 'Target has no parent' }
        if (source.contains && source.contains(target)) {
          return { ok: false, error: 'Cannot reparent into descendant' }
        }
        parentB.insertBefore(source, target)
      } else if (kind === 'moveAfter') {
        var p2 = target.parentNode
        if (!p2) return { ok: false, error: 'Target has no parent' }
        if (source.contains && source.contains(target)) {
          return { ok: false, error: 'Cannot reparent into descendant' }
        }
        p2.insertBefore(source, target.nextSibling)
      } else {
        return { ok: false, error: 'Unknown layout kind' }
      }

      showOverlayFor(source)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  }

  window.__jarvisInspectorApplyAttributeEdit = function __jarvisInspectorApplyAttributeEdit(edit) {
    try {
      if (!edit || typeof edit !== 'object' || typeof edit.nodeId !== 'string') {
        return { ok: false, error: 'Invalid edit' }
      }
      var el = elementByNodeId(edit.nodeId)
      if (!el || el.nodeType !== 1) return { ok: false, error: 'Element not found' }
      if (el === document.documentElement) return { ok: false, error: 'Cannot edit document element' }

      var k = edit.kind
      if (k === 'set-attribute') {
        var n = edit.name
        if (typeof n !== 'string' || !n) return { ok: false, error: 'Missing attribute name' }
        el.setAttribute(n, edit.value != null ? String(edit.value) : '')
      } else if (k === 'remove-attribute') {
        var rn = edit.name
        if (typeof rn !== 'string' || !rn) return { ok: false, error: 'Missing attribute name' }
        el.removeAttribute(rn)
      } else if (k === 'set-style') {
        var sv = edit.value
        if (sv != null && String(sv).length > 0) {
          el.setAttribute('style', String(sv))
        } else {
          el.removeAttribute('style')
        }
      } else {
        return { ok: false, error: 'Unknown attribute edit kind' }
      }

      try {
        if (typeof window.__jarvisInspectorHighlightNode === 'function') {
          window.__jarvisInspectorHighlightNode(edit.nodeId)
        }
      } catch (_h) {
        /* ignore */
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) }
    }
  }

  window.__jarvisInspectorEnableInspectMode = function __jarvisInspectorEnableInspectMode() {
    if (inspectModeEnabled) return
    inspectModeEnabled = true
    moveHandler = function (ev) {
      if (!inspectModeEnabled) return
      var el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!el || el === overlay || (el.closest && el.closest('[data-jarvis-inspector="overlay"]'))) return
      var path = domPathForElement(el)
      var nid = nodeIdFromPath(path)
      var r = el.getBoundingClientRect()
      showOverlayFor(el)
      hostSend('hover', {
        nodeId: nid,
        domPath: path,
        boundingRect: { x: r.x, y: r.y, width: r.width, height: r.height },
      })
    }
    clickHandler = function (ev) {
      if (!inspectModeEnabled) return
      ev.preventDefault()
      ev.stopPropagation()
      var el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!el) return
      var path = domPathForElement(el)
      var nid = nodeIdFromPath(path)
      var r = el.getBoundingClientRect()
      hostSend('select', {
        nodeId: nid,
        domPath: path,
        boundingRect: { x: r.x, y: r.y, width: r.width, height: r.height },
      })
      window.__jarvisInspectorDisableInspectMode()
    }
    document.addEventListener('mousemove', moveHandler, true)
    document.addEventListener('click', clickHandler, true)
  }

  window.__jarvisInspectorDisableInspectMode = function __jarvisInspectorDisableInspectMode() {
    inspectModeEnabled = false
    if (moveHandler) {
      document.removeEventListener('mousemove', moveHandler, true)
      moveHandler = null
    }
    if (clickHandler) {
      document.removeEventListener('click', clickHandler, true)
      clickHandler = null
    }
    hideOverlay()
    removeOverlay()
  }
})()
