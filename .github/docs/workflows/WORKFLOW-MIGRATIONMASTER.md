# Workflow — MigrationMaster

Manages large-scale migrations and refactors safely. This workflow enforces structured change for breaking changes.

---

## Purpose
- Ensure breaking changes follow the MigrationMaster process.
- Validate migration tests and documentation.
- Block merges that bypass migration workflow.

---

## Triggers
- Pull Request labeled `migration` or touching migration docs
- Push to protected branches with migration files

---

## Checks Performed
- Verify migration plan exists and is approved.
- Ensure migration tests pass.
- Check that rollback procedures are documented.
- Validate that old code is deprecated correctly.

---

## Failure Conditions
- Missing migration plan or tests.
- Breaking changes without migration label.
- Incomplete rollback documentation.

---

## Outputs / Artifacts
- Migration report as artifact.
- PR comment listing missing migration artifacts.

---

## Integration Points
- Runs before other workflows.
- Requires manual approval for migration PRs.

---

## Recovery Steps
- Create or update migration plan.
- Add migration tests and rollback docs.
- Re-run CI.

---

## Related Documents
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/governance/VALIDATION-WORKFLOW.md`
- `docs/architecture/ARCHITECTURE-GUIDE.md`
