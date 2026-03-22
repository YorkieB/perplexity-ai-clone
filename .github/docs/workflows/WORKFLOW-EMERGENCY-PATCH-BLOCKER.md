# Workflow — Emergency Patch Blocker

Blocks merges that attempt to bypass governance under the guise of emergencies. This workflow enforces structured change even for hotfixes.

---

## Purpose
- Prevent “hotfix” branches from merging without full tests.
- Disallow commit messages indicating bypassed validation.
- Ensure all required workflows pass before merge.

---

## Triggers
- Pull request targeting protected branches
- Push to protected branches

---

## Checks Performed
- Scan commit messages for “hotfix”, “emergency”, “bypass”, “skip ci”.
- Verify all required workflows have passed.
- Ensure test coverage and linting are complete.

---

## Failure Conditions
- Emergency keywords detected without explicit exception approval.
- Required workflows failing.
- Missing tests or linting.

---

## Outputs / Artifacts
- Emergency report with commit details.
- PR comment blocking merge.

---

## Integration Points
- Runs as a final gate before merge.
- Uses git log analysis.

---

## Recovery Steps
- Follow normal validation workflow.
- If truly urgent, use documented exception process with approval.
- Add tests and documentation retroactively.

---

## Related Documents
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/governance/VALIDATION-WORKFLOW.md`
- `docs/quality/PERMANENT-CODE-POLICY.md`
