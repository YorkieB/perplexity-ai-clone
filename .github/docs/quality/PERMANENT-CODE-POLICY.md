# Permanent Code Policy

All code merged into this repository is treated as permanent production code. This policy defines the expectations, safeguards, and workflows for maintaining permanence.

---

## 1. Principles
- No temporary hacks or placeholder code.
- No "just for now" solutions without a documented removal plan.
- Every change must be production-ready.

---

## 2. Requirements
1. **Complete Implementation** — Features must be fully functional with all logic, tests, and documentation.
2. **Chain-of-Thought Evidence** — Complex decisions documented inline.
3. **Tests & Coverage** — 100% coverage enforced; integration tests for features spanning multiple layers.
4. **Validation Workflow** — Full validation pipeline completed before committing.

---

## 3. Change Control
- Breaking changes require MigrationMaster workflow.
- Deprecations must include documentation, migration instructions, and deadlines.
- Refactors must maintain behavior unless explicitly stated.

---

## 4. Forbidden Patterns
- TODO/FIXME/HACK comments without issue links and timelines.
- Dead code left "for later".
- Hotfix-style commits that bypass workflows.

---

## 5. Enforcement
- `WORKFLOW-PERMANENT-CODE-VALIDATOR` scans for temporary markers, missing documentation, and partial implementations.
- Violations trigger Critical Penalty.

---

## 6. Summary
Treat every line as if it will live forever. Build it right, document it, test it, and validate it before merging.
