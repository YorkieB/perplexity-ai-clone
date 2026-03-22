# Workflow — SkillControl

Validates that all skill creation and invocation follows the Skill Control Policy. This workflow prevents unauthorized skill operations.

---

## Purpose
- Detect unauthorized skill creation or modification.
- Ensure all skills are registered and approved.
- Block merges with unapproved skill changes.

---

## Triggers
- Pull Request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan for skill-related keywords and changes.
- Verify skill registry entries exist and are approved.
- Check for approval metadata in commits.

---

## Failure Conditions
- Unauthorized skill changes detected.
- Missing registry entries.
- No approval metadata.

---

## Outputs / Artifacts
- Skill control report as artifact.
- PR comment listing violations.

---

## Integration Points
- Runs early in the pipeline.
- Uses grep/AST scanning.

---

## Recovery Steps
- Add registry entries and approval metadata.
- Re-run CI.

---

## Related Documents
- `docs/governance/SKILL-CONTROL-POLICY.md`
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/governance/MEMORY-CONTROL-POLICY.md`
