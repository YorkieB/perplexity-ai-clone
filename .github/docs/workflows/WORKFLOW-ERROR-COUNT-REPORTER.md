# Workflow — Error Count Reporter

Counts and reports errors from logs, tests, and builds. This workflow enforces truthful error reporting.

---

## Purpose
- Ensure all errors are visible and counted.
- Prevent false claims of success.
- Provide PR comments with exact error counts.

---

## Triggers
- Pull Request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Parse test logs for failed tests.
- Parse lint/build logs for errors.
- Count total errors and categorize by severity.

---

## Failure Conditions
- Any error count > 0.
- Mismatch between reported and actual errors.

---

## Outputs / Artifacts
- Error count report as artifact.
- PR comment with exact error counts.

---

## Integration Points
- Runs after all other workflows.
- Parses logs from previous steps.

---

## Recovery Steps
- Fix all reported errors.
- Re-run CI and verify zero errors.

---

## Related Documents
- `docs/quality/ERROR-HANDLING-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/quality/LOGIC-COMPLETENESS-CHECKLIST.md`
