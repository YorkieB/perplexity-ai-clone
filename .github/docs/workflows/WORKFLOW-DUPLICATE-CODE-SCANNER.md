# Workflow — Duplicate Code Scanner

Detects duplicated logic, JSX, and patterns across the codebase. This workflow enforces the Duplicate Code Policy.

---

## Purpose
- Identify repeated blocks, components, or utilities.
- Prompt refactoring into shared abstractions.
- Prevent maintenance overhead and logic drift.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- AST similarity analysis for functions/components.
- String similarity for repeated JSX.
- Import duplication checks.
- Tailwind class sequence duplication.

---

## Failure Conditions
- Duplicates exceed similarity threshold.
- Repeated imports or utilities without abstraction.

---

## Outputs / Artifacts
- Duplicate report with line numbers and similarity scores.
- PR comment listing duplicates.

---

## Integration Points
- Runs after `WORKFLOW-LOGIC-COMPLETENESS`.
- Uses `jscpd` or custom scanner.

---

## Recovery Steps
- Extract shared logic to utilities/hooks/components.
- Update call sites.
- Add tests for shared module.
- Commit and re-run CI.

---

## Related Documents
- `docs/architecture/DUPLICATE-CODE-POLICY.md`
- `docs/quality/LOGIC-COMPLETENESS-CHECKLIST.md`
- `docs/governance/PENALTY-SYSTEM.md`
