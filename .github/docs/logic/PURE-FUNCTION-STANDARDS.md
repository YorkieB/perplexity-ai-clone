---

# **PURE‑FUNCTION‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for writing, maintaining, and enforcing pure functions across all governed repositories.

Pure functions are essential for:

- deterministic behavior  
- predictable state transitions  
- reliable testing  
- safe refactoring  
- functional composition  
- eliminating hidden side effects  

This document ensures that pure functions remain truly pure, consistent, and trustworthy throughout the system.

---

## **2. Scope**
These rules apply to all functions intended to be pure, including:

- utilities  
- reducers  
- data transformers  
- formatting functions  
- calculation functions  
- mapping and filtering logic  
- domain model transformers  

If a function is expected to be deterministic and side‑effect‑free, it is governed by this document.

---

## **3. Definitions**

### **Pure Function**  
A function that:

- has no side effects  
- does not read external mutable state  
- does not write external state  
- does not mutate its inputs  
- returns the same output for the same input  

### **Side Effect**  
Any interaction with the outside world, including:

- logging  
- network calls  
- file I/O  
- timers  
- random number generation  
- reading global state  
- writing global state  
- mutating shared objects  

### **Deterministic Output**  
A function whose output depends solely on its input parameters.

---

## **4. Mandatory Rules**

### **4.1 No Side Effects**
Pure functions must not:

- perform I/O  
- log  
- mutate external state  
- read global mutable state  
- write to global state  
- trigger network calls  
- modify DOM or environment  

### **4.2 No Mutation**
Pure functions must not:

- mutate input arguments  
- mutate nested properties of input objects  
- mutate arrays passed as arguments  
- mutate imported objects  

### **4.3 Determinism**
Pure functions must:

- return the same output for the same input  
- not depend on time, randomness, or external state  
- not depend on environment variables unless passed explicitly  

### **4.4 Explicit Purity**
If a function is intended to be pure:

- it must be documented as pure  
- it must be placed in a directory where purity is expected (e.g., `utils/`)  
- its purity must be enforced by tests  

### **4.5 Testability**
Pure functions must be:

- fully testable in isolation  
- covered by tests for edge cases  
- validated for deterministic behavior  

---

## **5. Forbidden Patterns**

- Logging inside pure functions.  
- Calling `Date.now()`, `Math.random()`, or similar nondeterministic APIs.  
- Mutating arguments (`obj.x =`, `arr.push`, etc.).  
- Reading from global state.  
- Writing to global state.  
- Triggering network calls.  
- Using closures that capture mutable external state.  
- Using default parameters that mutate.  

---

## **6. Required Reasoning**

For any non‑trivial pure function, documentation must include:

- what assumptions the function makes  
- what invariants must hold  
- what edge cases exist  
- why the function must remain pure  
- what external state it intentionally avoids  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Side Effects**
- Any call to logging, network, I/O, timers, or environment APIs.  
- Any mutation of external state.  
- Any mutation of imported objects.

### **7.2 Input Mutation**
- Any modification of function arguments.  
- Any mutation of nested properties of arguments.

### **7.3 Nondeterminism**
- Use of `Date.now()`, `Math.random()`, or similar.  
- Use of global mutable state.  
- Use of environment variables without explicit injection.

### **7.4 Missing Documentation**
- Pure functions without documented assumptions or invariants.

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Pure Function:
 * - No side effects.
 * - Deterministic.
 * - Does not mutate input.
 *
 * Invariant:
 * - Age must be a non-negative integer.
 */
export function calculateBirthYear(age: number, currentYear: number): number {
  if (age < 0) {
    throw new InvariantError("Age cannot be negative");
  }

  return currentYear - age;
}
```

### **8.2 Non‑Compliant Example**
```ts
export function calculateBirthYear(age) {
  console.log("Calculating..."); // ❌ side effect
  return new Date().getFullYear() - age; // ❌ nondeterministic
}
```

### **8.3 Non‑Compliant Example**
```ts
export function normalize(user) {
  user.name = user.name.trim(); // ❌ mutating input
  return user;
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- None by default.  
- A function may be reclassified as “impure” if:
  - it is moved to an appropriate directory  
  - its impurity is documented  
  - its behavior is intentional  

### **Not Allowed**
- Implicit exceptions  
- Undocumented impurity  
- Using exceptions to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of pure function standards. |

All changes to this document must follow the **governance change control workflow**.

---