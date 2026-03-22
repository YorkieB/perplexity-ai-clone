# Workflow — Permanent Code Validator

Ensures all merged code is production-ready and free of temporary markers. This workflow enforces the Permanent Code Policy.

---

## Purpose
- Detect TODO/FIXME/HACK comments without issue links.
- Ensure every feature is fully implemented.
- Block partial or placeholder implementations.

---

## Triggers
- Pull request (any file changes)
- Push to protected branches
- Nightly full-repo scan

---

## Checks Performed
- Scan for TODO/FIXME/HACK without linked issue/ticket.
- Detect dead code left “for later”.
- Validate that every exported symbol is used and tested.

---

## Failure Conditions
- Temporary markers without issue links.
- Dead code detected.
- Incomplete implementations.

---

## Outputs / Artifacts
- Permanent code report with file/line details.
- PR comment listing violations.

---

## Integration Points
- Runs after `WORKFLOW-LOGIC-COMPLETENESS`.
- Uses grep/AST scanner.

---

## Recovery Steps
- Remove or replace temporary code.
- Link TODOs to issues with timelines.
- Complete implementations and add tests.

---

## Related Documents
- `docs/quality/PERMANENT-CODE-POLICY.md`
- `docs/quality/DEAD-CODE-POLICY.md`
- `docs/governance/PENALTY-SYSTEM.md`
