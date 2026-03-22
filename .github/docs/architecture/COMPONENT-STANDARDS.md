# Component Standards

Components are the user-facing surface of the system. This guide defines how every component must be structured, documented, and validated.

---

## 1. Component Categories
- **Presentational Components** — Pure UI, no data fetching. Receive typed props, emit events via callbacks.
- **Container Components** — Compose hooks/services to fetch data, manage state, and pass props to presentational components.

Every file must state which category it belongs to in the file header.

---

## 2. Required Structure
```tsx
/*
Friendly header …
*/
import …

export type ComponentProps = { … };

export function Component(props: ComponentProps) {
  const state = useHook();

  return (
    <div>
      …
    </div>
  );
}
```

- Props must be exported and referenced in tests.
- Components must be named after their file (PascalCase).

---

## 3. Styling Rules
- Tailwind classes only (unless otherwise documented).
- No inline styles unless dynamically computed and documented.
- Class lists must be deterministic; use helper utilities for conditional classes.

---

## 4. Accessibility
- Every interactive element requires ARIA labels or discernible text.
- Focus management must be intentional (trap when needed, restore on close).
- Keyboard interactions must mirror pointer interactions.

---

## 5. State & Effects
- State belongs in hooks where possible.
- Components must not mutate global state directly.
- Effects must clean up after themselves (event listeners, timers, observers).

---

## 6. Error Handling
- Components must handle loading, success, empty, and error states explicitly.
- Conditional rendering must include fallback UI.

---

## 7. Testing
- Each component requires a counterpart test in `tests/components/`.
- Tests must cover rendering, interactions, accessibility (aria attributes), and error conditions.

---

## 8. Documentation
- File header must explain purpose, props, and notable decisions.
- Chain-of-thought comments required for complex branching or performance trade-offs.

---

## 9. Enforcement
- `WORKFLOW-ARCHITECTURE-INTEGRITY` checks imports + structure.
- `WORKFLOW-ACCESSIBILITY-CHECKER` verifies a11y rules.
- `WORKFLOW-DUPLICATE-CODE-SCANNER` rejects repeated JSX.

---

## 10. Summary
Components must be deterministic, accessible, and fully tested. Follow this standard to maintain consistency across the codebase.
