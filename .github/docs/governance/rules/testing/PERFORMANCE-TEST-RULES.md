---

# **PERFORMANCE‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **performance testing** across all governed repositories.  
Its purpose is to ensure that:

- performance regressions are detected early  
- complexity boundaries are enforced  
- retry and fallback logic remain efficient  
- degraded mode stays predictable  
- the system maintains stable performance under load  

Performance is a governance concern, not an optimization exercise.

---

## **2. Scope**
These rules apply to:

- performance‑critical functions  
- retry logic  
- fallback logic  
- degraded mode behavior  
- data processing pipelines  
- domain logic with complexity constraints  
- infrastructure adapters  

If performance can degrade system behavior, it is governed by this document.

---

## **3. Definitions**

### **Performance Regression**  
Any change that increases runtime, memory usage, or algorithmic complexity beyond approved thresholds.

### **Complexity Boundary**  
The maximum allowed algorithmic complexity for a function or module.

### **Load‑Sensitive Operation**  
Any operation whose performance degrades under increased input size or concurrency.

---

## **4. Mandatory Rules**

### **4.1 Complexity Enforcement**
Performance tests must ensure:

- functions do not exceed documented complexity boundaries  
- complexity is validated using representative input sizes  
- complexity violations fail tests immediately  

### **4.2 Retry Logic Performance**
Performance tests must validate:

- retries do not cause exponential blow‑ups  
- backoff strategies behave correctly under load  
- retry budgets are enforced  

### **4.3 Fallback Performance**
Performance tests must ensure:

- fallback behavior remains within documented performance limits  
- degraded mode remains predictable and bounded  

### **4.4 Memory Boundaries**
Performance tests must validate:

- memory usage stays within documented thresholds  
- no unbounded data structures  
- no unbounded caching  
- no memory leaks  

### **4.5 Documentation Requirements**
Performance‑critical modules must document:

- expected complexity  
- expected memory usage  
- performance assumptions  
- performance boundaries  

---

## **5. Forbidden Patterns**

- unbounded loops  
- unbounded recursion  
- unbounded data structures  
- retry storms  
- fallback storms  
- hidden exponential behavior  
- performance‑critical code without tests  

---

## **6. Required Reasoning**
Every performance test must document:

- why the performance boundary exists  
- what assumptions are being validated  
- what input sizes are representative  
- what failure modes exist  

This ensures performance tests are auditable and enforceable.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- complexity violations  
- memory boundary violations  
- retry performance regressions  
- fallback performance regressions  
- missing performance tests for critical modules  

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of performance test rules |

---