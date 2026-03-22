---

# **SYSTEM‑LEVEL‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **system‑level testing** across all governed repositories.  
Its purpose is to ensure that:

- the system behaves correctly as a whole  
- cross‑module interactions follow documented rules  
- system invariants hold under real execution  
- no hidden integration paths exist  
- the system respects governance constraints during full execution  

System‑level tests are the **fourth deep‑governance layer**, validating the behavior of the entire system under realistic conditions.

---

## **2. Scope**
These rules apply to:

- full workflows  
- orchestrated processes  
- multi‑module interactions  
- cross‑domain operations  
- system‑wide invariants  
- research/sourcing behavior  
- continuous execution rules  

If it spans multiple components, it must be tested at the system level.

---

## **3. Definitions**

### **System‑Level Behavior**
The combined behavior of multiple modules, layers, or domains working together.

### **System Invariant**
A rule that must always hold true across the entire system.

### **Cross‑Module Interaction**
Any interaction where one module depends on or triggers another.

### **Governance‑Sensitive Operation**
Any operation that touches:

- research  
- sourcing  
- citations  
- rule enforcement  
- safety boundaries  
- continuous execution constraints  

---

## **4. Mandatory Rules**

### **4.1 Workflow Validation**
System‑level tests must ensure:

- full workflows execute correctly  
- all required steps occur in the correct order  
- no steps are skipped  
- no extra steps occur  
- no hidden flows exist  

### **4.2 Cross‑Module Interaction Validation**
Tests must validate:

- modules interact only through documented interfaces  
- no internal APIs are accessed directly  
- no cross‑domain leakage occurs  
- no forbidden dependencies appear at runtime  

### **4.3 System Invariant Enforcement**
Tests must enforce:

- safety invariants  
- architectural invariants  
- governance invariants  
- domain invariants  
- state invariants  

### **4.4 Research & Sourcing Validation**
Tests must ensure:

- research is performed only when allowed  
- citations follow governance rules  
- no hallucinated sources appear  
- no missing citations occur  
- no forbidden domains are used  

### **4.5 Continuous Execution Rules**
Tests must validate:

- no infinite loops  
- no runaway recursion  
- no unbounded retries  
- no unbounded memory growth  
- no unbounded output generation  

---

## **5. Forbidden Patterns**

- hidden cross‑module interactions  
- undocumented workflows  
- missing system invariants  
- forbidden research behavior  
- hallucinated citations  
- missing citations  
- infinite loops  
- unbounded retries  
- unbounded memory or output growth  
- runtime dependency shortcuts  

---

## **6. Required Reasoning**
Each system‑level test must document:

- what workflow is being validated  
- what modules interact  
- what invariants apply  
- what governance rules apply  
- what failure modes are being prevented  

This ensures clarity, auditability, and long‑term system stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing system‑level tests  
- missing workflow coverage  
- missing cross‑module validation  
- missing research/sourcing validation  
- missing continuous‑execution validation  
- system‑level drift  
- invariant violations  

System‑level failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of system‑level test rules |

---