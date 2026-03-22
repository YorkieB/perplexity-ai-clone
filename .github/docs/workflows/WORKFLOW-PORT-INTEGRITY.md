# Workflow — Port Integrity

Validates that all ports (APIs, hooks, props, services) remain stable, typed, and error-free. This workflow enforces the Port Stability Guide.

---

## Purpose
- Ensure every port has a typed contract.
- Detect breaking changes before merge.
- Validate input/output handling.

---

## Triggers
- Pull request (changes to ports)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan `src/types/` for contracts.
- Verify all exports in `src/services/` and `src/hooks/` have corresponding types.
- Run TypeScript compiler in strict mode.
- Detect missing validation logic.

---

## Failure Conditions
- Untyped ports detected.
- TypeScript errors.
- Missing validation in services/hooks.

---

## Outputs / Artifacts
- Port integrity report as artifact.
- PR comment listing violations.

---

## Integration Points
- Depends on TypeScript config.
- Runs after `WORKFLOW-DEPENDENCY-CHECKER`.

---

## Recovery Steps
- Add or update type definitions.
- Implement missing validation.
- Commit fixes and re-run CI.

---

## Related Documents
- `docs/architecture/PORT-STABILITY-GUIDE.md`
- `docs/quality/ERROR-HANDLING-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
