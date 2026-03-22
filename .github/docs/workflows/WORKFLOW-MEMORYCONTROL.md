# Workflow — MemoryControl

Validates that all memory operations follow the Memory Control Policy. This workflow ensures memory is created, modified, or deleted only with explicit approval.

---

## Purpose
- Detect unauthorized memory changes.
- Ensure all memory operations reference the policy.
- Block merges with unapproved memory mutations.

---

## Triggers
- Pull Request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan for memory-related keywords and changes.
- Verify memory operations reference `docs/governance/MEMORY-CONTROL-POLICY.md`.
- Check for approval metadata in commits.

---

## Failure Conditions
- Unauthorized memory changes detected.
- Missing policy references.
- No approval metadata.

---

## Outputs / Artifacts
- Memory control report as artifact.
- PR comment listing violations.

---

## Integration Points
- Runs early in the pipeline.
- Uses grep/AST scanning.

---

## Recovery Steps
- Add policy references and approval metadata.
- Re-run CI.

---

## Related Documents
- `docs/governance/MEMORY-CONTROL-POLICY.md`
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/governance/SKILL-CONTROL-POLICY.md`
