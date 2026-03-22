---

# **LAYERING‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for architectural layering across all governed repositories.  
Layering is the backbone of a maintainable, predictable, and evolvable system.  
These rules ensure that layers:

- have clear responsibilities  
- depend only in approved directions  
- remain isolated from each other  
- prevent coupling and architectural drift  
- support safe refactoring  
- enforce domain boundaries  

A strict layering model prevents “spaghetti architecture” and ensures long‑term system integrity.

---

## **2. Scope**
These rules apply to all architectural layers, including:

- UI / Presentation  
- Application / Orchestration  
- Domain / Business Logic  
- Infrastructure / Adapters  
- Shared Utilities  
- Data Access  
- Integration Layers  

If code belongs to a layer or interacts across layers, it is governed by this document.

---

## **3. Definitions**

### **Layer**
A logical grouping of code with a specific responsibility and allowed dependency direction.

### **Upward Dependency**
A dependency from a lower layer to a higher layer — **forbidden**.

### **Downward Dependency**
A dependency from a higher layer to a lower layer — **allowed**.

### **Cross‑Layer Violation**
Any import or call that breaks the allowed dependency direction.

### **Adapter**
A module that connects domain logic to external systems (DB, APIs, queues).

---

## **4. Mandatory Rules**

### **4.1 Strict Layering**
Layers must follow this dependency direction:

```
UI → Application → Domain → Infrastructure
```

- UI may depend on Application  
- Application may depend on Domain  
- Domain may depend on nothing above it  
- Infrastructure may depend on Domain (via interfaces)  
- Infrastructure must not depend on UI or Application  

### **4.2 Domain Independence**
- Domain layer must not import UI, Application, or Infrastructure.  
- Domain logic must be pure, deterministic, and side‑effect‑free.  
- Domain models must not depend on external libraries except primitives.

### **4.3 Infrastructure Isolation**
- Infrastructure must implement interfaces defined in the Domain or Application layers.  
- Infrastructure must not leak external system details upward.  
- Infrastructure must not contain domain logic.

### **4.4 Application Layer Responsibilities**
- Orchestrates workflows.  
- Coordinates domain operations.  
- Handles cross‑domain interactions.  
- Must not contain UI logic.  
- Must not contain infrastructure details.

### **4.5 UI Layer Responsibilities**
- Rendering  
- Input handling  
- View‑level state  
- Must not contain domain logic  
- Must not call infrastructure directly  

### **4.6 Shared Utilities**
- Must be domain‑agnostic  
- Must not depend on any domain  
- Must not contain business logic  

---

## **5. Forbidden Patterns**

- UI calling Infrastructure directly.  
- Domain importing Application or UI.  
- Domain importing Infrastructure.  
- Infrastructure containing domain logic.  
- Application layer performing DB queries directly.  
- Shared utilities containing domain‑specific logic.  
- Cyclic dependencies between layers.  
- “Reach‑through” imports (e.g., UI → Infrastructure).  

---

## **6. Required Reasoning**

For any cross‑layer interaction, the code must include reasoning describing:

- why the interaction is necessary  
- why the dependency direction is correct  
- what assumptions are being made  
- what invariants must hold  
- what the receiving layer guarantees  
- what failure modes exist  

This reasoning must appear:

- above the interaction, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Dependency Violations**
- Any upward dependency.  
- Any cross‑layer import that breaks the allowed direction.  
- Any domain logic in UI or Infrastructure.  

### **7.2 Layer Leakage**
- Infrastructure leaking external system details upward.  
- UI leaking view logic into Application or Domain.  
- Domain leaking business rules into Infrastructure.  

### **7.3 Missing Documentation**
- Layers without defined responsibilities.  
- Cross‑layer interactions without reasoning.  

### **7.4 Unsafe Behavior**
- Application layer performing side effects directly.  
- Domain layer performing I/O.  
- UI layer performing business logic.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
// Domain Layer
export interface UserRepository {
  findById(id: string): Promise<User>;
}

// Infrastructure Layer
export class PostgresUserRepository implements UserRepository {
  async findById(id: string) {
    return db.query("SELECT * FROM users WHERE id = $1", [id]);
  }
}

// Application Layer
export async function getUserProfile(id: string, repo: UserRepository) {
  const user = await repo.findById(id);
  return normalizeUser(user);
}

// UI Layer
const profile = await getUserProfile(userId, userRepo);
```

### **8.2 Non‑Compliant Example**
```ts
// ❌ UI calling DB directly
const user = await db.query("SELECT * FROM users");
```

### **8.3 Non‑Compliant Example**
```ts
// ❌ Domain importing Infrastructure
import { PostgresUserRepository } from "../infrastructure/db";
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Shared infrastructure (e.g., logging, metrics) may be used across layers **only if**:
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
| v1.0    | Initial    | Initial definition of layering standards. |

All changes to this document must follow the **governance change control workflow**.

---