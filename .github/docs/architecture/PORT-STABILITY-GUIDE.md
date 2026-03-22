# Port Stability Guide

Ports are the contracts between internal modules and external consumers (APIs, services, UI boundaries). This guide defines how to keep every port stable, typed, and error-free.

---

## 1. What Counts as a Port
- API endpoints
- Component props
- Hooks return values
- Utility function signatures
- Service interfaces
- Data models and DTOs
- Environment variables exposed to code

Any boundary that other code relies on is a port.

---

## 2. Stability Requirements
1. **Typed Contracts** — All ports must be defined in `src/types/` or a dedicated schema file.
2. **Versioned Changes** — Breaking changes require MigrationMaster workflow.
3. **Input Validation** — Reject invalid data before it propagates.
4. **Output Validation** — Ensure downstream consumers receive expected shapes.
5. **Deterministic Behavior** — Ports must behave consistently for identical inputs.

---

## 3. Documentation
- Every port must be documented in its module using chain-of-thought comments explaining assumptions and side-effects.
- Major ports must reference this guide and related workflow docs.

---

## 4. Testing
- Ports require dedicated tests under `tests/<domain>/`.
- Tests must cover success, failure, edge cases, and invalid input.
- Ports exposed to UIs need integration tests in `tests/integration/`.

---

## 5. Change Management
1. Propose change via issue referencing affected ports.
2. Update schemas/types first.
3. Update implementations + tests.
4. Run `WORKFLOW-PORT-INTEGRITY`.
5. Use MigrationMaster if change is breaking.

---

## 6. Monitoring & Regression Protection
- Add logging (without PII) around critical port failures.
- Track error rates and fail workflows if regression detected.

---

## 7. Enforcement
- GitHub Actions must fail if port contracts drift from documentation or tests.
- Any unstable port triggers Critical Penalty.

---

## 8. Summary
Ports are promises. Type them, test them, document them, and change them only with governance approval.
