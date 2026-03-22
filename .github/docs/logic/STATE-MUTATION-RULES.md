---

# **STATE‑MUTATION‑RULES.md**

## **1. Purpose**
This document defines the mandatory rules governing how state may be mutated across all governed repositories.  
Its purpose is to ensure:

- predictability  
- immutability  
- safe concurrency  
- deterministic behavior  
- testability  
- architectural consistency  

State mutation is one of the most common sources of subtle bugs, race conditions, UI inconsistencies, and logic corruption.  
These rules eliminate unsafe mutation patterns and enforce a consistent, governed approach to state transitions.

---

## **2. Scope**
These rules apply to all forms of state, including:

- React component state  
- React hooks  
- reducers  
- global state containers  
- shared objects  
- caches  
- in‑memory stores  
- domain models  
- configuration objects  
- any mutable data structure  

If a value can change over time, it is governed by this document.

---

## **3. Definitions**

### **Mutable State**  
Any object or value whose fields or contents can change after creation.

### **Immutable Update**  
Creating a new object or array rather than modifying the existing one.

### **Shared State**  
State accessible from multiple modules, components, or async flows.

### **Reducer**  
A pure function that takes `(state, action)` and returns new state without side effects.

### **Deterministic State Transition**  
A state update that always produces the same output for the same input.

---

## **4. Mandatory Rules**

### **4.1 Immutability**
- All state updates must be performed immutably.  
- No function may mutate its input arguments.  
- Arrays and objects must be replaced, not modified in place.

### **4.2 Purity of Reducers**
- Reducers must be pure functions.  
- Reducers must not perform side effects.  
- Reducers must not mutate their input state.  
- Reducers must not depend on external mutable state.

### **4.3 Controlled Mutation**
- Shared state may only be updated through controlled, documented interfaces.  
- No module may mutate imported objects.  
- No function may mutate global state without explicit governance approval.

### **4.4 Deterministic Transitions**
- State transitions must be deterministic.  
- No state update may depend on timing, randomness, or external mutable state unless explicitly documented.

### **4.5 Documentation**
Non‑trivial state transitions must document:

- preconditions  
- postconditions  
- invariants  
- assumptions  
- expected side effects (if any)  

### **4.6 Testability**
- All state transitions must be testable in isolation.  
- Reducers must have full test coverage for all branches.

---

## **5. Forbidden Patterns**

- Direct mutation of objects or arrays (`obj.x =`, `arr.push`, `arr.splice`, etc.).  
- Mutating React state outside of `setState` or dispatch.  
- Mutating imported objects or module‑level constants.  
- Hidden mutations inside utility functions.  
- Mutating arguments passed into a function.  
- Using mutable default parameters.  
- Mutating state inside async flows without synchronization.  
- Mutating state during render in React.  
- Mutating state inside reducers.  

---

## **6. Required Reasoning**

For any non‑trivial state transition, the code must include reasoning describing:

- why the state transition is needed  
- what invariants must hold before and after  
- what assumptions the transition relies on  
- what edge cases exist  
- what failure modes are possible  
- how the transition interacts with async flows (if applicable)  

This reasoning must be placed:

- directly above the reducer or state update, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Direct Mutation**
- Any use of mutating array methods (`push`, `pop`, `splice`, `shift`, etc.).  
- Any assignment to nested properties of state objects.  
- Any mutation of imported objects.

### **7.2 Impure Reducers**
- Reducers that mutate their input.  
- Reducers that perform side effects.  
- Reducers that depend on external mutable state.

### **7.3 Hidden Mutation**
- Utility functions that mutate arguments.  
- Functions that mutate shared state without documentation.

### **7.4 Missing Reasoning**
- Complex state transitions with no documented assumptions or invariants.

### **7.5 Unsafe Concurrency**
- State mutated from multiple async flows without synchronization.

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Invariant:
 * - count must never be negative.
 * - increment is always +1.
 */
export function counterReducer(state: State, action: Action): State {
  switch (action.type) {
    case "increment":
      return {
        ...state,
        count: state.count + 1,
      };

    default:
      return state;
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
export function counterReducer(state, action) {
  if (action.type === "increment") {
    state.count++; // ❌ mutation
    return state;
  }
  return state;
}
```

### **8.3 Non‑Compliant Utility**
```ts
export function normalize(user) {
  user.name = user.name.trim(); // ❌ mutating argument
  return user;
}
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Performance‑critical code may use mutation **only** when:
  - the mutation is isolated  
  - the mutation is safe  
  - the mutation is documented  
  - the mutation is justified  
  - the mutation is covered by tests  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of state mutation governance rules. |

All changes to this document must follow the **governance change control workflow**.

---