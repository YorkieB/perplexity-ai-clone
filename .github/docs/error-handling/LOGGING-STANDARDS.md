---

# **LOGGING‑STANDARDS.md**

## **1. Purpose**
This document defines the mandatory rules for logging across all governed repositories.  
Logging is a critical part of system observability, diagnostics, and operational safety.  
These rules ensure that logs are:

- structured  
- consistent  
- safe  
- actionable  
- free of sensitive data  
- useful for debugging and monitoring  
- compatible with automated analysis tools  

A unified logging standard prevents noise, protects user data, and ensures that logs provide meaningful insight into system behavior.

---

## **2. Scope**
These rules apply to:

- all application logs  
- all service logs  
- all error logs  
- all infrastructure logs  
- all monitoring and telemetry events  
- all debug, info, warning, and error messages  

If code writes to a log, it is governed by this document.

---

## **3. Definitions**

### **Structured Logging**  
Logging using objects or key‑value pairs rather than free‑form strings.

### **Sensitive Data**  
Any data that must never appear in logs, including:

- passwords  
- tokens  
- API keys  
- session IDs  
- personal data  
- financial data  
- authentication headers  
- secrets of any kind  

### **Correlation Identifier**  
A unique ID used to trace a request or operation across system boundaries.

### **Log Level**  
The severity classification of a log entry:

- `debug`  
- `info`  
- `warn`  
- `error`  
- `fatal`  

---

## **4. Mandatory Rules**

### **4.1 Structured Logging**
- All logs must be structured.  
- Logs must use objects, not concatenated strings.  
- Logs must include relevant metadata.

### **4.2 Log Levels**
- `debug` — development‑only details  
- `info` — normal operational events  
- `warn` — unexpected but recoverable conditions  
- `error` — failures requiring attention  
- `fatal` — unrecoverable system‑level failures  

Logs must use the correct level.

### **4.3 Sensitive Data Protection**
- Sensitive data must never appear in logs.  
- Logs must not include raw error objects containing sensitive fields.  
- Logs must not include request bodies unless explicitly sanitized.

### **4.4 Error Logging**
- Errors must be logged with context.  
- Errors must include correlation identifiers when available.  
- Errors must not expose stack traces to user‑facing logs.

### **4.5 Consistency**
All logs must include:

- timestamp  
- log level  
- message  
- metadata object  
- correlation ID (if available)  

### **4.6 Documentation**
Non‑trivial logging behavior must document:

- why the log exists  
- what it indicates  
- what metadata is required  
- how it is consumed by monitoring systems  

---

## **5. Forbidden Patterns**

- Logging sensitive data (passwords, tokens, PII).  
- Logging entire request or response bodies.  
- Logging stack traces in user‑facing logs.  
- Logging unstructured strings.  
- Logging inside pure functions.  
- Logging inside reducers.  
- Logging inside tight loops.  
- Logging errors without context.  
- Logging errors without correlation IDs.  
- Logging debug information in production.  

---

## **6. Required Reasoning**

For any non‑trivial log entry, documentation must include:

- why the log is necessary  
- what operational insight it provides  
- what metadata is required  
- how the log is used by monitoring or alerting systems  
- what conditions trigger the log  
- what the expected frequency is  

This reasoning must appear:

- above the log statement, or  
- in module‑level documentation  

depending on complexity.

---

## **7. Enforcement Criteria**

The governance engine must flag:

### **7.1 Unsafe Logging**
- Any log containing sensitive data.  
- Any log containing raw request or response bodies.  
- Any log containing authentication headers.  

### **7.2 Unstructured Logs**
- Logs that are plain strings.  
- Logs that concatenate values instead of using objects.

### **7.3 Missing Context**
- Error logs without metadata.  
- Error logs without correlation IDs.  
- Logs that do not indicate the operation being performed.

### **7.4 Incorrect Log Levels**
- Using `error` for normal events.  
- Using `info` for failures.  
- Using `debug` in production code.

### **7.5 Logging in Forbidden Locations**
- Pure functions  
- Reducers  
- Module initialization  
- Tight loops  

---

## **8. Examples**

### **8.1 Compliant Example**
```ts
/**
 * Logs a failed user fetch with full context.
 *
 * Reasoning:
 * - Needed for diagnosing backend failures.
 * - Includes correlationId for tracing.
 * - Sanitized: no sensitive data logged.
 */
log.error("Failed to fetch user", {
  userId: id,
  correlationId: ctx.correlationId,
  errorType: err.name,
});
```

### **8.2 Non‑Compliant Example**
```ts
console.log("User fetch failed: " + err); // ❌ unstructured, unsafe
```

### **8.3 Non‑Compliant Example**
```ts
log.error("Login failed", { password }); // ❌ logs sensitive data
```

---

## **9. Exceptions**

Exceptions are rare and must be explicitly documented.

### **Allowed Exceptions**
- Debug logs may be used in development environments only.  
- Infrastructure modules may log raw errors if sanitized and isolated.  

### **Not Allowed**
- Implicit exceptions  
- Undocumented exceptions  
- Exceptions used to bypass governance  

---

## **10. Versioning / Change Control**

| Version | Date       | Description |
|---------|------------|-------------|
| v1.0    | Initial    | Initial definition of logging standards. |

All changes to this document must follow the **governance change control workflow**.

---