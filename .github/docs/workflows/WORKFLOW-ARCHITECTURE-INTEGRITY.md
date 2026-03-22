# Workflow — Architecture Integrity

Validates that the codebase adheres to the defined architecture and layering rules. This workflow enforces the Architecture Guide.

---

## Purpose
- Ensure directory ownership and import rules are respected.
- Detect prohibited cross-layer dependencies.
- Validate component, hook, and service structure.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Verify imports match the Architecture Guide table.
- Detect circular dependencies.
- Ensure components/hooks/services follow required patterns.
- Validate file headers and naming conventions.

---

## Failure Conditions
- Import rule violations.
- Circular dependencies.
- Missing file headers or incorrect naming.

---

## Outputs / Artifacts
- Architecture report with file/line details.
- PR comment listing violations.

---

## Integration Points
- Runs after `WORKFLOW-DEPENDENCY-CHECKER`.
- Uses dependency graph analysis.

---

## Recovery Steps
- Restructure imports to match layering.
- Remove circular dependencies.
- Add or fix file headers and names.

---

## Related Documents
- `docs/architecture/ARCHITECTURE-GUIDE.md`
- `docs/architecture/FILE-HEADER-STANDARDS.md`
- `docs/quality/NAMING-CONVENTIONS.md`
- `docs/governance/PENALTY-SYSTEM.md`
