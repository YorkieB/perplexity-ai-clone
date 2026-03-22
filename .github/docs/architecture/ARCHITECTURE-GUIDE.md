# Architecture Guide — Yorkie System Blueprint

This guide defines the structural rules for the codebase: directories, layering, dependencies, and communication boundaries.

---

## 1. Core Principles
- **Deterministic Structure** — Every file has a predictable home.
- **Explicit Boundaries** — Components, hooks, services, and utilities own distinct responsibilities.
- **One-Way Flow** — Data flows downward; events bubble upward.
- **No Hidden State** — All state transitions must be explicit and tested.

---

## 2. Directory Ownership
| Directory | Responsibility | Allowed Imports |
|-----------|----------------|-----------------|
| `src/components/` | UI components (presentational or container). | `components`, `hooks`, `utils`, `styles`, `types`. |
| `src/hooks/` | Shared logic with React hooks. | `hooks`, `utils`, `types`, `services`. |
| `src/utils/` | Pure functions; no side-effects. | `utils`, `types`. |
| `src/services/` | API clients, data access, integrations. | `utils`, `types`. |
| `src/pages/` | Route-level views composing components/hooks. | `components`, `hooks`, `utils`, `styles`, `types`. |
| `src/layouts/` | Structural wrappers for pages. | Same as pages. |
| `src/styles/` | Global style utilities, Tailwind tokens. | `styles` only. |
| `src/types/` | Shared TypeScript definitions. | None (leaf-only). |

---

## 3. Dependency Rules
1. No cross-imports that violate the table above.
2. No component may import directly from `services`; use hooks or dedicated adapters.
3. Utilities must be pure and side-effect free.
4. Services must perform input/output validation and return typed results.
5. Circular dependencies are forbidden.

---

## 4. Port Definitions
Ports represent the boundaries between internal modules and external consumers. Every port must have:
- Contract defined in `src/types/`.
- Implementation in `src/services/` or dedicated adapters.
- Tests in `tests/services/` or appropriate directory.
- Documentation in `docs/architecture/PORT-STABILITY-GUIDE.md`.

---

## 5. Component Architecture
- Components must be deterministic functions.
- Container components handle data fetching + state.
- Presentational components receive typed props and emit events via callbacks.
- All components must include accessibility hooks (aria labels, focus management).

---

## 6. Hook Architecture
- Hooks orchestrate state, effects, and services.
- Hooks must return a stable contract (state, handlers, metadata).
- Hooks may not mutate DOM or global state directly; they must delegate to services or React APIs.

---

## 7. Service Architecture
- Services interact with APIs, storage, or external systems.
- Each service must validate inputs and outputs, handle errors, and surface typed responses.
- Services must be deterministic (no hidden global state).

---

## 8. Documentation & Tests
- Every module must reference relevant docs (architecture, quality, workflows).
- Tests mirror directory structure (`tests/<dir>`).
- Architecture violations must be caught by `WORKFLOW-ARCHITECTURE-INTEGRITY`.

---

## 9. Summary
The architecture is opinionated by design. Respect the layers, honor the dependency rules, and document every port. This keeps the Yorkie system governable and scalable.
