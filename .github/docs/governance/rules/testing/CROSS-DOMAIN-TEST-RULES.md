---

# **CROSS‑DOMAIN‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **cross‑domain testing** across all governed repositories.  
Its purpose is to ensure that:

- domains interact only through approved interfaces  
- no domain leaks internal logic into another  
- no cross‑domain shortcuts or backdoors exist  
- domain boundaries remain intact and enforceable  
- multi‑domain workflows behave predictably and safely  

Cross‑domain tests are the **eighth deep‑governance layer**, validating the integrity of interactions across domain boundaries.

---

## **2. Scope**
These rules apply to:

- domain‑to‑domain interactions  
- shared modules  
- orchestrators that span domains  
- cross‑domain workflows  
- domain‑specific invariants  
- domain isolation rules  

If it crosses a domain boundary, it must be tested.

---

## **3. Definitions**

### **Domain**
A logically isolated area of the system with its own:

- responsibilities  
- invariants  
- data structures  
- workflows  
- boundaries  

### **Cross‑Domain Interaction**
Any interaction where one domain:

- calls another  
- depends on another  
- consumes another’s data  
- triggers another’s workflow  

### **Domain Leakage**
When a domain exposes internal logic, data, or assumptions to another domain.

---

## **4. Mandatory Rules**

### **4.1 Boundary Enforcement**
Cross‑domain tests must ensure:

- domains interact only through documented interfaces  
- no internal APIs are accessed directly  
- no domain reaches into another’s internals  
- no shared state exists outside approved modules  

### **4.2 Data Contract Validation**
Tests must validate:

- data passed between domains matches documented schemas  
- no undocumented fields appear  
- no required fields are missing  
- no domain‑specific data leaks across boundaries  

### **4.3 Workflow Validation**
Tests must ensure:

- cross‑domain workflows follow documented sequences  
- no steps are skipped  
- no extra steps occur  
- no hidden flows exist  

### **4.4 Invariant Enforcement**
Tests must enforce:

- domain invariants  
- cross‑domain invariants  
- safety invariants  
- architectural invariants  

### **4.5 Dependency Validation**
Tests must ensure:

- no forbidden domain dependencies exist  
- no circular domain dependencies exist  
- no domain depends on another’s private modules  
- no domain bypasses shared modules  

---

## **5. Forbidden Patterns**

- cross‑domain leakage  
- undocumented cross‑domain calls  
- direct access to another domain’s internals  
- shared state outside approved modules  
- mismatched data contracts  
- circular domain dependencies  
- hidden cross‑domain workflows  
- domain‑specific logic in shared modules  

---

## **6. Required Reasoning**
Each cross‑domain test must document:

- what domains are interacting  
- what interface is being used  
- what invariants apply  
- what data contract is expected  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term domain integrity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing cross‑domain tests  
- missing data‑contract validation  
- missing boundary validation  
- domain leakage  
- forbidden domain dependencies  
- circular domain dependencies  
- undocumented cross‑domain workflows  

Cross‑domain failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of cross‑domain test rules |

---