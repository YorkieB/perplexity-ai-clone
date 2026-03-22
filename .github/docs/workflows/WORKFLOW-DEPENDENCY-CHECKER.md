# Workflow — Dependency Checker

Detects missing dependencies and unused packages. This workflow prevents runtime failures and keeps the dependency graph clean.

---

## Purpose
- Identify imported packages not listed in `package.json`.
- Flag packages listed but never imported.
- Fail CI on mismatches.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Parse all imports/require statements in `src/` and `tests/`.
- Compare against `package.json` dependencies/devDependencies.
- Report missing and unused packages.

---

## Failure Conditions
- Missing dependencies detected.
- Unused dependencies detected (treated as Major).

---

## Outputs / Artifacts
- Dependency mismatch report as artifact.
- PR comment listing missing/unused packages.

---

## Integration Points
- Runs before `npm ci` in other workflows.
- Uses `depcheck` or custom script.

---

## Recovery Steps
- Add missing packages with `npm install --save[-dev]`.
- Remove unused packages with `npm uninstall`.
- Commit updated `package.json`/`package-lock.json`.

---

## Related Documents
- `docs/quality/PERMANENT-CODE-POLICY.md`
- `docs/architecture/ARCHITECTURE-GUIDE.md`
- `docs/governance/PENALTY-SYSTEM.md`
