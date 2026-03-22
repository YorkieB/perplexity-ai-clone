# Workflow — Action Documentation Validator

Ensures every GitHub Action has corresponding documentation. This workflow enforces the Action Documentation Requirements.

---

## Purpose
- Detect workflows without docs.
- Ensure docs are up to date and follow the template.
- Block merges with undocumented actions.

---

## Triggers
- Pull Request (workflow changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- For each `.github/workflows/*.yml`, verify a matching `docs/workflows/WORKFLOW-*.md` exists.
- Validate docs contain required sections (Purpose, Triggers, Checks, etc.).
- Detect outdated docs (timestamps, version mismatches).

---

## Failure Conditions
- Missing workflow documentation.
- Incomplete or outdated docs.

---

## Outputs / Artifacts
- Documentation report as artifact.
- PR comment listing missing/invalid docs.

---

## Integration Points
- Runs after workflow changes.
- Uses file existence and content validation.

---

## Recovery Steps
- Create or update documentation files.
- Follow the template in `docs/governance/ACTION-DOCUMENTATION-REQUIREMENTS.md`.
- Re-run CI.

---

## Related Documents
- `docs/governance/ACTION-DOCUMENTATION-REQUIREMENTS.md`
- `docs/governance/PENALTY-SYSTEM.md`
