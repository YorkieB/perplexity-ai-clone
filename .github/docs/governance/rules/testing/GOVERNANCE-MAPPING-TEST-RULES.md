---

# **GOVERNANCE‑MAPPING‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **governance‑mapping testing** across all governed repositories.  
Its purpose is to ensure that:

- every file is mapped to the correct governance rules  
- every rule is mapped to the correct enforcement layer  
- no unmapped code exists  
- no orphaned rules exist  
- no governance gaps exist  
- the governance engine has full, accurate coverage  

Governance‑mapping tests are the **seventh and final gate** of the pre‑overseer layer — ensuring the entire system is correctly wired into the governance universe before deeper enforcement begins.

---

## **2. Scope**
These rules apply to:

- all source files  
- all test files  
- all configuration files  
- all infrastructure files  
- all governance rule files  
- all rule‑mapping manifests  
- all enforcement metadata  

If it exists in the repository, it must be mapped.

---

## **3. Definitions**

### **Governance Mapping**
The explicit association between:

- a file  
- a rule  
- a rule category  
- an enforcement layer  
- a test suite  

### **Unmapped File**
A file that exists in the repository but is not associated with any governance rule.

### **Orphaned Rule**
A governance rule that exists but is not mapped to any file or enforcement path.

### **Mapping Drift**
Any deviation between expected mappings and actual mappings.

---

## **4. Mandatory Rules**

### **4.1 File‑to‑Rule Mapping**
Governance‑mapping tests must ensure:

- every file is mapped to at least one rule  
- no file is mapped to irrelevant rules  
- no file is excluded without explicit approval  
- mapping metadata is complete and correct  

### **4.2 Rule‑to‑File Mapping**
Tests must validate:

- every rule is mapped to at least one file  
- no rule is orphaned  
- no rule is duplicated  
- no rule is mis‑categorized  

### **4.3 Layer Mapping**
Tests must ensure:

- every rule belongs to the correct enforcement layer  
- no rule is placed in the wrong layer  
- no rule bypasses its intended layer  
- no rule is missing from its layer manifest  

### **4.4 Mapping Integrity**
Governance‑mapping tests must detect:

- missing mappings  
- incorrect mappings  
- outdated mappings  
- drift between code and rule definitions  
- drift between rule files and layer manifests  

### **4.5 Mapping Completeness**
Tests must validate:

- 100% mapping coverage  
- 0% unmapped files  
- 0% orphaned rules  
- 0% ambiguous mappings  

---

## **5. Forbidden Patterns**

- unmapped files  
- orphaned rules  
- incorrect rule categories  
- incorrect enforcement layers  
- outdated mapping manifests  
- duplicated mappings  
- missing mapping metadata  
- mapping drift of any kind  

---

## **6. Required Reasoning**
Each governance‑mapping test must document:

- what mapping is being validated  
- why the mapping matters  
- what invariant is being enforced  
- what failure mode is being prevented  

This ensures clarity, auditability, and long‑term governance stability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any unmapped file  
- any orphaned rule  
- any incorrect mapping  
- any mapping drift  
- any missing mapping metadata  
- any rule placed in the wrong enforcement layer  

Mapping failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of governance‑mapping test rules |

---