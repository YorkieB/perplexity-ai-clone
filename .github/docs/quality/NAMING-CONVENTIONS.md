# Naming Conventions

Consistent naming keeps the codebase discoverable and predictable. Follow these rules for all files, symbols, components, hooks, and tests.

---

## 1. Files & Directories
| Type | Pattern | Example |
|------|---------|---------|
| Component files | PascalCase.tsx | `ProfileCard.tsx` |
| Hook files | useSomething.ts | `useProfile.ts` |
| Utility files | camelCase.ts | `formatDate.ts` |
| Test files | match source + `.test.ts(x)` | `ProfileCard.test.tsx` |
| Styles | kebab-case.css/ts | `dashboard-shell.css` |

---

## 2. Components & Props
- Components: PascalCase (`DashboardHeader`).
- Props interfaces: `ComponentNameProps`.
- Event handlers: `onThing`, `handleThing` pairs.
- Boolean props prefixed with `is`/`has`/`should`.

---

## 3. Hooks
- Always start with `use` (`useDashboardFilters`).
- Return object keys describe state (`filters`, `setFilters`, `isLoading`).
- Internal helper functions use camelCase.

---

## 4. Utilities & Services
- Functions: camelCase verbs (`fetchProfile`, `formatCurrency`).
- Constants: SCREAMING_SNAKE_CASE for globals.
- Services: `somethingService.ts` exporting a typed API.

---

## 5. Tests
- Describe behavior (`renders user name`, `handles error state`).
- Mock/fake helpers prefixed with `create` or `make`.

---

## 6. General Guidelines
- Avoid abbreviations unless widespread (`ctx`, `ref`, `id`).
- Use descriptive names over short ones.
- Keep names aligned with domain language from docs.

---

## 7. Enforcement
- Lint rules check file/component naming.
- `WORKFLOW-ARCHITECTURE-INTEGRITY` flags violations.

---

## 8. Summary
Name things clearly, consistently, and in line with the architecture map so future contributors instantly know what each file does.
