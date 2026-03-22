# Performance Standards

Performance is treated as a first-class requirement. This guide defines the expectations for measuring, optimizing, and monitoring performance across the stack.

---

## 1. Principles
- Measure before optimizing.
- Keep interactions under 100ms when possible.
- Avoid unnecessary renders by default.
- Defer expensive work when it does not block UX.

---

## 2. Component-Level Standards
- Memoize derived props and callbacks as needed.
- Use lazy loading for heavyweight components.
- Avoid inline object/array literals passed to children.
- Keep DOM tree depth minimal.

---

## 3. Hook & Service Standards
- Cache results when data is reusable.
- Batch network requests when possible.
- Abort fetches on unmount or dependency changes.

---

## 4. Data Fetching
- Use pagination and partial loading.
- Document trade-offs in chain-of-thought comments.
- Validate that retries/backoff do not overwhelm services.

---

## 5. Monitoring & Tooling
- `WORKFLOW-PERFORMANCE-REGRESSION` runs bundle-size and render-duration checks.
- Track performance metrics in CI and fail on regressions.

---

## 6. Testing
- Include performance-related assertions where applicable (e.g., ensures functions are not called excessively).
- Use profiling tools during development for complex flows.

---

## 7. Summary
Design with performance in mind from the start. Document the trade-offs and keep regressions from ever landing on main.
