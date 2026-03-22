---

# **DEPENDENCY‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for dependency management across all governed repositories.  
Its purpose is to ensure that dependencies:

- flow in predictable, safe directions  
- do not create hidden coupling  
- do not violate domain or layer boundaries  
- remain minimal and intentional  
- support maintainability and refactoring  
- prevent architectural drift  

Dependency correctness is foundational to system stability.  
These rules enforce strict, auditable dependency behavior across the entire codebase.

---

## **2. Scope**
These rules apply to:

- imports between modules  
- imports between domains  
- imports between layers  
- third‑party libraries  
- shared utilities  
- internal frameworks  
- cross‑package dependencies  
- dependency injection boundaries  

If code imports something, it is governed by this document.

---

## **3. Definitions**

### **Dependency**
Any module, function, class, or package that another module relies on.

### **Upward Dependency**
A dependency from a lower‑level module to a higher‑level module — **forbidden**.

### **Downward Dependency**
A dependency from a higher‑level module to a lower‑level module — **allowed**.

### **Lateral Dependency**
A dependency between modules at the same layer or domain — allowed only when explicitly documented.

### **Dependency Cycle**
A circular chain of imports — **forbidden**.

### **Dependency Inversion**
A pattern where higher layers depend on abstractions, not concrete implementations.

---

## **4. Mandatory Rules**

### **4.1 Directional Dependency Rules**
Dependencies must follow this direction:

```
UI → Application → Domain → Infrastructure
```

- No upward dependencies.  
- No cross‑domain imports of internal modules.  
- No lateral dependencies without justification.

### **4.2 Domain Dependency Rules**
- Domains must not depend on each other’s internals.  
- Domains may depend on each other’s public APIs only.  
- Shared utilities must not depend on any domain.  
- Domain models must not depend on external libraries except primitives.

### **4.3 Infrastructure Dependency Rules**
- Infrastructure may depend on Domain interfaces.  
- Infrastructure must not depend on UI or Application.  
- Infrastructure must not leak external system details upward.

### **4.4 Third‑Party Dependency Rules**
- Third‑party libraries must be isolated behind adapters.  
- Domain and Application layers must not depend directly on external APIs.  
- UI may depend on UI‑specific libraries only.  
- Infrastructure may depend on external systems through controlled interfaces.

### **4.5 Dependency Minimization**
- Dependencies must be minimal and intentional.  
- Unused imports must be removed.  
- Transitive dependencies must be documented.  
- Heavy libraries must be justified.

### **4.6 Documentation Requirements**
Non‑trivial dependencies must document:

- why the dependency is required  
- what layer/domain it belongs to  
- what assumptions it introduces  
- what invariants it relies on  
- what alternatives were considered  

---

## **5. Forbidden Patterns**

- Upward dependencies.  
- Cross‑domain imports of internal modules.  
- Cyclic dependencies.  
- UI importing Infrastructure.  
- Domain importing Infrastructure.  
- Domain importing Application or UI.  
- Shared utilities importing domain logic.  
- Direct use of third‑party APIs in Domain or Application.  
- “Reach‑through” imports (e.g., `domainA/internal/x`).  
- Importing entire libraries when only one function is needed.  

---

## **6. Required Reasoning**

For any dependency that is not trivial, the code must include reasoning describing:

- why the dependency is necessary  
- why the direction is correct  
- what assumptions are being made  
- what invariants must hold  
- what the dependency guarantees  
- what failure modes exist  
- how the dependency is tested  

This reasoning must appear:

- above the import, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Direction Violations**
- Any upward dependency.  
- Any cross‑domain import of internals.  
- Any domain importing UI or Application.  

### **7.2 Layer Violations**
- UI importing Infrastructure.  
- Application importing Infrastructure directly.  
- Domain importing Infrastructure or external libraries.  

### **7.3 Dependency Cycles**
- Any cycle between modules, domains, or layers.  

### **7.4 Missing Documentation**
- Non‑trivial dependencies without reasoning.  
- Third‑party dependencies without justification.  

### **7.5 Unsafe Behavior**
- Direct use of external APIs in Domain or Application.  
- Dependencies that violate invariants.  
- Dependencies that introduce hidden coupling.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
// Application Layer
/**
 * Dependency Reasoning:
 * - Application depends on Domain's public API.
 * - Direction is correct: Application → Domain.
 */
import { calculateOrderTotal } from "../domain/orders/public";

export function processOrder(order: Order) {
  return calculateOrderTotal(order);
}
```

### **8.2 Non‑Compliant Example**
```ts
// ❌ Domain importing Infrastructure
import { PostgresOrderRepository } from "../infrastructure/db";
```

### **8.3 Non‑Compliant Example**
```ts
// ❌ UI importing Infrastructure directly
import { fetchOrders } from "../infrastructure/http";
```

### **8.4 Non‑Compliant Example**
```ts
// ❌ Cross-domain internal import
import { internalDiscountRules } from "../domainA/internal/rules";
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Shared infrastructure (logging, metrics) may be used across layers **only if**:
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
| v1.0    | Initial    | Initial definition of dependency rules. |

All changes to this document must follow the **governance change control workflow**.

---