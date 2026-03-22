# Duplicate Code Policy

Repeated logic is forbidden. This policy defines how to detect, prevent, and remediate duplicate code across components, hooks, utilities, and services.

---

## 1. Definition of Duplicate Code
Any of the following counts as duplication:
- Identical or near-identical code blocks copied in multiple places.
- Repeated JSX structures differing only in literals.
- Redundant utilities or helpers performing the same logic.
- Repeated API calls or services with overlapping purpose.
- Repeated Tailwind class sequences that should be extracted.
- Repeated TypeScript interfaces or prop definitions.

---

## 2. Prevention Rules
1. Extract shared logic into utilities, hooks, or components.
2. Share type definitions via `src/types/`.
3. Use configuration-driven patterns when behavior differs only by data.
4. Document intentional duplication (rare) with justification and removal plan.

---

## 3. Detection Techniques
- `WORKFLOW-DUPLICATE-CODE-SCANNER` runs AST/string similarity checks.
- Code reviews must flag suspicious copy/paste.
- Tests should fail when duplicated logic leads to inconsistent behavior.

---

## 4. Refactoring Guidelines
1. Identify the minimal reusable abstraction.
2. Create shared module with clear contract.
3. Update all call sites.
4. Add tests for the shared module.
5. Remove legacy duplicates.

---

## 5. Exceptions
- Boilerplate required by external frameworks (rare).
- Duplication mandated by security policies (e.g., isolated modules) — must be documented.

---

## 6. Enforcement
- Duplicate code triggers Penalty System (Major at minimum, Critical if it causes logic drift).
- Merges blocked until duplicates removed or exemption documented.

---

## 7. Summary
Duplication multiplies maintenance cost and risk. Extract, document, and test shared logic to keep the system clean.
