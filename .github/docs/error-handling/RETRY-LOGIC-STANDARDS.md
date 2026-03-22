---

# **RETRY‑LOGIC‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for implementing retry logic across all governed repositories.  
Retries are powerful but dangerous: when misused, they amplify failures, overload systems, hide bugs, and create cascading outages.

These rules ensure that retries are:

- intentional  
- bounded  
- observable  
- safe  
- deterministic  
- consistent across the system  

Retries must never be used as a substitute for correctness, validation, or proper error handling.

---

## **2. Scope**
These rules apply to:

- all network calls  
- all service‑to‑service communication  
- all database operations  
- all file I/O  
- all async workflows  
- all background jobs  
- all retry utilities and wrappers  

If a function attempts an operation more than once, it is governed by this document.

---

## **3. Definitions**

### **Retry**
A repeated attempt to perform an operation after a failure.

### **Backoff Strategy**
A delay pattern between retries (e.g., exponential, linear, jittered).

### **Retry Budget**
The maximum number of retries allowed for a given operation.

### **Idempotent Operation**
An operation that can be safely retried without causing unintended side effects.

### **Transient Error**
A temporary failure that may succeed on retry (e.g., network hiccup).

### **Fatal Error**
A failure that must not be retried (e.g., validation error, permission error).

---

## **4. Mandatory Rules**

### **4.1 Retry Boundaries**
- All retries must have a strict maximum attempt count.  
- Infinite retries are forbidden.  
- Retry counts must be documented and justified.

### **4.2 Backoff Requirements**
- Retries must use a backoff strategy.  
- Exponential backoff with jitter is preferred.  
- Backoff intervals must be documented.

### **4.3 Error Classification**
- Only transient errors may be retried.  
- Fatal errors must not be retried.  
- Validation errors must not be retried.  
- Authentication and authorization errors must not be retried.

### **4.4 Idempotency**
- Only idempotent operations may be retried.  
- If an operation is not idempotent, retries must be explicitly justified and documented.

### **4.5 Observability**
- All retries must be logged at `debug` or `info` level.  
- Final failures must be logged at `warn` or `error` level.  
- Logs must include attempt count and correlation ID.

### **4.6 Documentation**
Non‑trivial retry logic must document:

- why retries are needed  
- what errors are considered transient  
- retry count  
- backoff strategy  
- idempotency assumptions  
- failure behavior after final attempt  

---

## **5. Forbidden Patterns**

- Infinite retry loops.  
- Retries without backoff.  
- Retries on fatal errors.  
- Retries on validation errors.  
- Retries on authentication or authorization errors.  
- Retries inside tight loops.  
- Retries that hide underlying failures.  
- Retries that mutate shared state unsafely.  
- Retries that rely on implicit timing.  

---

## **6. Required Reasoning**

For any retry logic beyond trivial cases, the code must include reasoning describing:

- why retrying is safe  
- why retrying is necessary  
- what assumptions are being made  
- what constitutes a transient error  
- what the maximum retry count is  
- why the chosen backoff strategy is appropriate  
- what happens after the final failure  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Missing Boundaries**
- Retries without a maximum attempt count.  
- Retries without backoff.  

### **7.2 Incorrect Error Handling**
- Retrying fatal errors.  
- Retrying validation errors.  
- Retrying authentication or authorization errors.  

### **7.3 Unsafe Behavior**
- Retrying non‑idempotent operations without justification.  
- Retrying inside reducers or pure functions.  
- Retrying inside UI render paths.  

### **7.4 Missing Documentation**
- Retry logic without reasoning.  
- Retry logic without idempotency explanation.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Retry Strategy:
 * - Up to 3 attempts.
 * - Exponential backoff with jitter.
 * - Only retries transient network errors.
 * - Operation is idempotent (GET request).
 */
export async function fetchUserWithRetry(id: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await api.get(`/users/${id}`);
    } catch (err) {
      if (!isTransientError(err)) {
        throw err; // fatal error, do not retry
      }

      if (attempt === maxAttempts) {
        log.error("Failed to fetch user after retries", { id, err });
        throw new NetworkError("Unable to fetch user");
      }

      const delay = getExponentialBackoff(attempt);
      await sleep(delay);
    }
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
while (true) {
  try {
    return await api.get("/data"); // ❌ infinite retry loop
  } catch {}
}
```

### **8.3 Non‑Compliant Example**
```ts
try {
  return await api.post("/users", user); // ❌ non-idempotent operation retried
} catch {
  return await api.post("/users", user);
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Background jobs may use higher retry counts **only if**:
  - the operation is idempotent  
  - the retry budget is documented  
  - the retry behavior is monitored  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of retry logic standards. |

All changes to this document must follow the **governance change control workflow**.

---