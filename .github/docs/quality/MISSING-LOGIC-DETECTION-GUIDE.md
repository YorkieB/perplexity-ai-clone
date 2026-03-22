# Missing Logic Detection Guide

Missing logic is a Critical violation. This guide explains how to detect, prevent, and remediate incomplete reasoning paths, unhandled states, and silent failures.

---

## 1. Purpose
- Ensure every branch, state, and handler is implemented.
- Provide heuristics for static, structural, and semantic analysis.
- Enable workflows to catch missing logic automatically.

---

## 2. Missing Logic Categories
1. **Unhandled States** — Missing `else` branches, default cases, or guard clauses.
2. **Silent Fallthrough** — Functions that return nothing or swallow errors.
3. **Partial Handlers** — Buttons without `onClick`, forms without submit logic, hooks without return values.
4. **Placeholder Logic** — TODO/FIXME/HACK, commented-out blocks, stubbed returns.
5. **Missing Validation** — Inputs/outputs not checked, assumptions not asserted.

---

## 3. Detection Techniques
- **Static Analysis**: unreachable code, missing returns, incomplete switches.
- **Structural Analysis**: ensure every UI control maps to implemented logic.
- **Semantic Analysis**: confirm domain rules and state machines cover all transitions.
- **Test Coverage**: branch/edge-case coverage must remain at 100%.

---

## 4. Required Practices
- Write error paths before success paths.
- Assert “impossible” states with explicit errors.
- Validate inputs and outputs at every port.
- Remove TODOs before merge.

---

## 5. Workflow Integration
- `WORKFLOW-LOGIC-COMPLETENESS` performs automated scans.
- PR checklist must link to this guide and confirm manual review.

---

## 6. Remediation
1. Identify missing path.
2. Implement logic + tests.
3. Rerun validation workflow from the start.
4. Document fix in PR summary.

---

## 7. Summary
Completeness is non-negotiable. Detect missing logic early, fix it completely, and validate before requesting approval.
