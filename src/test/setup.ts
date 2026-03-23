import '@testing-library/jest-dom/vitest'

// Radix Select / Dialog rely on pointer capture APIs not fully implemented in jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {}
}

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
