---

# **STATIC‑ANALYSIS‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **static analysis testing** across all governed repositories.  
Its purpose is to ensure that:

- structural defects are detected early  
- unsafe patterns are caught before runtime  
- type correctness is enforced  
- code quality remains consistent  
- deeper tests are not wasted on invalid code  

Static analysis tests are the **fourth gate** in the governance pipeline — deeper than linting, broader than logic sanity, and more structural than component‑health tests.

---

## **2. Scope**
These rules apply to:

- all typed code  
- all untyped code with inferred types  
- all configuration files with schemas  
- all infrastructure definitions  
- all code paths validated by static analysis tools  

If it can be statically analyzed, it must be.

---

## **3. Definitions**

### **Static Analysis**
Automated inspection of code without executing it, detecting:

- type errors  
- unreachable code  
- unsafe patterns  
- incorrect assumptions  
- dependency issues  
- structural inconsistencies  

### **Type Safety**
Guarantee that values match their declared or inferred types.

### **Structural Integrity**
Guarantee that modules, functions, and interfaces match their documented shape.

---

## **4. Mandatory Rules**

### **4.1 Type Enforcement**
Static analysis tests must ensure:

- no type errors exist  
- no implicit any‑types (unless explicitly allowed)  
- no unsafe casts  
- no mismatched return types  
- no incorrect generics usage  

### **4.2 Structural Enforcement**
Static analysis tests must validate:

- all modules export the documented interface  
- all functions match documented signatures  
- all classes match documented structure  
- all dependency graphs are valid  

### **4.3 Flow Analysis**
Static analysis must detect:

- unreachable code  
- dead branches  
- unused variables  
- unused parameters  
- unused exports  
- missing return statements  

### **4.4 Safety Enforcement**
Static analysis must detect:

- unsafe null/undefined access  
- unsafe mutation of shared state  
- unsafe exception handling  
- unsafe fallthrough in switch statements  
- unsafe recursion patterns  

### **4.5 Dependency Validation**
Static analysis must ensure:

- no missing dependencies  
- no unused dependencies  
- no circular dependencies  
- no version‑incompatible dependencies  

---

## **5. Forbidden Patterns**

- implicit any types  
- unsafe casts  
- unused variables  
- unused imports  
- unreachable code  
- circular dependencies  
- mismatched interfaces  
- undocumented exports  
- silent type coercion  
- unsafe null access  

---

## **6. Required Reasoning**
Static analysis rules must be documented with:

- why the rule exists  
- what risk it prevents  
- what pattern it enforces  
- examples of compliant and non‑compliant code  

This ensures clarity, auditability, and long‑term maintainability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any static analysis violation  
- any disabled static rule without justification  
- any attempt to bypass static analysis  
- any file excluded from static analysis without approval  

Static analysis failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of static‑analysis test rules |

---