---

# **LOGIC‑SANITY‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **logic‑sanity testing** across all governed repositories.  
Its purpose is to ensure that:

- core logic behaves as expected under normal conditions  
- basic invariants hold before deeper tests run  
- no obvious logical contradictions exist  
- no shallow logic errors reach integration or governance layers  

Logic‑sanity tests are the **second gate** after linting — catching structural mistakes before they propagate.

---

## **2. Scope**
These rules apply to:

- all domain logic  
- all utility functions  
- all pure functions  
- all deterministic workflows  
- all modules with defined invariants  

If a function has expected behavior, it must have logic‑sanity tests.

---

## **3. Definitions**

### **Logic Sanity Test**  
A test that verifies the basic correctness of a function or module under normal, expected conditions.

### **Invariant**  
A condition that must always be true for the system to behave correctly.

### **Shallow Logic Error**  
A simple mistake such as:

- wrong comparison  
- wrong boolean condition  
- wrong default value  
- wrong branch taken  
- incorrect return type  
- incorrect ordering  

---

## **4. Mandatory Rules**

### **4.1 Invariant Enforcement**
Logic‑sanity tests must validate:

- all documented invariants  
- all required preconditions  
- all required postconditions  
- all required state transitions  

### **4.2 Deterministic Behavior**
Logic‑sanity tests must ensure:

- deterministic output for deterministic input  
- no randomness unless explicitly documented  
- no time‑dependent behavior unless explicitly documented  

### **4.3 Branch Coverage**
Logic‑sanity tests must cover:

- all major branches  
- all boolean conditions  
- all fallback paths  
- all default behaviors  

### **4.4 Input Validation**
Logic‑sanity tests must validate:

- correct handling of valid inputs  
- correct rejection of invalid inputs  
- correct normalization of ambiguous inputs  

### **4.5 Output Validation**
Logic‑sanity tests must validate:

- correct return types  
- correct return values  
- correct ordering  
- correct structure  

---

## **5. Forbidden Patterns**

- logic tests that only test “happy paths”  
- logic tests that ignore invariants  
- logic tests that ignore fallback behavior  
- logic tests that rely on external systems  
- logic tests that rely on timing  
- logic tests that rely on randomness  

---

## **6. Required Reasoning**
Each logic‑sanity test must document:

- what invariant is being validated  
- why the invariant matters  
- what failure mode is being prevented  
- what assumptions are being tested  

This ensures clarity and auditability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing logic‑sanity tests  
- incomplete branch coverage  
- missing invariant validation  
- non‑deterministic logic tests  
- logic tests that rely on external systems  

Logic‑sanity failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of logic‑sanity test rules |

---