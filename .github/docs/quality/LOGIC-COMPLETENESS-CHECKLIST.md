# Logic Completeness Checklist

Use this checklist before validating any feature to ensure no logic is missing. All boxes must be checked.

---

## 1. Inputs
- [ ] All inputs are validated (type, range, presence).
- [ ] Edge-case inputs considered (null, undefined, empty, max/min values).

## 2. State
- [ ] Required state variables defined and initialized.
- [ ] Derived state memoized when needed.
- [ ] State transitions documented with chain-of-thought comments.

## 3. Handlers & Side-Effects
- [ ] Every UI action has a handler.
- [ ] Handlers trigger the correct side-effects (API, storage, events).
- [ ] Side-effects have cleanup paths.

## 4. Logic Branches
- [ ] All conditionals cover true/false paths.
- [ ] Switch statements are exhaustive with default guards.
- [ ] “Impossible” states throw explicit errors.

## 5. Success & Error Flows
- [ ] Success flow is implemented end-to-end.
- [ ] Error flow handles API failures, validation errors, and unexpected states.
- [ ] User feedback (toast, inline message) is presented on error.

## 6. Async Operations
- [ ] All async functions are awaited.
- [ ] Loading state exposed to UI.
- [ ] Retrying / fallback behavior defined if needed.

## 7. Tests
- [ ] Success tests cover happy path.
- [ ] Error tests cover failures and edge cases.
- [ ] Coverage thresholds met.

## 8. Dependencies
- [ ] Required packages installed and imported.
- [ ] No unused dependencies remain.

## 9. Documentation
- [ ] File header updated.
- [ ] Chain-of-thought comments added for complex logic.
- [ ] Relevant guides referenced.

## 10. Workflows
- [ ] `WORKFLOW-LOGIC-COMPLETENESS` passes locally.
- [ ] PR checklist references this document.

---

## Summary
Missing logic is a Critical violation. Use this checklist to confirm completeness before requesting validation.
