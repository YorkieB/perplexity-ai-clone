# Accessibility Standards

Accessibility is a core requirement. Every feature must be perceivable, operable, understandable, and robust.

---

## 1. General Rules
- All interactive elements must have accessible names.
- Keyboard navigation must cover the entire UI without traps.
- Focus order must match visual order.
- Color contrast must meet WCAG 2.1 AA.

---

## 2. Components
- Use semantic HTML elements first; add ARIA only when necessary.
- Provide focus indicators for all actionable elements.
- Ensure dialogs trap focus and return it on close.
- Associate form controls with labels (`label` + `htmlFor`, `aria-labelledby`).

---

## 3. Hooks & State
- Hooks managing focus, announcements, or live regions must document behavior.
- State changes that impact UI should trigger announcements when needed (ARIA live regions).

---

## 4. Testing
- Include accessibility tests in component suites (Testing Library `axe` checks, `getByRole` queries).
- `WORKFLOW-ACCESSIBILITY-CHECKER` runs automated audits; failures block merge.

---

## 5. Documentation
- Chain-of-thought comments must explain non-obvious accessibility decisions.
- Reference this doc in PRs affecting accessibility.

---

## 6. Summary
Accessibility is not optional. Implement and test it like any other feature, and fix regressions immediately.
