---

# **MUTATION‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **mutation testing** across all governed repositories.  
Its purpose is to ensure that:

- tests are strong enough to detect incorrect behavior  
- weak or superficial tests are exposed  
- assertions are meaningful and strict  
- the test suite cannot be trivially bypassed  
- governance‑enforced behavior is truly validated  

Mutation tests are the **seventeenth deep‑governance layer**, validating the *strength* of the test suite itself.

---

## **2. Scope**
These rules apply to:

- all unit tests  
- all integration tests  
- all rule‑enforcement tests  
- all invariants validated by tests  
- all code paths that must be protected by strong assertions  

If a test claims to enforce correctness, mutation testing must validate that claim.

---

## **3. Definitions**

### **Mutation**
A deliberate, controlled modification to code intended to simulate a bug or incorrect behavior.

### **Mutation Kill**
A mutation that causes a test to fail — indicating the test is strong.

### **Mutation Survive**
A mutation that does *not* cause a test to fail — indicating the test is weak.

### **Mutation Score**
The percentage of mutations killed by the test suite.

---

## **4. Mandatory Rules**

### **4.1 Mutation Coverage**
Mutation tests must ensure:

- all critical code paths are mutated  
- all rule‑enforced logic is mutated  
- all invariants are mutated  
- all boundary conditions are mutated  

### **4.2 Assertion Strength Validation**
Tests must validate:

- assertions are strict enough to detect incorrect behavior  
- assertions validate the correct invariants  
- assertions do not allow incorrect outputs  
- assertions do not allow incorrect state transitions  

### **4.3 Mutation Score Requirements**
Mutation tests must enforce:

- a minimum mutation score (documented per repository)  
- no critical mutation may survive  
- no rule‑enforcement mutation may survive  
- no invariant‑related mutation may survive  

### **4.4 Surviving Mutation Detection**
Tests must detect:

- weak tests  
- missing assertions  
- overly broad assertions  
- tests that pass for the wrong reason  
- tests that do not validate behavior deeply enough  

### **4.5 Governance‑Sensitive Mutation**
Tests must ensure:

- governance rules cannot be bypassed by mutation  
- safety invariants cannot be bypassed  
- architectural invariants cannot be bypassed  
- domain invariants cannot be bypassed  

---

## **5. Forbidden Patterns**

- surviving mutations in critical logic  
- surviving mutations in rule‑enforced logic  
- surviving mutations in invariants  
- weak assertions  
- overly permissive tests  
- tests that only check for “no error”  
- mutation tests that rely on randomness  
- mutation tests that rely on timing  

---

## **6. Required Reasoning**
Each mutation test must document:

- what behavior is being mutated  
- why the mutation matters  
- what invariant the test protects  
- what assertion is expected to fail  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term test strength.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- surviving critical mutations  
- surviving rule‑enforcement mutations  
- surviving invariant mutations  
- weak or missing assertions  
- insufficient mutation coverage  
- mutation score regressions  

Mutation‑test failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of mutation test rules |

---