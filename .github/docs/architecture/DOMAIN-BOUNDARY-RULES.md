---

# **DOMAIN‑BOUNDARY‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules for establishing, enforcing, and maintaining domain boundaries across all governed repositories.

Clear domain boundaries ensure:

- modularity  
- maintainability  
- predictable behavior  
- safe refactoring  
- reduced coupling  
- improved reasoning  
- architectural integrity  

Without strict boundaries, systems devolve into tangled dependencies, hidden coupling, and ungovernable complexity.  
This document prevents that.

---

## **2. Scope**
These rules apply to:

- all domain modules  
- all service layers  
- all feature boundaries  
- all shared utilities  
- all cross‑domain interactions  
- all imports and exports  
- all architectural layering  

If code crosses a domain boundary, it is governed by this document.

---

## **3. Definitions**

### **Domain**
A cohesive set of functionality representing a business or technical capability.

### **Domain Boundary**
The explicit separation between one domain and another.

### **Cross‑Domain Interaction**
Any import, call, or dependency from one domain into another.

### **Upstream Domain**
A domain that provides functionality to another.

### **Downstream Domain**
A domain that depends on another.

### **Boundary Violation**
Any interaction that crosses domains without going through the approved interface.

---

## **4. Mandatory Rules**

### **4.1 Explicit Domain Boundaries**
- Each domain must have a clearly defined boundary.  
- Boundaries must be documented.  
- Boundaries must be enforced by tooling and code review.

### **4.2 Approved Interfaces Only**
- Domains may only interact through approved public interfaces.  
- Internal modules must not be imported across domains.  
- Private domain logic must remain private.

### **4.3 Directional Dependencies**
- Dependencies must flow in a single, documented direction.  
- Cyclic dependencies are forbidden.  
- Downstream domains must not import upstream internals.

### **4.4 Isolation of Domain Logic**
- Domain logic must not leak into other domains.  
- Shared utilities must not contain domain‑specific logic.  
- Domain models must not be mutated outside their domain.

### **4.5 Documentation Requirements**
Each domain must document:

- its purpose  
- its public API  
- its upstream dependencies  
- its downstream consumers  
- its invariants  
- its boundaries  

### **4.6 Testability**
- Domains must be testable in isolation.  
- Cross‑domain interactions must be mocked or stubbed.  
- Domain tests must not rely on other domains’ internals.

---

## **5. Forbidden Patterns**

- Importing internal modules from another domain.  
- Sharing domain models without explicit contracts.  
- Cross‑domain mutation of state.  
- Cyclic dependencies.  
- “Reach‑through” imports (e.g., `domainA/utils/internal/x`).  
- Domain logic inside shared utilities.  
- Using one domain’s error types in another domain.  
- Using one domain’s constants or enums in another domain without a contract.  

---

## **6. Required Reasoning**

For any cross‑domain interaction, the code must include reasoning describing:

- why the interaction is necessary  
- why the chosen direction is correct  
- what assumptions are being made  
- what invariants must hold  
- what the public contract guarantees  
- what failure modes exist  

This reasoning must appear:

- above the interaction, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Boundary Violations**
- Imports of internal modules across domains.  
- Cross‑domain mutation of state.  
- Use of domain‑specific logic in shared utilities.  

### **7.2 Incorrect Dependency Direction**
- Downstream domains importing upstream internals.  
- Cyclic dependencies.  

### **7.3 Missing Documentation**
- Domains without boundary definitions.  
- Public APIs without contracts.  

### **7.4 Unsafe Behavior**
- Cross‑domain calls without error handling.  
- Cross‑domain calls without reasoning.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
// domainA/public/index.ts
export function getUserProfile(id: string): UserProfile {
  // domain logic
}

// domainB/service.ts
/**
 * Cross-domain interaction:
 * - domainB depends on domainA for user profile data.
 * - Interaction is through domainA's public API.
 */
import { getUserProfile } from "../domainA/public";

export async function enrichOrder(order: Order) {
  const profile = await getUserProfile(order.userId);
  return { ...order, profile };
}
```

### **8.2 Non‑Compliant Example**
```ts
// ❌ importing internal module from another domain
import { internalUserCache } from "../domainA/internal/cache";
```

### **8.3 Non‑Compliant Example**
```ts
// ❌ domain logic leaking into shared utils
export function calculateDiscount(user) {
  if (user.loyaltyTier === "gold") return 0.2;
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Shared infrastructure modules may be used across domains **only if**:
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
| v1.0    | Initial    | Initial definition of domain boundary rules. |

All changes to this document must follow the **governance change control workflow**.

---