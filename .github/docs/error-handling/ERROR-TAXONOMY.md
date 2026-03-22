---

# **ERROR‑TAXONOMY.md**

## **1. Purpose**
This document defines the complete, governed taxonomy of error types used across all repositories.  
Its purpose is to ensure that:

- errors are classified consistently  
- error meaning is unambiguous  
- error handling is predictable  
- failures are diagnosable  
- user‑facing behavior is safe  
- internal behavior is observable  
- tooling can enforce correct error usage  

A unified error taxonomy eliminates ambiguity and prevents the proliferation of ad‑hoc error types that degrade system reliability.

---

## **2. Scope**
These rules apply to:

- all thrown errors  
- all error classes  
- all error responses  
- all domain logic  
- all services  
- all API handlers  
- all async flows  
- all validation layers  
- all infrastructure modules  

If a function throws, catches, or transforms an error, it is governed by this document.

---

## **3. Definitions**

### **Error Class**
A structured, named error type representing a specific category of failure.

### **Recoverable Error**
An error that the system can handle gracefully without corrupting state.

### **Fatal Error**
An error that indicates a logic violation, invariant break, or unrecoverable state.

### **User‑Facing Error**
An error safe to expose to end users, containing no sensitive information.

### **Internal Error**
An error intended for logs, debugging, or monitoring, not for user display.

### **Error Envelope**
A standardized structure for error responses in APIs or services.

---

## **4. Mandatory Rules**

### **4.1 Use Domain‑Specific Error Classes**
All errors must be instances of approved error classes, such as:

- `ValidationError`  
- `InvariantError`  
- `NetworkError`  
- `PersistenceError`  
- `AuthenticationError`  
- `AuthorizationError`  
- `ConfigurationError`  
- `TimeoutError`  
- `NotFoundError`  
- `ConflictError`  

### **4.2 No Raw Errors**
- Throwing raw strings is forbidden.  
- Throwing generic `Error` is forbidden unless wrapped or subclassed.  

### **4.3 Error Classification**
Every error must be classified as:

- **Recoverable** — retry, fallback, or user messaging is possible  
- **Fatal** — indicates a logic error or corrupted state  

### **4.4 User‑Facing Safety**
User‑facing errors must:

- be sanitized  
- contain no stack traces  
- contain no internal details  
- use safe, human‑readable messages  

### **4.5 Internal Observability**
Internal errors must:

- include context  
- include metadata  
- include correlation identifiers where available  
- be logged at appropriate levels  

### **4.6 Consistent Error Envelope**
All API and service layers must return errors in a consistent structure, including:

- error type  
- message  
- code  
- metadata (optional)  
- correlation ID (if available)  

---

## **5. Forbidden Patterns**

- Throwing raw strings (`throw "oops"`).  
- Throwing generic `Error` without classification.  
- Returning `null` or `undefined` instead of throwing.  
- Swallowing errors silently.  
- Logging sensitive data.  
- Exposing stack traces to users.  
- Using HTTP status codes without matching error types.  
- Using error messages as control flow.  

---

## **6. Required Reasoning**

For any non‑trivial error type or error transformation, documentation must include:

- why the error type exists  
- what conditions trigger it  
- whether it is recoverable or fatal  
- what the caller is expected to do  
- what metadata is required  
- what assumptions the error enforces  

This reasoning must appear:

- above the error class definition, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Incorrect Error Types**
- Throwing raw strings  
- Throwing generic `Error`  
- Throwing errors without classification  

### **7.2 Missing Error Handling**
- Async functions without error handling  
- Services that return raw errors  
- API handlers that expose internal errors  

### **7.3 Missing Documentation**
- Error classes without documented purpose  
- Error transformations without reasoning  

### **7.4 Unsafe Behavior**
- Exposing stack traces  
- Logging sensitive data  
- Using error messages for branching logic  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Represents a failure to validate user input.
 *
 * Recoverable: Yes
 * Caller Action: Display safe message to user.
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
throw "invalid"; // ❌ raw string
```

### **8.3 Non‑Compliant Example**
```ts
throw new Error("User not found"); // ❌ generic error, wrong type
```

### **8.4 Compliant API Error Envelope**
```ts
return {
  error: {
    type: "ValidationError",
    message: "Email is required",
    code: "VALIDATION_EMAIL_REQUIRED",
    correlationId: ctx.correlationId,
  }
};
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Low‑level libraries may throw generic errors **only if** they are wrapped at the boundary.  
- Third‑party errors may be passed through **only if** sanitized and classified.  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of error taxonomy. |

All changes to this document must follow the **governance change control workflow**.

---