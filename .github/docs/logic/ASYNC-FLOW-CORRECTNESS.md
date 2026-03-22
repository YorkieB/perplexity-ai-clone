---

# **ASYNC‑FLOW‑CORRECTNESS.md**

## **1. Purpose**
The purpose of this document is to define the mandatory rules governing asynchronous logic across all governed repositories.  
These rules ensure that async operations are:

- deterministic  
- observable  
- safe under failure  
- fully handled  
- testable  
- consistent across all domains  

Asynchronous behavior is one of the most common sources of hidden defects, race conditions, silent failures, and unpredictable system behavior.  
This document establishes the standards required to eliminate those risks.

---

## **2. Scope**
These rules apply to **all asynchronous behavior**, including but not limited to:

- `async` / `await` functions  
- Promises  
- network requests  
- file I/O  
- timers, intervals, and scheduled tasks  
- retry logic  
- backoff strategies  
- polling loops  
- parallel execution  
- concurrency primitives  
- async workflows inside UI components, hooks, services, and utilities  

If a function returns a Promise or interacts with asynchronous behavior, it is governed by this document.

---

## **3. Definitions**

### **Asynchronous Operation**  
Any function or process whose completion occurs outside the current call stack.

### **Deterministic Async Flow**  
An async flow whose behavior does not depend on timing, race conditions, or hidden state.

### **Unhandled Rejection**  
A Promise that rejects without an associated error handler.

### **Cancellation**  
A mechanism that allows an async operation to be aborted safely without leaving the system in an inconsistent state.

### **Concurrency**  
Multiple async operations executing simultaneously.

### **Parallelism**  
Explicit execution of multiple async operations at the same time.

---

## **4. Mandatory Rules**

### **4.1 Error Handling**
- Every async function must explicitly handle both success and failure paths.  
- All async operations must be wrapped in `try/catch` or `.catch()`.  
- Errors must be converted into domain‑specific error types where applicable.  
- Async functions must never swallow errors silently.

### **4.2 Determinism**
- Async flows must not rely on implicit timing or ordering.  
- Parallel operations must be explicitly documented and intentional.  
- Async functions must return consistent types across all code paths.

### **4.3 Cancellation & Timeouts**
- Long‑running async operations must support cancellation where applicable.  
- Timeouts must be explicit and not rely on system defaults.  
- Polling loops must include cancellation and maximum retry limits.

### **4.4 Concurrency Safety**
- Shared state must not be mutated from multiple async operations without synchronization.  
- Async operations must not interleave in ways that cause inconsistent state.

### **4.5 Documentation**
Non‑trivial async flows must include reasoning describing:

- why async is required  
- expected concurrency level  
- ordering assumptions  
- failure modes  
- fallback behavior  
- retry strategy (if any)  

### **4.6 Testability**
- Async functions must be testable without real network or timing dependencies.  
- Async behavior must be covered by unit tests, including error paths.

---

## **5. Forbidden Patterns**

- Fire‑and‑forget async calls without explicit justification.  
- Silent Promise rejections.  
- Using `.then()` without `.catch()`.  
- Mixing callbacks and Promises in the same function.  
- Async functions that return different types depending on branch.  
- Async functions that swallow errors.  
- Async operations inside constructors.  
- Async side effects during module initialization.  
- Relying on `setTimeout` for logic correctness.  

---

## **6. Required Reasoning**

For any async flow that is non‑trivial, the following must be documented:

- **Intent:** Why async is required.  
- **Concurrency Model:** Sequential, parallel, or mixed.  
- **Ordering Guarantees:** What must happen before what.  
- **Failure Modes:** What can go wrong and how it is handled.  
- **Fallback Behavior:** What happens when the operation fails.  
- **Timeouts:** Why the timeout duration is chosen.  
- **Retries:** Why retries are needed and how many.  

This reasoning must appear either:

- in code comments, or  
- in the module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Missing Error Handling**
- Any async function without `try/catch`.  
- Any Promise without `.catch`.  
- Any async function that swallows errors.

### **7.2 Type Inconsistency**
- Async functions returning different types across branches.

### **7.3 Unsafe Concurrency**
- Parallel operations without documentation.  
- Shared state mutated from multiple async flows.

### **7.4 Missing Cancellation**
- Long‑running operations without cancellation support.

### **7.5 Missing Reasoning**
- Non‑trivial async flows without documented assumptions.

### **7.6 Forbidden Patterns**
- Any pattern listed in Section 5.

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Fetches a user with explicit error handling, timeout, and reasoning.
 *
 * Reasoning:
 * - Network call is async and may fail.
 * - Timeout prevents hanging requests.
 * - Error is converted into a domain-specific type.
 */
export async function fetchUser(id: string): Promise<User> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await api.get(`/users/${id}`, { signal: controller.signal });
    clearTimeout(timeout);

    return response.data;
  } catch (err) {
    log.error("Failed to fetch user", { id, err });
    throw new NetworkError("Unable to fetch user");
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
export async function fetchUser(id) {
  return api.get(`/users/${id}`); // no error handling, no timeout, no reasoning
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Fire‑and‑forget operations **only** when:
  - they are explicitly documented  
  - they have no meaningful failure mode  
  - they do not affect system state  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of async governance rules. |

All changes to this document must be reviewed under the **governance change control workflow** and approved by the designated maintainers.

---