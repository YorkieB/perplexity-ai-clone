---

# **SIDE‑EFFECT‑BOUNDARY‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules governing where side effects are allowed, how they must be structured, and how they must be controlled across all governed repositories.

Side effects are one of the primary sources of:

- unpredictable behavior  
- non‑deterministic logic  
- test fragility  
- hidden coupling  
- state corruption  
- performance regressions  

These rules ensure that side effects are isolated, intentional, observable, and testable.

---

## **2. Scope**
These rules apply to **all forms of side effects**, including:

- network requests  
- file I/O  
- database operations  
- timers and intervals  
- logging  
- global state changes  
- DOM manipulation  
- environment access  
- process‑level operations  
- random number generation  
- date/time access  

If a function interacts with the outside world or changes state outside its own scope, it is governed by this document.

---

## **3. Definitions**

### **Side Effect**  
Any operation that changes state outside the function or interacts with the external environment.

### **Pure Function**  
A function with no side effects and deterministic output.

### **Effect Boundary**  
A designated layer or module where side effects are allowed.

### **Effect Isolation**  
The practice of containing side effects within specific, controlled modules.

### **Hidden Side Effect**  
A side effect that is not obvious from the function signature or documentation.

---

## **4. Mandatory Rules**

### **4.1 Isolation of Side Effects**
- Side effects must be isolated to designated layers (e.g., `services/`, `infrastructure/`).  
- Pure utilities (`utils/`) must not contain side effects.  
- Reducers must not contain side effects.  
- Hooks may contain side effects only when explicitly documented and appropriate for UI behavior.

### **4.2 Explicitness**
- Side effects must be explicit and visible in the code.  
- Side effects must not occur implicitly or indirectly.  
- Side effects must not occur during module initialization.

### **4.3 Documentation**
Non‑trivial side effects must document:

- why the side effect is necessary  
- what external systems it interacts with  
- expected failure modes  
- retry or fallback behavior  
- assumptions about ordering or timing  

### **4.4 Testability**
- Side effects must be mockable.  
- Side effects must not require real network or I/O in unit tests.  
- Side effects must be covered by tests for both success and failure.

### **4.5 Safety**
- Side effects must not mutate shared state without synchronization.  
- Side effects must not be triggered during render in UI components.  
- Side effects must not be triggered inside pure functions.

---

## **5. Forbidden Patterns**

- Side effects inside pure functions.  
- Side effects inside reducers.  
- Side effects inside `utils/` modules.  
- Side effects triggered during module import.  
- Hidden side effects (e.g., logging inside a utility).  
- Side effects inside constructors.  
- Side effects inside React render functions.  
- Side effects that depend on global mutable state.  
- Side effects that rely on implicit timing.  

---

## **6. Required Reasoning**

For any non‑trivial side effect, the code must include reasoning describing:

- the purpose of the side effect  
- the expected impact  
- what assumptions the code relies on  
- what happens if the side effect fails  
- how the side effect interacts with async flows  
- how the side effect is tested  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Side Effects in Forbidden Locations**
- Any side effect in `utils/`  
- Any side effect in reducers  
- Any side effect in pure functions  
- Any side effect during module initialization  

### **7.2 Hidden Side Effects**
- Logging inside utilities  
- Implicit network calls  
- Implicit global state mutation  

### **7.3 Missing Documentation**
- Non‑trivial side effects without reasoning  
- Side effects without documented failure modes  

### **7.4 Unsafe Behavior**
- Side effects inside render  
- Side effects inside constructors  
- Side effects that mutate shared state unsafely  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Side Effect:
 * - Writes user data to the backend.
 *
 * Reasoning:
 * - This operation belongs in the service layer.
 * - Failure is handled and converted into a domain-specific error.
 */
export async function saveUser(user: User): Promise<void> {
  try {
    await api.post("/users", user);
  } catch (err) {
    log.error("Failed to save user", { user, err });
    throw new PersistenceError("Unable to save user");
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
export function formatUser(user) {
  console.log(user); // ❌ hidden side effect in a utility
  return { ...user, name: user.name.trim() };
}
```

### **8.3 Non‑Compliant Example**
```ts
export function reducer(state, action) {
  if (action.type === "save") {
    api.post("/save", state); // ❌ side effect in reducer
  }
  return state;
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Logging inside error handlers is allowed if:
  - the handler is part of a service or infrastructure layer  
  - the logging is documented  
  - the logging is intentional  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of side effect boundary rules. |

All changes to this document must follow the **governance change control workflow**.

---