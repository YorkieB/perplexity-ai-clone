---

# **SECURITY‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **security testing** across all governed repositories.  
Its purpose is to ensure that:

- no sensitive data leaks  
- no insecure defaults exist  
- no unsafe operations occur  
- security invariants are enforced  
- security regressions are detected early  

Security is a **non‑negotiable invariant** of the system.

---

## **2. Scope**
These rules apply to:

- logging  
- error handling  
- configuration  
- network calls  
- file access  
- cryptography  
- serialization  
- authentication and authorization flows  

If code touches security, it is governed by this document.

---

## **3. Definitions**

### **Sensitive Data**
Any information that must never be exposed, including:

- passwords  
- tokens  
- secrets  
- PII  
- financial data  
- session identifiers  

### **Insecure Default**
Any default configuration that reduces security or increases risk.

### **Unsafe Operation**
Any operation that exposes data, bypasses validation, or weakens security.

---

## **4. Mandatory Rules**

### **4.1 Sensitive Data Protection**
Security tests must ensure:

- no sensitive data appears in logs  
- no sensitive data appears in error messages  
- no sensitive data appears in serialized output  
- no sensitive data is stored in plaintext  

### **4.2 Configuration Safety**
Security tests must validate:

- secure defaults  
- required environment variables  
- no hardcoded secrets  
- no insecure fallbacks  

### **4.3 Network Safety**
Security tests must validate:

- secure protocols (HTTPS, TLS)  
- no insecure endpoints  
- no unsafe redirects  
- no unvalidated external calls  

### **4.4 Cryptographic Safety**
Security tests must validate:

- approved algorithms only  
- correct key lengths  
- no insecure hashing (e.g., MD5, SHA1)  
- no custom crypto  

### **4.5 Authentication & Authorization**
Security tests must validate:

- correct permission checks  
- correct token handling  
- correct session handling  
- no privilege escalation paths  

---

## **5. Forbidden Patterns**

- logging sensitive data  
- hardcoded secrets  
- insecure crypto  
- insecure network calls  
- unsafe file access  
- unsafe serialization  
- bypassing authentication  
- bypassing authorization  

---

## **6. Required Reasoning**
Every security test must document:

- what threat is being mitigated  
- what invariant is being enforced  
- what assumptions are being validated  
- what failure modes exist  

This ensures tests are auditable and enforceable.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- any sensitive data exposure  
- any insecure default  
- any unsafe operation  
- any missing security tests  
- any regression in security behavior  

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of security test rules |

---