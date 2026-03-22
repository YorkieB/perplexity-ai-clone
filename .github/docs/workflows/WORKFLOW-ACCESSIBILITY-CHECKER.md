# Workflow — Accessibility Checker

Validates accessibility compliance for components and hooks. This workflow enforces the Accessibility Standards.

---

## Purpose
- Ensure all interactive elements are accessible.
- Detect missing labels, focus issues, and contrast problems.
- Fail CI on accessibility violations.

---

## Triggers
- Pull request (component or hook changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Run axe-core via Testing Library on component tests.
- Verify semantic HTML usage.
- Detect missing ARIA attributes or roles.
- Ensure focus management and keyboard navigation.

---

## Failure Conditions
- Axe violations detected.
- Missing labels or roles.
- Focus traps or keyboard navigation failures.

---

## Outputs / Artifacts
- Accessibility report with violation details.
- PR comment listing issues.

---

## Integration Points
- Runs after `WORKFLOW-TEST-ENFORCEMENT`.
- Uses `@axe-core/react` and Testing Library.

---

## Recovery Steps
- Add labels, roles, or semantic markup.
- Implement focus management.
- Re-run tests and CI.

---

## Related Documents
- `docs/quality/ACCESSIBILITY-STANDARDS.md`
- `docs/architecture/COMPONENT-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
