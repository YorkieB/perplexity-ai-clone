# Workflow — Performance Regression

Detects performance regressions in components and bundles. This workflow enforces the Performance Standards.

---

## Purpose
- Identify increased render times or bundle sizes.
- Flag inefficient patterns.
- Fail CI on performance regressions.

---

## Triggers
- Pull request (component or hook changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Measure bundle size changes.
- Run component render benchmarks.
- Detect unnecessary re-renders or heavy computations.

---

## Failure Conditions
- Bundle size increase beyond threshold.
- Render time regression.
- Inefficient patterns detected.

---

## Outputs / Artifacts
- Performance report with metrics.
- PR comment listing regressions.

---

## Integration Points
- Runs after `WORKFLOW-TEST-ENFORCEMENT`.
- Uses bundle analyzer and render benchmarks.

---

## Recovery Steps
- Optimize component logic or memoization.
- Reduce bundle size (tree-shaking, code splitting).
- Re-run benchmarks and CI.

---

## Related Documents
- `docs/quality/PERFORMANCE-STANDARDS.md`
- `docs/architecture/COMPONENT-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
