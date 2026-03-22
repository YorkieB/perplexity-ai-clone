---

# **COMPONENT‑HEALTH‑TEST‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for **component‑health testing** across all governed repositories.  
Its purpose is to ensure that:

- every component loads correctly  
- every component initializes correctly  
- every component exposes the expected interface  
- no component enters an invalid or degraded state at startup  
- no component silently fails before deeper tests run  

Component‑health tests are the **third gate** in the governance pipeline — ensuring the system is structurally sound before logic, architecture, or behavior tests execute.

---

## **2. Scope**
These rules apply to:

- all modules  
- all services  
- all adapters  
- all providers  
- all domain components  
- all infrastructure components  

If it is a component, it must have a health test.

---

## **3. Definitions**

### **Component**
A discrete, testable unit of the system with:

- a defined interface  
- a defined lifecycle  
- defined dependencies  
- defined invariants  

### **Health Test**
A test that verifies a component can:

- load  
- initialize  
- validate its configuration  
- expose its interface  
- enter a valid operational state  

### **Degraded State**
A state where a component:

- loads incorrectly  
- initializes incorrectly  
- exposes an incomplete interface  
- fails silently  
- enters an inconsistent or partially valid state  

---

## **4. Mandatory Rules**

### **4.1 Load Validation**
Component‑health tests must ensure:

- the component loads without errors  
- all required files exist  
- all required exports exist  
- no circular dependencies break loading  

### **4.2 Initialization Validation**
Component‑health tests must validate:

- initialization completes successfully  
- required configuration is present  
- required environment variables are present  
- required dependencies are available  
- no runtime exceptions occur during startup  

### **4.3 Interface Validation**
Component‑health tests must ensure:

- all required methods exist  
- all required properties exist  
- all required events exist  
- all required types match documentation  
- no deprecated interfaces are exposed  

### **4.4 Dependency Validation**
Component‑health tests must validate:

- all dependencies are resolvable  
- no dependency is missing  
- no dependency is incompatible  
- no dependency violates version constraints  

### **4.5 State Validation**
Component‑health tests must ensure:

- the component enters a valid operational state  
- no partial initialization occurs  
- no silent failures occur  
- no inconsistent internal state is created  

---

## **5. Forbidden Patterns**

- components that load but fail during initialization  
- components that initialize but expose incomplete interfaces  
- components that rely on global state  
- components that silently swallow initialization errors  
- components that require external systems to initialize  
- components that initialize differently depending on timing  

---

## **6. Required Reasoning**
Each component‑health test must document:

- what the component is expected to provide  
- what invariants define a “healthy” state  
- what dependencies are required  
- what failure modes are being prevented  

This ensures clarity, auditability, and long‑term maintainability.

---

## **7. Enforcement Criteria**

The governance engine must flag:

- missing component‑health tests  
- incomplete interface validation  
- missing dependency validation  
- components that initialize inconsistently  
- components that rely on external systems to initialize  

Component‑health failures **must block merges**.

---

## **8. Versioning**

| Version | Description |
|--------|-------------|
| v1.0   | Initial definition of component‑health test rules |

---