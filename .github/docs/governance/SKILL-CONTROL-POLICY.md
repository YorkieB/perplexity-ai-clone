# Skill Control Policy

Skills extend the system’s capabilities, but uncontrolled skills jeopardize governance. This policy defines how skills are proposed, approved, invoked, and audited.

---

## 1. Purpose
- Prevent unauthorized skill creation or invocation.
- Ensure every skill aligns with the Yorkie Constitution.
- Maintain an auditable record of all skill actions.

---

## 2. Definitions
- **Skill** — Any automation, workflow, or assistant capability that executes specialized logic.
- **Skill Invocation** — Running a skill, whether manually or automatically.
- **Skill Registry** — Authoritative list of approved skills, their owners, and scopes.

---

## 3. Authorization Rules
1. Skills may only be created or updated with explicit user approval.
2. Skills must be registered with:
   - Name and purpose
   - Owner/responsible party
   - Input/output contract
   - Safety constraints
3. Unauthorized skills trigger Critical violations.

---

## 4. Creation Workflow
1. Document the proposed skill in `/docs/governance/SKILL-CONTROL-POLICY.md#registry`.
2. Run `WORKFLOW-SKILLCONTROL` to validate compliance.
3. Obtain explicit user approval.
4. Merge skill code + registry entry in the same PR.

---

## 5. Invocation Rules
- Skills cannot self-invoke.
- Automatic invocation requires workflow guardrails (inputs validated, outputs checked).
- Manual invocation must be logged with timestamp, reason, and outcome.
- Skills must respect Penalty System and Memory Control policies.

---

## 6. Registry Template
```
## Skill: <Name>
- Purpose:
- Owner:
- Inputs:
- Outputs:
- Restrictions:
- Approval Reference:
- Last Audit:
```

All skills must appear in a dedicated registry appendix within this document.

---

## 7. Auditing
- Quarterly review: confirm each skill remains necessary and compliant.
- Revoke skills that are unused, unsafe, or undocumented.
- Update approval references whenever scope changes.

---

## 8. Enforcement
- Unauthorized creation → Critical violation + rollback.
- Unauthorized invocation → Critical violation + incident log.
- Missing registry entry → Workflow failure + merge block.

---

## 9. Summary
Skills are powerful but must never bypass governance. Register them, audit them, and treat every invocation as a governed act.
