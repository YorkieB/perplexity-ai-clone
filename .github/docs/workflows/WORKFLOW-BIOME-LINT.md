# Workflow — Biome Lint

Runs Biome checks and auto-formatting across the repository. This workflow enforces style and formatting consistency.

---

## Purpose
- Enforce 2-space indentation, double quotes, and Tailwind class consistency.
- Auto-fix formatting issues where possible.
- Fail CI on any remaining formatting violations.

---

## Triggers
- Pull request (source branch changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- `biome check . --apply` (auto-fix)
- `biome check .` (final verification)

---

## Failure Conditions
- Biome exits with non-zero after auto-fix.
- Files still contain formatting violations.

---

## Outputs / Artifacts
- Biome report uploaded as artifact.
- PR comment listing fixed files (if any).

---

## Integration Points
- Depends on `package.json` scripts: `lint`.
- Runs before tests to avoid style noise in test logs.

---

## Recovery Steps
- Run `npm run lint` locally.
- Commit auto-fixed changes.
- Re-push or update PR.

---

## Related Documents
- `docs/quality/ERROR-HANDLING-STANDARDS.md`
- `docs/architecture/FILE-HEADER-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
