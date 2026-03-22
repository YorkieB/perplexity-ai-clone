---

# **CHANGE‑DETECTION‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **change‑detection testing** across all governed repositories.  
Its purpose is to ensure that:

- all meaningful changes are detected  
- no silent behavioral drift occurs  
- no architectural drift occurs  
- no governance drift occurs  
- no unreviewed or unintended changes enter the system  

Change‑detection tests are the **sixth gate** in the governance pipeline — ensuring that every modification is intentional, visible, and validated.

---

## **2. Scope**
These rules apply to:

- code changes  
- configuration changes  
- dependency changes  
- schema changes  
- interface changes  
- architectural changes  
- governance‑rule changes  

If it can change, it must be detected.

---

## **3. Definitions**

### **Change Detection**
The process of identifying and validating differences between:

- current code  
- previous code  
- expected structure  
- expected behavior  
- expected governance rules  

### **Drift**
Any deviation from expected behavior, structure, or rules that was not explicitly approved.

### **Silent Change**
A change that alters behavior or structure without being detected by tests.

---

## **4. Mandatory Rules**

### **4.1 Behavioral Change Detection**
Change‑detection tests must ensure:

- any change in output is detected  
- any change in side effects is detected  
- any change in invariants is detected  
- any change in error behavior is detected  

### **4.2 Structural Change Detection**
Tests must detect:

- added or removed functions  
- added or removed classes  
- added or removed exports  
- changed interfaces  
- changed schemas  
- changed configuration structures  

### **4.3 Dependency Change Detection**
Tests must detect:

- new dependencies  
- removed dependencies  
- version changes  
- dependency drift  
- dependency conflicts  

### **4.4 Governance Change Detection**
Tests must detect:

- changes to governance rules  
- changes to rule enforcement  
- changes to rule coverage  
- changes to rule mappings  

### **4.5 Change Classification**
Every detected change must be classified as:

- intentional  
- unintentional  
- breaking  
- non‑breaking  
- governance‑impacting  
- architecture‑impacting  

---

## **5. Forbidden Patterns**

- silent behavioral changes  
- silent structural changes  
- silent dependency changes  
- silent governance changes  
- unclassified changes  
- unreviewed changes  
- changes that bypass detection  

---

## **6. Required Reasoning**
Each change‑detection test must document:

- what type of change is being detected  
- why the change matters  
- what invariant is being protected  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any undetected change  
- any unclassified change  
- any unreviewed change  
- any drift in behavior  
- any drift in structure  
- any drift in governance rules  

Change‑detection failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of change‑detection test rules |

---