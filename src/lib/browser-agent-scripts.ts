/**
 * Self-contained JavaScript strings injected into the Electron webview
 * via executeJavaScript(). Each script must be a single expression that
 * returns a value (no top-level `return` keyword — it's eval'd).
 *
 * The snapshot script builds a Playwright-MCP-style accessibility tree:
 * compact YAML-like text with refs that the LLM uses for click/type actions.
 */

export const SNAPSHOT_SCRIPT = `
(function() {
  const INTERACTIVE = new Set([
    'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS', 'SUMMARY',
  ]);
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio',
    'checkbox', 'switch', 'tab', 'slider', 'spinbutton', 'treeitem',
  ]);

  const refs = new Map();
  let refId = 0;
  const lines = [];

  function visible(el) {
    if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    return true;
  }

  function label(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
    if (el.getAttribute('title')) return el.getAttribute('title');
    if (el.getAttribute('alt')) return el.getAttribute('alt');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const id = el.getAttribute('id');
      if (id) {
        const lab = document.querySelector('label[for="' + id + '"]');
        if (lab) return lab.textContent.trim().slice(0, 60);
      }
    }
    const text = el.textContent || '';
    return text.trim().slice(0, 60);
  }

  function roleOf(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === 'A' && el.href) return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'IMG') return 'img';
    if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') return 'heading';
    if (tag === 'NAV') return 'navigation';
    if (tag === 'MAIN') return 'main';
    return null;
  }

  function isInteractive(el) {
    if (INTERACTIVE.has(el.tagName)) return true;
    const role = el.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.getAttribute('onclick') || el.getAttribute('tabindex') === '0') return true;
    if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
      const s = getComputedStyle(el);
      if (s.cursor === 'pointer') return true;
    }
    return false;
  }

  function walk(el, depth) {
    if (!el || el.nodeType !== 1) return;
    if (!visible(el)) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT' || el.tagName === 'SVG') return;

    const role = roleOf(el);
    const interactive = isInteractive(el);

    if (interactive || role === 'heading' || role === 'img' || role === 'navigation' || role === 'main') {
      const ref = 'e' + (++refId);
      refs.set(ref, el);
      const lbl = label(el).replace(/\\n/g, ' ').replace(/\\s+/g, ' ');
      const r = role || el.tagName.toLowerCase();
      let extra = '';
      if (el.tagName === 'INPUT' && el.value) extra = ' value="' + el.value.slice(0, 40) + '"';
      if (el.tagName === 'A' && el.href) extra = ' href="' + el.href.slice(0, 80) + '"';
      if (el.checked) extra += ' checked';
      if (el.disabled) extra += ' disabled';
      const indent = '  '.repeat(Math.min(depth, 6));
      lines.push(indent + '- ' + r + ' "' + lbl + '"' + extra + ' [ref=' + ref + ']');
    }

    for (const child of el.children) {
      walk(child, depth + (role ? 1 : 0));
    }
  }

  walk(document.body, 0);
  window.__jarvisRefs = refs;

  const url = location.href;
  const title = document.title || '';
  const header = 'Page: ' + title + '\\nURL: ' + url + '\\nInteractive elements (' + refs.size + '):\\n';
  return header + lines.join('\\n');
})()
`

export function clickScript(ref: string): string {
  return `
(function() {
  const el = window.__jarvisRefs && window.__jarvisRefs.get('${ref}');
  if (!el) return { ok: false, error: 'Element ref ${ref} not found. Run snapshot first.' };
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.focus();
  el.click();
  return { ok: true };
})()
`
}

export function typeScript(ref: string, text: string): string {
  const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
  return `
(function() {
  const el = window.__jarvisRefs && window.__jarvisRefs.get('${ref}');
  if (!el) return { ok: false, error: 'Element ref ${ref} not found. Run snapshot first.' };
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.focus();
  if ('value' in el) {
    el.value = '${escaped}';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = '${escaped}';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { ok: true };
})()
`
}

export function scrollScript(direction: 'up' | 'down'): string {
  const sign = direction === 'down' ? 1 : -1
  return `
(function() {
  window.scrollBy({ top: ${sign} * window.innerHeight * 0.8, behavior: 'smooth' });
  return { ok: true, scrollY: window.scrollY };
})()
`
}

export const EXTRACT_SCRIPT = `
(function() {
  const text = document.body.innerText || '';
  return text.slice(0, 8000);
})()
`
