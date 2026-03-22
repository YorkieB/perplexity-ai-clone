# Security Standards

Security is built into every layer of the Yorkie system. This guide defines mandatory practices for code, configuration, and workflows.

---

## 1. Principles
- Least privilege
- Zero trust between modules
- Fail secure (deny by default)
- Validate everything, always

---

## 2. Coding Practices
- Never store secrets in code; use environment variables.
- Validate all external inputs (API, form, storage).
- Sanitize outputs before rendering or sending to external systems.
- Use parameterized queries or trusted SDKs for data stores.
- Avoid `eval`, dynamic imports, or unsafe HTML.

---

## 3. Authentication & Authorization
- Enforce access control at every port.
- Never rely solely on frontend checks.
- Document each auth decision in chain-of-thought comments.

---

## 4. Dependencies
- Pin versions in `package-lock.json`.
- Run `npm audit` during CI.
- Dependabot must be enabled.

---

## 5. Workflows
- `WORKFLOW-SECURITY-SCANNER` runs CodeQL/ESLint security rules.
- Secrets scanning must run on every push/PR.
- Failing security workflows blocks merge.

---

## 6. Incident Response
- Security bugs trigger Critical Penalty and require immediate disclosure.
- Track incidents in governance docs.

---

## 7. Summary
Security is never optional. Follow these standards and document every decision to keep the system safe.
