---

# **TEST‑DRIFT‑DETECTION‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **test‑drift detection** across all governed repositories.  
Its purpose is to ensure that:

- tests evolve in sync with the codebase  
- tests do not become stale, outdated, or misleading  
- no test silently stops validating what it claims to validate  
- no test becomes irrelevant due to architectural or rule changes  
- the test suite remains aligned with the governance universe  

Test‑drift detection is the **fourteenth deep‑governance layer**, ensuring the long‑term integrity and relevance of the entire testing ecosystem.

---

## **2. Scope**
These rules apply to:

- all test files  
- all test logic  
- all test assertions  
- all test fixtures  
- all mocks and stubs  
- all test‑mapping metadata  
- all rule‑mapping metadata  

If it can drift, it must be monitored.

---

## **3. Definitions**

### **Test Drift**
Any situation where a test:

- no longer validates the rule it claims to validate  
- no longer matches the current code behavior  
- references outdated logic  
- references outdated rules  
- passes for the wrong reasons  
- fails for the wrong reasons  

### **Stale Test**
A test that:

- references removed code  
- references removed rules  
- validates outdated behavior  
- no longer matches the system’s architecture  

### **Assertion Drift**
When test assertions:

- no longer match expected behavior  
- become too weak  
- become too broad  
- become irrelevant  

---

## **4. Mandatory Rules**

### **4.1 Code‑to‑Test Synchronization**
Test‑drift detection must ensure:

- tests update when code updates  
- tests update when rules update  
- tests update when architecture updates  
- no test references removed or renamed components  

### **4.2 Rule‑to‑Test Synchronization**
Tests must validate:

- rule changes trigger test updates  
- rule removals trigger test removals  
- rule additions trigger new tests  
- no test enforces outdated rules  

### **4.3 Assertion Integrity**
Tests must ensure:

- assertions remain strict  
- assertions remain relevant  
- assertions validate the correct invariants  
- assertions do not become overly permissive  

### **4.4 Fixture and Mock Validation**
Tests must validate:

- mocks match real interfaces  
- fixtures match real data structures  
- no outdated mocks exist  
- no mocks bypass governance rules  

### **4.5 Drift Detection Automation**
The system must detect:

- stale tests  
- outdated assertions  
- outdated fixtures  
- outdated mocks  
- outdated rule mappings  
- outdated test mappings  

---

## **5. Forbidden Patterns**

- stale tests  
- outdated assertions  
- outdated mocks  
- outdated fixtures  
- tests that pass for the wrong reason  
- tests that fail for the wrong reason  
- tests that no longer enforce their mapped rule  
- tests that silently drift from their purpose  

---

## **6. Required Reasoning**
Each drift‑detection rule must document:

- what drift is being detected  
- why the drift matters  
- what invariant is being protected  
- what rule or behavior the test must align with  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term test reliability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any stale test  
- any outdated test  
- any outdated assertion  
- any outdated fixture  
- any outdated mock  
- any rule‑test mismatch  
- any mapping drift  
- any test that no longer enforces its intended rule  

Test‑drift detection failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of test‑drift detection rules |

---