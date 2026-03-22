---

# **FALLBACK‑BEHAVIOR‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for implementing fallback behavior across all governed repositories.  
Fallbacks are powerful tools for resilience, but when misused they can:

- hide failures  
- corrupt state  
- degrade user experience  
- create inconsistent behavior  
- mask systemic issues  
- introduce security vulnerabilities  

These rules ensure that fallback behavior is **intentional, safe, predictable, observable, and fully governed**.

---

## **2. Scope**
These rules apply to:

- all service calls  
- all network operations  
- all async workflows  
- all caching layers  
- all UI rendering fallbacks  
- all retry and backoff systems  
- all error recovery paths  
- all feature‑flagged or degraded‑mode behaviors  

If code attempts to “do something else” when the primary path fails, it is governed by this document.

---

## **3. Definitions**

### **Fallback Behavior**  
A secondary action taken when the primary operation fails.

### **Graceful Degradation**  
A controlled reduction in functionality that preserves core behavior.

### **Fail‑Fast**  
Immediate termination of an operation when a critical assumption is violated.

### **Critical Path**  
A sequence of operations that must succeed for the system to remain correct.

### **Soft Failure**  
A failure that can be recovered from without compromising correctness.

---

## **4. Mandatory Rules**

### **4.1 Explicit Fallbacks Only**
- Fallback behavior must be explicit, not implicit.  
- Fallbacks must be documented.  
- Fallbacks must be intentional, not accidental.

### **4.2 Fallbacks Must Be Safe**
Fallbacks must not:

- corrupt state  
- hide critical failures  
- violate invariants  
- introduce security risks  
- create inconsistent behavior  

### **4.3 Fallbacks Must Be Observable**
- All fallback activations must be logged.  
- Logs must include correlation IDs.  
- Logs must include the reason for fallback activation.

### **4.4 Fallbacks Must Be Bounded**
- Fallbacks must not create infinite loops.  
- Fallbacks must not retry indefinitely.  
- Fallbacks must not cascade into other fallbacks without justification.

### **4.5 Fallbacks Must Preserve Correctness**
Fallbacks must:

- maintain system invariants  
- maintain data integrity  
- maintain user safety  
- maintain security guarantees  

### **4.6 Documentation Requirements**
Non‑trivial fallback behavior must document:

- why the fallback exists  
- what conditions trigger it  
- what assumptions it relies on  
- what behavior is degraded  
- what behavior is preserved  
- what happens if the fallback fails  

---

## **5. Forbidden Patterns**

- Silent fallback behavior.  
- Fallbacks that hide critical errors.  
- Fallbacks that violate invariants.  
- Fallbacks that degrade security.  
- Fallbacks that mutate shared state unsafely.  
- Fallbacks that rely on implicit timing.  
- Fallbacks that retry non‑idempotent operations.  
- Fallbacks that mask configuration errors.  
- Fallbacks that produce inconsistent UI states.  

---

## **6. Required Reasoning**

For any fallback behavior, the code must include reasoning describing:

- why fallback is necessary  
- why fallback is safe  
- what assumptions are being made  
- what the fallback guarantees  
- what the fallback does *not* guarantee  
- what happens if fallback also fails  
- how fallback behavior is tested  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Missing Documentation**
- Fallbacks without reasoning.  
- Fallbacks without documented triggers.  

### **7.2 Unsafe Behavior**
- Fallbacks that hide critical failures.  
- Fallbacks that degrade security.  
- Fallbacks that violate invariants.  

### **7.3 Missing Observability**
- Fallbacks that do not log activation.  
- Fallbacks that do not include metadata.  

### **7.4 Incorrect Use**
- Fallbacks used instead of proper error handling.  
- Fallbacks used to mask configuration issues.  
- Fallbacks used to bypass governance.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Fallback Behavior:
 * - If the primary cache is unavailable, fall back to the database.
 *
 * Reasoning:
 * - Cache failures are transient.
 * - Database read is safe and idempotent.
 * - Fallback is logged for observability.
 */
export async function getUserProfile(id: string) {
  try {
    return await cache.get(id);
  } catch (err) {
    log.warn("Cache read failed, falling back to DB", {
      id,
      correlationId: ctx.correlationId,
      errorType: err.name,
    });

    return await db.users.find(id);
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
try {
  return await cache.get(id);
} catch {
  return {}; // ❌ silent fallback, corrupts state
}
```

### **8.3 Non‑Compliant Example**
```ts
if (!config.apiKey) {
  return mockData; // ❌ masking configuration error
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- UI components may use visual fallbacks (e.g., skeleton loaders) **only if**:
  - the fallback is safe  
  - the fallback is consistent  
  - the fallback is documented  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of fallback behavior standards. |

All changes to this document must follow the **governance change control workflow**.

---