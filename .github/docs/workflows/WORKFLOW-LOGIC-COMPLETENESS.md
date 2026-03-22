# Workflow — Logic Completeness

Detects missing logic, unhandled states, and incomplete reasoning. This workflow enforces the Missing Logic Detection Guide and Logic Completeness Checklist.

---

## Purpose
- Ensure every branch, handler, and state is implemented.
- Detect silent failures and placeholder logic.
- Enforce error-first design.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Static analysis for missing returns, empty catch, incomplete switches.
- Structural analysis for missing handlers (buttons without onClick, forms without onSubmit).
- Placeholder detection (TODO/FIXME/HACK).
- Test coverage for error paths.

---

## Failure Conditions
- Missing logic detected.
- Placeholder code present.
- Incomplete error handling.

---

## Outputs / Artifacts
- Logic completeness report with file/line details.
- PR comment listing issues.

---

## Integration Points
- Runs after `WORKFLOW-PORT-INTEGRITY`.
- Uses custom AST scanner.

---

## Recovery Steps
- Implement missing logic.
- Remove placeholders.
- Add error handling and tests.
- Re-run CI.

---

## Related Documents
- `docs/quality/MISSING-LOGIC-DETECTION-GUIDE.md`
- `docs/quality/LOGIC-COMPLETENESS-CHECKLIST.md`
- `docs/governance/PENALTY-SYSTEM.md`
