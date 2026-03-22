# Dead Code Policy

Dead code hides bugs and confuses future contributors. This policy defines how to detect, remove, and report unused code.

---

## 1. Definition
Dead code includes:
- Unused components, hooks, or utilities.
- Commented-out logic kept “for later”.
- Exports with no imports anywhere in the repo.
- Feature flags or experiments past their end date.

---

## 2. Prevention Rules
- Remove unused code immediately when behavior changes.
- Delete feature-flag branches once rollout is complete.
- Replace commented blocks with documentation or examples, not inline code.

---

## 3. Detection Techniques
- Static analysis (TypeScript, Biome) for unused symbols/imports.
- `WORKFLOW-DUPLICATE-CODE-SCANNER` and `WORKFLOW-LOGIC-COMPLETENESS` to catch unreachable branches.
- Tests failing due to missing references.

---

## 4. Removal Process
1. Confirm no references via search/tools.
2. Remove code + related tests/docs.
3. Update changelog or architecture notes if significant.
4. Run validation workflow to ensure no regressions.

---

## 5. Exceptions
- Template code used by generators (must be documented in README).
- Deprecation paths with published removal dates.

---

## 6. Enforcement
- Dead code triggers Major violation (Critical if it hides missing logic or violates permanence).
- Workflows must fail when unused exports/imports exist.

---

## 7. Summary
Keep the codebase alive and intentional. Delete what you no longer need and document deprecations clearly.
