# Error Handling Standards

Robust error handling keeps failures visible and recoverable. This guide defines mandatory practices for detecting, handling, and reporting errors.

---

## 1. Principles
- Never swallow errors.
- Fail fast on impossible states.
- Surface clear, actionable messages.
- Log securely (no secrets/PII).

---

## 2. Implementation Rules
1. Guard inputs and throw when assumptions fail.
2. Wrap async operations in try/catch and propagate or map errors.
3. Provide user-facing feedback for recoverable errors.
4. Annotate logs with context (module, identifiers) but no sensitive data.

---

## 3. Control Flow
- Use guard clauses to exit early on invalid state.
- Switch defaults must throw.
- Promise chains must end with catch.

---

## 4. Error Types
- Create domain-specific Error classes for predictable failures.
- Include remediation hints where helpful.

---

## 5. Testing
- Every error path must have tests (unit + integration).
- Tests should assert both thrown errors and user feedback.

---

## 6. Tooling
- `WORKFLOW-ERROR-COUNT-REPORTER` captures error counts from logs/tests.
- Linters must reject empty catch blocks or unused errors.

---

## 7. Summary
Make errors explicit, observable, and actionable. If an error occurs, developers and users should know exactly what happened and why.
