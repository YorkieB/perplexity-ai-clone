---

# **SECURITY‑ERROR‑HANDLING.md**

## **1. Purpose**
This document defines the mandatory rules for handling errors in a security‑safe manner across all governed repositories.  
Its purpose is to ensure that:

- sensitive information is never leaked  
- user‑facing errors are safe and sanitized  
- internal errors remain observable and actionable  
- security‑critical failures are handled consistently  
- the system remains resilient under attack or misuse  

Security‑safe error handling is essential for preventing information disclosure, protecting user data, and maintaining system integrity.

---

## **2. Scope**
These rules apply to:

- all API handlers  
- all authentication and authorization flows  
- all services interacting with external systems  
- all error transformations  
- all logging of errors  
- all user‑facing error messages  
- all infrastructure and configuration layers  

If an error can be triggered by user input, external systems, or internal failures, it is governed by this document.

---

## **3. Definitions**

### **Sensitive Information**  
Any data that must never be exposed to users or logs, including:

- passwords  
- tokens  
- API keys  
- session identifiers  
- database connection strings  
- stack traces  
- internal error messages  
- infrastructure details  

### **Sanitized Error**  
A user‑safe error message that contains no sensitive information.

### **Internal Error**  
An error intended for logs, monitoring, or debugging, not for user display.

### **Security‑Critical Operation**  
Any operation involving authentication, authorization, identity, secrets, or privileged access.

---

## **4. Mandatory Rules**

### **4.1 Sanitization of User‑Facing Errors**
- User‑facing errors must never expose stack traces.  
- User‑facing errors must never expose internal error messages.  
- User‑facing errors must be generic unless specificity is safe.  
- User‑facing errors must not reveal whether a username or email exists.

### **4.2 Internal Error Preservation**
- Internal logs must preserve full error details.  
- Internal errors must include metadata for debugging.  
- Internal errors must include correlation identifiers when available.

### **4.3 Consistent Error Transformation**
- Errors must be transformed into domain‑specific error types.  
- Security‑critical errors must be wrapped in appropriate error classes.  
- Raw errors from external systems must never be passed directly to users.

### **4.4 Authentication & Authorization Safety**
- Authentication errors must not reveal which credential failed.  
- Authorization errors must not reveal internal permission structures.  
- Token validation errors must not reveal token contents.

### **4.5 Logging Safety**
- Sensitive data must never appear in logs.  
- Logs must not include raw request bodies.  
- Logs must not include authentication headers.  
- Logs must not include secrets or tokens.

### **4.6 Fail‑Fast on Security Violations**
- Security‑critical invariant violations must throw immediately.  
- Silent failure is forbidden.  
- Fallback behavior must be explicitly documented and safe.

---

## **5. Forbidden Patterns**

- Exposing stack traces to users.  
- Returning raw error messages from external services.  
- Logging sensitive data.  
- Logging full error objects without sanitization.  
- Revealing whether a user account exists.  
- Using error messages to indicate authentication state.  
- Returning different error messages for valid vs invalid credentials.  
- Swallowing security‑critical errors.  

---

## **6. Required Reasoning**

For any security‑critical error handling logic, documentation must include:

- why the error is security‑sensitive  
- what information must be hidden  
- what information must be logged internally  
- what fallback behavior is safe  
- what assumptions the code relies on  
- what the caller is expected to do  

This reasoning must appear:

- above the function, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Unsafe User‑Facing Errors**
- Any error that exposes stack traces.  
- Any error that exposes internal messages.  
- Any error that reveals account existence.  

### **7.2 Unsafe Logging**
- Logs containing sensitive data.  
- Logs containing raw request bodies.  
- Logs containing authentication headers.  

### **7.3 Incorrect Error Transformation**
- Passing raw external errors to users.  
- Throwing generic `Error` in security‑critical code.  

### **7.4 Missing Reasoning**
- Security‑critical logic without documented assumptions.  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Handles login failures securely.
 *
 * Security Reasoning:
 * - Do not reveal whether the email exists.
 * - Do not expose internal error details.
 * - Log full error internally with correlationId.
 */
export async function login(email: string, password: string) {
  try {
    const user = await authService.authenticate(email, password);
    return user;
  } catch (err) {
    log.warn("Authentication failed", {
      correlationId: ctx.correlationId,
      errorType: err.name,
    });

    throw new AuthenticationError("Invalid credentials");
  }
}
```

### **8.2 Non‑Compliant Example**
```ts
throw new Error("User not found in database"); // ❌ reveals internal details
```

### **8.3 Non‑Compliant Example**
```ts
log.error("Login failed", { password }); // ❌ logs sensitive data
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Internal debugging tools may log full errors **only** in development environments.  
- Infrastructure modules may include stack traces **only** in internal logs.  

### **Not Allowed**
- Exposing internal errors to users.  
- Logging sensitive data under any circumstances.  
- Undocumented exceptions.  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of security‑safe error handling rules. |

All changes to this document must follow the **governance change control workflow**.

---