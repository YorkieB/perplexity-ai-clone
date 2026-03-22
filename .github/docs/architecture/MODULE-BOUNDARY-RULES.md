---

# **MODULE‑BOUNDARY‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for establishing, enforcing, and maintaining **module boundaries** across all governed repositories.

Module boundaries exist to ensure:

- isolation of concerns  
- predictable behavior  
- safe refactoring  
- minimal coupling  
- clear ownership  
- maintainable codebases  
- enforceable architectural constraints  

Without strict module boundaries, systems collapse into tangled imports, hidden dependencies, and ungovernable complexity.  
This document prevents that.

---

## **2. Scope**
These rules apply to:

- all modules within a domain  
- all modules within a layer  
- all shared modules  
- all internal vs public module surfaces  
- all imports between modules  
- all module‑level responsibilities  

If code crosses a module boundary, it is governed by this document.

---

## **3. Definitions**

### **Module**
A cohesive unit of code with a single responsibility and a defined public interface.

### **Internal Module**
A module whose contents are private to its domain or layer.

### **Public Module**
A module that exposes a stable API for other modules or domains.

### **Module Boundary**
The separation between internal and public surfaces of a module.

### **Boundary Violation**
Any import or interaction that bypasses a module’s public API.

---

## **4. Mandatory Rules**

### **4.1 Explicit Module Boundaries**
- Every module must define what is **public** and what is **internal**.  
- Internal modules must not be imported outside their domain or layer.  
- Public modules must expose only stable, intentional APIs.

### **4.2 Single Responsibility**
- Each module must have one clear purpose.  
- Modules must not accumulate unrelated logic.  
- Modules must not grow into “god modules.”

### **4.3 Public API Contracts**
- Public modules must document their API.  
- Public APIs must be stable and versioned.  
- Public APIs must not expose internal details.  
- Public APIs must not leak external system details.

### **4.4 Internal Isolation**
- Internal modules must not be imported by other domains.  
- Internal modules must not be imported by higher layers.  
- Internal modules may change freely without breaking consumers.

### **4.5 Dependency Direction**
- Modules may depend on lower‑level modules.  
- Modules must not depend on higher‑level modules.  
- Lateral dependencies must be documented and justified.

### **4.6 Testability**
- Modules must be testable in isolation.  
- Tests must not rely on internal modules of other modules.  
- Public APIs must be fully covered by tests.

---

## **5. Forbidden Patterns**

- Importing internal modules from another module.  
- “Reach‑through” imports (e.g., `moduleA/internal/utils`).  
- Modules that expose internal types or structures.  
- Modules that depend on higher‑level modules.  
- Modules that contain multiple unrelated responsibilities.  
- Modules that mutate state owned by another module.  
- Modules that bypass domain or layer boundaries.  
- Modules that expose raw third‑party APIs.  

---

## **6. Required Reasoning**

For any module boundary decision, the code must include reasoning describing:

- why the module exists  
- what its responsibility is  
- what is public vs internal  
- why the public API is shaped the way it is  
- what assumptions the module makes  
- what invariants it enforces  
- what dependencies it requires and why  

This reasoning must appear:

- in module‑level documentation, or  
- in the module’s public entrypoint  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Boundary Violations**
- Imports of internal modules across module boundaries.  
- Public modules exposing internal details.  
- Modules depending on higher‑level modules.  

### **7.2 Responsibility Violations**
- Modules containing unrelated logic.  
- Modules that grow beyond their intended scope.  

### **7.3 Dependency Violations**
- Lateral dependencies without justification.  
- Cyclic dependencies between modules.  

### **7.4 Missing Documentation**
- Modules without boundary definitions.  
- Public APIs without contracts.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
// moduleA/public/index.ts
export function calculateTotal(order: Order): number {
  return sum(order.items.map(i => i.price));
}

// moduleB/service.ts
/**
 * Module Boundary Reasoning:
 * - moduleB depends on moduleA's public API only.
 * - No internal imports.
 */
import { calculateTotal } from "../moduleA/public";

export function processOrder(order: Order) {
  return calculateTotal(order);
}
```

### **8.2 Non‑Compliant Example**
```ts
// ❌ importing internal module from another module
import { internalDiscountRules } from "../moduleA/internal/rules";
```

### **8.3 Non‑Compliant Example**
```ts
// ❌ module exposing internal details
export { internalCache } from "./internal/cache";
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Shared infrastructure modules may be used across modules **only if**:
  - they contain no domain logic  
  - they are stable  
  - they are documented  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of module boundary rules. |

All changes to this document must follow the **governance change control workflow**.

---