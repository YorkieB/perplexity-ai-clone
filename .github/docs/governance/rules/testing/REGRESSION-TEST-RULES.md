---

# **REGRESSION‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **regression testing** across all governed repositories.  
Its purpose is to ensure that:

- previously working behavior never breaks  
- fixes remain fixed  
- features remain stable  
- governance rules remain enforced across versions  
- no accidental reintroduction of bugs or violations occurs  

Regression tests are the **sixteenth deep‑governance layer**, protecting the system from backwards drift.

---

## **2. Scope**
These rules apply to:

- all previously validated behaviors  
- all fixed bugs  
- all resolved governance violations  
- all documented workflows  
- all invariants that must remain stable  
- all rule‑enforced behaviors  

If it worked before, regression tests must ensure it still works.

---

## **3. Definitions**

### **Regression**
A reappearance of a previously fixed bug, violation, or incorrect behavior.

### **Stability Invariant**
A rule stating that certain behaviors must remain unchanged across versions.

### **Historical Behavior**
Any behavior that has been validated, documented, or relied upon.

---

## **4. Mandatory Rules**

### **4.1 Historical Behavior Validation**
Regression tests must ensure:

- all previously working workflows still work  
- all previously correct outputs remain correct  
- all previously validated invariants still hold  
- no historical behavior changes without explicit approval  

### **4.2 Bug‑Fix Validation**
Tests must validate:

- fixed bugs never reappear  
- fixed governance violations never reappear  
- fixes remain stable across refactors  
- fixes remain stable across architectural changes  

### **4.3 Rule Stability Validation**
Tests must ensure:

- rule‑enforced behavior remains consistent  
- rule‑enforced invariants remain enforced  
- no rule becomes weaker over time  
- no rule is bypassed due to code changes  

### **4.4 Workflow Stability**
Tests must validate:

- workflow steps remain correct  
- workflow ordering remains correct  
- workflow outputs remain correct  
- workflow side effects remain correct  

### **4.5 Drift Detection**
Regression tests must detect:

- behavioral drift  
- output drift  
- invariant drift  
- rule‑enforcement drift  

---

## **5. Forbidden Patterns**

- reintroduced bugs  
- reintroduced governance violations  
- weakened invariants  
- weakened rule enforcement  
- changed outputs without documentation  
- changed workflows without documentation  
- silent behavioral drift  
- regression tests that only check for “no error”  

---

## **6. Required Reasoning**
Each regression test must document:

- what historical behavior is being protected  
- what bug or violation was previously fixed  
- what invariant must remain stable  
- what output or workflow must remain unchanged  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term system stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any regression  
- any reintroduced bug  
- any reintroduced violation  
- any weakened rule  
- any weakened invariant  
- any undocumented behavioral change  
- any drift in workflow or output  

Regression‑test failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of regression test rules |

---