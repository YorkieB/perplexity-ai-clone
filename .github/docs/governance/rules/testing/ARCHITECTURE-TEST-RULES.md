---

# **ARCHITECTURE‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **architecture testing** across all governed repositories.  
Its purpose is to ensure that:

- the system adheres to the documented architecture  
- no forbidden dependencies exist  
- no architectural drift occurs  
- boundaries remain intact  
- layers remain isolated  
- the system remains maintainable, predictable, and enforceable  

Architecture tests are the **third deep‑governance layer**, validating the structural integrity of the entire system.

---

## **2. Scope**
These rules apply to:

- modules  
- layers  
- domains  
- services  
- adapters  
- infrastructure components  
- dependency graphs  
- architectural boundaries  

If it participates in the architecture, it must be tested.

---

## **3. Definitions**

### **Architectural Boundary**
A rule defining what a module or layer may or may not depend on.

### **Dependency Rule**
A constraint that governs allowed imports, calls, or interactions.

### **Architectural Drift**
Any deviation from the documented architecture.

### **Forbidden Dependency**
A dependency that violates architectural rules.

---

## **4. Mandatory Rules**

### **4.1 Boundary Enforcement**
Architecture tests must ensure:

- layers only depend on allowed layers  
- modules only depend on allowed modules  
- no cross‑domain leakage occurs  
- no circular dependencies exist  
- no forbidden imports exist  

### **4.2 Dependency Graph Validation**
Tests must validate:

- the dependency graph matches documentation  
- no new edges appear without approval  
- no required edges disappear  
- no dependency shortcuts exist  

### **4.3 Layer Isolation**
Tests must ensure:

- UI cannot call infrastructure directly  
- domain logic cannot depend on UI  
- infrastructure cannot depend on domain internals  
- cross‑layer calls follow documented pathways  

### **4.4 Domain Integrity**
Tests must validate:

- domains remain isolated  
- no domain reaches into another domain’s internals  
- shared modules are used only where documented  
- no domain‑specific logic leaks into shared modules  

### **4.5 Architectural Invariant Enforcement**
Tests must enforce:

- purity of pure layers  
- immutability of immutable layers  
- statelessness of stateless layers  
- determinism of deterministic layers  

---

## **5. Forbidden Patterns**

- circular dependencies  
- cross‑domain leakage  
- cross‑layer leakage  
- forbidden imports  
- undocumented dependencies  
- dependency shortcuts  
- architecture defined in code but not in documentation  
- architecture defined in documentation but not in code  

---

## **6. Required Reasoning**
Each architecture test must document:

- what boundary is being validated  
- why the boundary exists  
- what dependency rules apply  
- what failure mode is being prevented  
- what architectural invariant is being enforced  

This ensures clarity, auditability, and long‑term structural stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any forbidden dependency  
- any architectural drift  
- any missing boundary tests  
- any missing dependency‑graph tests  
- any undocumented architectural change  
- any violation of layer or domain isolation  

Architecture‑test failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of architecture test rules |

---