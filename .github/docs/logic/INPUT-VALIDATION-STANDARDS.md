---

# **INPUT‑VALIDATION‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for validating inputs across all governed repositories.  
Its purpose is to ensure that:

- invalid data is rejected early  
- functions behave predictably  
- domain invariants are preserved  
- security risks are minimized  
- error handling is consistent  
- undefined behavior is eliminated  

Input validation is a foundational part of system correctness.  
These rules ensure that every public function, service, and API surface enforces strict, explicit validation.

---

## **2. Scope**
These rules apply to:

- all exported functions  
- all service methods  
- all API handlers  
- all domain logic entry points  
- all utilities used across domains  
- all constructors and factory functions  
- all user‑provided or external data  

If a function is callable from outside its module, it is governed by this document.

---

## **3. Definitions**

### **Public Function**  
Any function, class, or method that is exported or otherwise accessible outside its defining module.

### **Validation**  
Explicit checks ensuring that inputs conform to expected types, shapes, constraints, and invariants.

### **Precondition**  
A requirement that must be true before a function executes.

### **Invalid Input**  
Any input that violates type expectations, domain rules, or invariants.

### **Domain‑Specific Error**  
An error type that communicates the nature of the validation failure (e.g., `ValidationError`, `InvalidArgumentError`).

---

## **4. Mandatory Rules**

### **4.1 Explicit Validation**
- All public functions must validate their inputs.  
- Validation must occur before any side effects.  
- Validation must be explicit, not implicit.

### **4.2 Error Behavior**
- Invalid inputs must throw domain‑specific errors.  
- Error messages must not leak sensitive information.  
- Validation errors must be deterministic and consistent.

### **4.3 Type Safety**
- Inputs must be validated against expected types.  
- Inputs must be validated against expected shapes (object structure).  
- Inputs must be validated against domain constraints (e.g., non‑empty strings, positive numbers).

### **4.4 Defensive Programming**
- Functions must not assume non‑null or non‑undefined inputs.  
- Functions must not assume valid enum values without checking.  
- Functions must not assume arrays contain valid elements without checking.

### **4.5 Documentation**
Non‑trivial validation logic must document:

- expected input domain  
- invalid cases  
- error behavior  
- assumptions  
- invariants  

### **4.6 Testability**
- Validation logic must be testable in isolation.  
- Tests must cover invalid inputs, not just valid ones.

---

## **5. Forbidden Patterns**

- Accepting `any` or `unknown` without validation.  
- Allowing invalid inputs to propagate into deeper layers.  
- Relying on TypeScript types alone for runtime validation.  
- Using try/catch to mask validation failures.  
- Implicit coercion (e.g., `Number(x)` without checking).  
- Silent failure or fallback behavior on invalid input.  
- Returning `null` or `undefined` instead of throwing.  

---

## **6. Required Reasoning**

For any non‑trivial validation logic, the code must include reasoning describing:

- why validation is required  
- what assumptions the function relies on  
- what constitutes valid vs invalid input  
- what invariants must be preserved  
- what error behavior is expected  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Missing Validation**
- Any exported function with no validation logic.  
- Any service method that accepts external data without checks.  
- Any API handler that trusts request parameters.

### **7.2 Unsafe Types**
- Use of `any` or `unknown` without validation.  
- Use of implicit coercion.  
- Use of unchecked enums or discriminated unions.

### **7.3 Missing Error Handling**
- Functions that return `null` or `undefined` on invalid input.  
- Functions that swallow validation errors.

### **7.4 Missing Reasoning**
- Complex validation logic with no documented assumptions.

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Validates and retrieves a user by ID.
 *
 * Preconditions:
 * - id must be a non-empty string.
 * - id must match the UUID format.
 *
 * Error Behavior:
 * - Throws ValidationError on invalid input.
 */
export function getUser(id: string): User {
  if (typeof id !== "string" || id.trim() === "") {
    throw new ValidationError("id must be a non-empty string");
  }

  if (!UUID_REGEX.test(id)) {
    throw new ValidationError("id must be a valid UUID");
  }

  return repo.find(id);
}
```

### **8.2 Non‑Compliant Example**
```ts
export function getUser(id) {
  return repo.find(id); // ❌ no validation, unsafe
}
```

### **8.3 Non‑Compliant Example**
```ts
export function parseAge(age: any) {
  return Number(age); // ❌ implicit coercion, no validation
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Internal helper functions may skip validation **only** if:
  - they are not exported  
  - their callers guarantee valid input  
  - the guarantee is documented  

### **Not Allowed**
- Skipping validation for performance reasons without approval.  
- Relying on TypeScript alone for runtime safety.  
- Implicit exceptions or undocumented assumptions.  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of input validation governance rules. |

All changes to this document must follow the **governance change control workflow**.

---