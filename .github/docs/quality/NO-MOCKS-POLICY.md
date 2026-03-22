# No Mocks Policy

Mocks hide real behavior and create false confidence. This policy bans unnecessary mocking and defines the acceptable alternatives.

---

## 1. Guiding Principles
- Prefer real implementations with lightweight test doubles (fakes) only when unavoidable.
- When mocking is required, scope it narrowly and document why.
- Avoid snapshotting mocked data; assert behavior instead.

---

## 2. Allowed Test Doubles
| Type | Usage |
|------|-------|
| **Stub** | Return predetermined data for pure functions. |
| **Fake** | Minimal in-memory implementation (e.g., fake storage). |
| **Spy** | Track calls without overriding behavior. |
| **Mock** | Only for external APIs when network access is impossible. |

---

## 3. Forbidden Patterns
- Mocking React hooks/components to bypass logic.
- Mocking services that could be replaced with fakes.
- Mocking timers/Date without documenting time-travel behavior.

---

## 4. Required Practices
- Use dependency injection to supply fakes where needed.
- Document every mock’s purpose and removal plan.
- Prefer integration tests that hit real code paths.

---

## 5. Enforcement
- `WORKFLOW-TEST-ENFORCEMENT` scans for disallowed mocks.
- Penalty System applies to violations.

---

## 6. Summary
Use real code whenever possible. Mocks are a last resort, tightly controlled, and always documented.
