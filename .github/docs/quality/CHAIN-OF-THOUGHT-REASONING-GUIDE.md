# Chain-of-Thought Reasoning Guide

Every non-trivial change must include explicit reasoning. This guide defines how to express decisions, trade-offs, and assumptions inside code and documentation.

---

## 1. Purpose
- Make complex logic explainable.
- Preserve decision history alongside code.
- Enable validators to confirm that edge cases were considered.

---

## 2. Where Chain-of-Thought Is Required
- Components with branching logic.
- Hooks managing asynchronous flows.
- Services with validation, retries, or caching.
- Ports affecting external systems.
- Any logic implementing business rules or migrations.

---

## 3. Pattern
```ts
// We treat "pending" as success here so the user can continue editing
// while background sync completes. Errors still surface via toast.
if (status === "success" || status === "pending") {
  return showDashboard();
}
```
- Answer “why” this approach was chosen.
- Mention trade-offs or side-effects.
- Reference docs/issues when relevant.

---

## 4. Checklist
- [ ] Comment explains decision, not obvious code.
- [ ] Mentions constraints or future considerations.
- [ ] Links to docs or tickets for broader context.
- [ ] Updated whenever logic changes.

---

## 5. Enforcement
- Missing reasoning in complex sections is a Major violation.
- `WORKFLOW-LOGIC-COMPLETENESS` verifies presence of reasoning comments where expected.

---

## 6. Summary
Reasoning keeps the system transparent. Write code that future contributors (and you) can understand without guesswork.
