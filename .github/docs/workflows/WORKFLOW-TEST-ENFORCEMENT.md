# Workflow — Test Enforcement

Runs the full test suite with 100% coverage enforcement. This workflow guarantees that all exported symbols are tested and no coverage gaps exist.

---

## Purpose
- Execute all unit, integration, and accessibility tests.
- Enforce 100% line, branch, function, and statement coverage.
- Fail CI on missing tests or coverage gaps.

---

## Triggers
- Pull request (any file change)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- `npm run test:coverage` with thresholds at 100% for all metrics.
- Verify `coverage/coverage-summary.json` exists.

---

## Failure Conditions
- Vitest exits non-zero.
- Coverage below 100% for any metric.
- Missing coverage report file.

---

## Outputs / Artifacts
- Coverage report uploaded as artifact.
- PR comment with coverage summary.

---

## Integration Points
- Depends on `package.json` scripts: `test`, `test:coverage`.
- Runs after `WORKFLOW-BIOME-LINT`.

---

## Recovery Steps
- Add missing tests.
- Run `npm run test:coverage` locally.
- Commit fixes and re-run CI.

---

## Related Documents
- `docs/quality/TESTING-STANDARDS.md`
- `docs/quality/NO-MOCKS-POLICY.md`
- `docs/governance/PENALTY-SYSTEM.md`
