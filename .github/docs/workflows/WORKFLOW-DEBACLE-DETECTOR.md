# Workflow — Debacle Detector

Detects rushed, unstructured, or panic-driven changes that bypass governance. This workflow enforces the Debacle Coding Prevention rules.

---

## Purpose
- Flag shortcuts, hotfixes, and “just for now” patches.
- Detect bypassed validation or skipped tests.
- Block merges that violate structured change practices.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan commit messages for “quick fix”, “temp”, “hack”, “WIP”.
- Detect large diffs touching unrelated areas.
- Ensure all required workflows pass.
- Check for missing documentation or validation steps.

---

## Failure Conditions
- Panic patterns detected.
- Required workflows failing.
- Unstructured changes.

---

## Outputs / Artifacts
- Debacle report with file/line details.
- PR comment listing violations.

---

## Integration Points
- Runs after all other workflows.
- Uses git diff analysis and message scanning.

---

## Recovery Steps
- Revert or structure the changes properly.
- Follow the Validation Workflow.
- Add documentation and tests.

---

## Related Documents
- `docs/architecture/DEBACLE-CODING-PREVENTION.md` (if created)
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/governance/VALIDATION-WORKFLOW.md`
