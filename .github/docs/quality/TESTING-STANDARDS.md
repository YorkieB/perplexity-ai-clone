# Testing Standards

Testing is mandatory for every feature, component, hook, utility, and service. This guide defines the required coverage, scope, and workflows.

---

## 1. Coverage Requirements
- 100% line, branch, function, and statement coverage enforced via Vitest.
- Every exported symbol must have at least one direct test.
- Integration tests required for cross-module behavior.

---

## 2. Test Types
| Type | Location | Purpose |
|------|----------|---------|
| Unit | `tests/components`, `tests/hooks`, `tests/utils`, `tests/services` | Verify isolated behavior |
| Integration | `tests/integration` | Validate module collaboration |
| Accessibility | Component tests | Ensure ARIA, keyboard, focus patterns |
| Regression | As needed | Capture past bugs |

---

## 3. Structure & Naming
- Mirror `src/` structure under `tests/`.
- File name pattern: `<module>.test.ts(x)`.
- Each test file must import the subject from `src/` (no redefinition).

---

## 4. Assertions & Utilities
- Use Vitest + Testing Library utilities.
- Prefer DOM queries that reflect user behavior (`getByRole`, `getByLabelText`).
- Avoid snapshot tests for complex UI; assert behavior instead.

---

## 5. Data & Fixtures
- Use factory helpers for complex objects.
- Do not hardcode unrelated data in multiple files; extract to fixtures.

---

## 6. Async & Error Testing
- Always await asynchronous operations.
- Test both success and failure paths.
- Ensure hooks/services surface errors predictably.

---

## 7. Workflow Integration
- `npm run test` for fast iteration.
- `npm run test:coverage` for CI (enforced in GitHub Actions).
- Workflows must fail on skipped tests or coverage gaps.

---

## 8. Enforcement
- Missing tests trigger Penalty System (Critical if exported code lacks coverage).
- `WORKFLOW-TEST-ENFORCEMENT` ensures commands are executed with thresholds.
- `WORKFLOW-MISSING-TEST-FILES` ensures every src file has a counterpart test.

---

## 9. Summary
Tests are non-negotiable. Write them with the same care as production code, keep them deterministic, and run them before every validation.
