---

# **ERROR‑HANDLING‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **error‑handling testing** across all governed repositories.  
Its purpose is to ensure that:

- all errors are handled safely  
- all errors follow documented patterns  
- no silent failures occur  
- no unvalidated error paths exist  
- error behavior is predictable, consistent, and governed  

Error‑handling tests are the **second deep‑governance layer**, validating the system’s resilience and correctness under failure conditions.

---

## **2. Scope**
These rules apply to:

- all functions that throw errors  
- all functions that catch errors  
- all retry logic  
- all fallback logic  
- all cleanup logic  
- all error‑producing workflows  
- all error‑sensitive components  

If it can fail, it must be tested.

---

## **3. Definitions**

### **Error Path**
A code path executed when something goes wrong.

### **Silent Failure**
An error that occurs without being logged, surfaced, or handled.

### **Fallback Behavior**
The system’s defined response when an operation fails.

### **Error Invariant**
A rule that must always hold true when errors occur.

---

## **4. Mandatory Rules**

### **4.1 Error Throwing Validation**
Tests must ensure:

- errors are thrown when required  
- errors include correct metadata  
- errors include correct types  
- errors include correct messages  
- no incorrect success paths occur  

### **4.2 Error Catching Validation**
Tests must validate:

- errors are caught where documented  
- errors are not swallowed silently  
- caught errors are transformed correctly  
- caught errors are re‑thrown when required  

### **4.3 Fallback Behavior Validation**
Tests must ensure:

- fallback logic executes correctly  
- fallback logic does not violate invariants  
- fallback logic does not hide failures  
- fallback logic does not produce inconsistent state  

### **4.4 Retry Logic Validation**
Tests must validate:

- retries occur the correct number of times  
- retries use correct backoff strategy  
- retries stop when required  
- retries do not create infinite loops  

### **4.5 Cleanup Behavior Validation**
Tests must ensure:

- cleanup always runs when required  
- cleanup restores consistent state  
- cleanup does not introduce new errors  
- cleanup does not leak resources  

---

## **5. Forbidden Patterns**

- silent failures  
- swallowed errors  
- incorrect error types  
- incorrect error messages  
- fallback logic that hides real failures  
- retry loops without termination  
- cleanup that fails silently  
- inconsistent error structures  
- undocumented error behavior  

---

## **6. Required Reasoning**
Each error‑handling test must document:

- what error is expected  
- why the error occurs  
- what invariant applies  
- what fallback or retry behavior is expected  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term resilience.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing error‑handling tests  
- missing fallback tests  
- missing retry tests  
- missing cleanup tests  
- silent failures  
- swallowed errors  
- inconsistent error structures  
- undocumented error behavior  

Error‑handling failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of error‑handling test rules |

---