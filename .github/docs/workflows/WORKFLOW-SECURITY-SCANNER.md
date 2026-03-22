# Workflow — Security Scanner

Scans for security vulnerabilities and unsafe patterns. This workflow enforces the Security Standards.

---

## Purpose
- Detect secrets, unsafe code, and dependency vulnerabilities.
- Ensure secure coding practices are followed.
- Fail CI on security issues.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Run CodeQL security queries.
- Scan for secrets (GitHub secret scanning).
- Run ESLint security rules.
- Check npm audit for vulnerabilities.

---

## Failure Conditions
- CodeQL alerts.
- Secrets detected.
- Vulnerable dependencies.
- Unsafe patterns.

---

## Outputs / Artifacts
- Security report with alerts.
- PR comment listing issues.

---

## Integration Points
- Runs early in the pipeline.
- Uses CodeQL, secret scanning, and npm audit.

---

## Recovery Steps
- Remove or rotate secrets.
- Fix unsafe patterns.
- Update or replace vulnerable packages.

---

## Related Documents
- `docs/quality/SECURITY-STANDARDS.md`
- `docs/governance/PENALTY-SYSTEM.md`
- `docs/quality/ERROR-HANDLING-STANDARDS.md`
