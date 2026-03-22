---

# **POSITIVE‑BEHAVIOR‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **positive‑behavior testing** across all governed repositories.  
Its purpose is to ensure that:

- the system behaves correctly under expected conditions  
- valid inputs produce valid outputs  
- documented workflows succeed as intended  
- the system demonstrates correct, stable, predictable behavior  
- no regressions or deviations occur in normal operation  

Positive‑behavior tests are the **fifth deep‑governance layer**, validating the correctness of all “happy‑path” behavior.

---

## **2. Scope**
These rules apply to:

- all documented workflows  
- all valid input scenarios  
- all expected success paths  
- all deterministic operations  
- all stable system behaviors  

If it is expected to work, it must be tested.

---

## **3. Definitions**

### **Positive Behavior**
The system’s correct, intended behavior under valid, expected conditions.

### **Happy Path**
A workflow where:

- inputs are valid  
- dependencies are available  
- no errors occur  
- the system follows the intended path  

### **Expected Output**
The documented, correct result of a valid operation.

---

## **4. Mandatory Rules**

### **4.1 Success Path Validation**
Positive‑behavior tests must ensure:

- valid inputs produce correct outputs  
- workflows complete successfully  
- no unexpected errors occur  
- no fallback logic is triggered  
- no retries occur unless documented  

### **4.2 Output Validation**
Tests must validate:

- correct return values  
- correct data structures  
- correct ordering  
- correct formatting  
- correct metadata  

### **4.3 Workflow Validation**
Tests must ensure:

- all required steps occur  
- steps occur in the correct order  
- no steps are skipped  
- no extra steps occur  
- no hidden flows exist  

### **4.4 State Validation**
Tests must validate:

- correct state transitions  
- correct final state  
- no inconsistent or partial state  
- no unintended side effects  

### **4.5 Determinism**
Positive‑behavior tests must ensure:

- deterministic output for deterministic input  
- no randomness unless explicitly documented  
- no time‑dependent behavior unless explicitly documented  

---

## **5. Forbidden Patterns**

- incomplete happy‑path coverage  
- tests that only check for “no error”  
- tests that ignore output correctness  
- tests that ignore state transitions  
- tests that ignore side effects  
- tests that rely on external systems  
- tests that rely on timing or randomness  

---

## **6. Required Reasoning**
Each positive‑behavior test must document:

- what behavior is being validated  
- why the behavior matters  
- what invariants apply  
- what the expected output is  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term correctness.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing positive‑behavior tests  
- incomplete workflow coverage  
- missing output validation  
- missing state validation  
- nondeterministic behavior  
- undocumented success paths  

Positive‑behavior failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of positive‑behavior test rules |

---