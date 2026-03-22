---

# **LINT‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **lint testing** across all governed repositories.  
Its purpose is to ensure that:

- code is syntactically correct  
- code follows required formatting standards  
- code avoids forbidden patterns  
- code remains readable, consistent, and maintainable  
- violations are caught before deeper tests run  

Lint tests are the **first line of defense** in the governance pipeline.

---

## **2. Scope**
These rules apply to:

- all source code files  
- all configuration files  
- all scripts  
- all infrastructure definitions  
- all documentation files that require linting (e.g., Markdown)  

If a file is part of the repository, it is subject to lint governance.

---

## **3. Definitions**

### **Linting**
Static analysis that checks code for:

- syntax errors  
- formatting violations  
- style violations  
- forbidden patterns  
- unsafe constructs  

### **Lint Rule**
A specific constraint that must be enforced by the linting engine.

### **Lint Failure**
Any violation of a lint rule.

---

## **4. Mandatory Rules**

### **4.1 Syntax Enforcement**
Lint tests must ensure:

- no syntax errors exist  
- no incomplete constructs exist  
- no unused imports or variables remain  
- no unreachable code exists  

### **4.2 Formatting Enforcement**
Lint tests must validate:

- consistent indentation  
- consistent line length  
- consistent naming conventions  
- consistent file structure  
- consistent whitespace rules  

### **4.3 Forbidden Patterns**
Lint tests must detect and block:

- console/debug logging in production code  
- commented‑out code blocks  
- wildcard imports  
- unused exports  
- unused parameters  
- deeply nested structures beyond documented limits  
- magic numbers without documentation  
- TODO/FIXME comments in production code  

### **4.4 Safety Enforcement**
Lint tests must ensure:

- no direct access to environment variables outside approved modules  
- no direct file system access outside approved modules  
- no insecure string concatenation for paths or URLs  
- no inline secrets  
- no insecure defaults  

### **4.5 Documentation Enforcement**
Lint tests must validate:

- required headers exist  
- required docstrings exist  
- required comments exist for complex logic  
- no outdated documentation references  

---

## **5. Required Reasoning**
Lint rules must be documented with:

- why the rule exists  
- what risk it prevents  
- what pattern it enforces  
- examples of compliant and non‑compliant code  

This ensures lint rules are auditable and maintainable.

---

## **6. Enforcement Criteria**

The governance engine must flag:

- any lint violation  
- any missing lint configuration  
- any disabled lint rule without justification  
- any attempt to bypass linting  
- any file excluded from linting without approval  

Lint failures **must block merges**.

---

## **7. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of lint test rules |

---