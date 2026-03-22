# Workflow — Missing Test Files

Ensures every source file has a corresponding test file. This workflow enforces the one-to-one test coverage requirement.

---

## Purpose
- Detect source files without test counterparts.
- Block merges until test files exist.
- Maintain test-to-source parity.

---

## Triggers
- Pull request (additions to `src/`)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan `src/` for `.ts`/`.tsx` files (excluding `.test.*` and `.types.*`).
- Verify matching `.test.ts`/`.test.tsx` exists in `tests/` mirroring directory structure.

---

## Failure Conditions
- Any source file lacks a test file.
- Test file does not match expected naming/location.

---

## Outputs / Artifacts
- List of missing test files as artifact.
- PR comment enumerating missing files.

---

## Integration Points
- Runs before `WORKFLOW-TEST-ENFORCEMENT`.
- Uses shell script compatible with Windows/Unix.

---

## Recovery Steps
- Create the missing test file.
- Add basic smoke tests.
- Commit and re-run CI.

---

## Related Documents
- `docs/quality/TESTING-STANDARDS.md`
- `docs/quality/LOGIC-COMPLETENESS-CHECKLIST.md`
- `docs/governance/PENALTY-SYSTEM.md`
