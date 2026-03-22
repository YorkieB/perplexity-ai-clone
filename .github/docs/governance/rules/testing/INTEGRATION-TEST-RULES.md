---

# **INTEGRATION‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **integration testing** across all governed repositories.  
Its purpose is to ensure that:

- components interact correctly  
- modules integrate without breaking invariants  
- cross‑module workflows behave as documented  
- no hidden assumptions exist between components  
- integration points remain stable and predictable  

Integration tests are the **ninth deep‑governance layer**, validating the correctness of interactions between multiple parts of the system.

---

## **2. Scope**
These rules apply to:

- multi‑module interactions  
- component‑to‑component interactions  
- adapter‑to‑service interactions  
- domain‑to‑infrastructure interactions  
- orchestrated workflows  
- integration boundaries  

If two or more components interact, integration tests must cover it.

---

## **3. Definitions**

### **Integration Point**
Any location where two or more components interact through:

- function calls  
- events  
- data exchange  
- shared workflows  
- adapters or interfaces  

### **Integration Contract**
The documented expectations for how components interact.

### **Integration Drift**
Any deviation from the documented integration contract.

---

## **4. Mandatory Rules**

### **4.1 Contract Enforcement**
Integration tests must ensure:

- components follow documented interfaces  
- no internal APIs are accessed directly  
- no undocumented fields appear in data exchange  
- no required fields are missing  
- no assumptions are made about internal state  

### **4.2 Workflow Validation**
Tests must validate:

- multi‑step workflows execute correctly  
- steps occur in the correct order  
- no steps are skipped  
- no extra steps occur  
- no hidden flows exist  

### **4.3 Data Exchange Validation**
Tests must ensure:

- data structures match documented schemas  
- no type mismatches occur  
- no data loss occurs  
- no data duplication occurs  
- no domain‑specific data leaks across boundaries  

### **4.4 Error Propagation**
Tests must validate:

- errors propagate correctly across components  
- no errors are swallowed  
- no inconsistent error structures appear  
- fallback behavior is consistent across modules  

### **4.5 State Consistency**
Tests must ensure:

- state remains consistent across components  
- no partial updates occur  
- no inconsistent state persists after failure  
- no cross‑component side effects violate invariants  

---

## **5. Forbidden Patterns**

- undocumented integration paths  
- hidden dependencies  
- direct access to internal APIs  
- mismatched data contracts  
- inconsistent error propagation  
- partial state updates  
- integration tests that rely on timing or randomness  
- integration tests that depend on external systems  

---

## **6. Required Reasoning**
Each integration test must document:

- what components are interacting  
- what contract governs the interaction  
- what data is exchanged  
- what invariants apply  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term integration stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing integration tests  
- missing contract validation  
- missing workflow validation  
- mismatched data structures  
- inconsistent error propagation  
- integration drift  
- undocumented integration paths  

Integration‑test failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of integration test rules |

---