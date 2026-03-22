---

# **NEGATIVE‑BEHAVIOR‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **negative‑behavior testing** across all governed repositories.  
Its purpose is to ensure that:

- the system fails safely under invalid conditions  
- invalid inputs are rejected correctly  
- forbidden operations are blocked  
- invariants are enforced even under stress  
- the system never enters unsafe or undefined states  

Negative‑behavior tests are the **sixth deep‑governance layer**, validating the system’s defensive correctness.

---

## **2. Scope**
These rules apply to:

- invalid inputs  
- malformed data  
- forbidden operations  
- boundary‑breaking attempts  
- unsafe state transitions  
- invalid workflows  
- misuse scenarios  

If it *should not* work, it must be tested.

---

## **3. Definitions**

### **Negative Behavior**
The system’s correct response to invalid, unsafe, or forbidden conditions.

### **Invalid Input**
Any input that violates:

- type constraints  
- schema constraints  
- domain rules  
- safety rules  
- governance rules  

### **Forbidden Operation**
Any operation that the system must reject.

### **Unsafe State**
A state that violates invariants or creates risk.

---

## **4. Mandatory Rules**

### **4.1 Invalid Input Rejection**
Negative‑behavior tests must ensure:

- invalid inputs are rejected  
- correct error types are thrown  
- correct error messages are produced  
- no partial or inconsistent state is created  

### **4.2 Forbidden Operation Blocking**
Tests must validate:

- forbidden operations are blocked  
- forbidden operations produce correct errors  
- no fallback logic is triggered  
- no silent failures occur  

### **4.3 Boundary Condition Validation**
Tests must ensure:

- boundaries are enforced  
- limits are respected  
- edge cases do not break invariants  
- no overflow or underflow occurs  

### **4.4 State Protection**
Tests must validate:

- invalid transitions are blocked  
- invalid states cannot be reached  
- no inconsistent state persists after failure  
- cleanup occurs when required  

### **4.5 Safety Enforcement**
Tests must ensure:

- no unsafe behavior occurs  
- no unsafe defaults exist  
- no unsafe assumptions are made  
- no unsafe side effects occur  

---

## **5. Forbidden Patterns**

- silent failures  
- swallowed errors  
- partial success on invalid input  
- inconsistent state after failure  
- fallback logic triggered by invalid input  
- tests that only check for “throws” without validating correctness  
- tests that ignore side effects  
- tests that ignore invariants  

---

## **6. Required Reasoning**
Each negative‑behavior test must document:

- what invalid condition is being tested  
- why the condition is invalid  
- what invariant is being protected  
- what error or behavior is expected  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term safety.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing negative‑behavior tests  
- missing boundary tests  
- missing forbidden‑operation tests  
- missing invalid‑input tests  
- inconsistent error behavior  
- unsafe state transitions  
- silent failures  

Negative‑behavior failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of negative‑behavior test rules |

---