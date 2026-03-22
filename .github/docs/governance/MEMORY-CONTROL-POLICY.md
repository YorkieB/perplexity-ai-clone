# Memory Control Policy

Memory is a governance asset. It preserves long-term project context, but only when used intentionally. This policy defines when memory may be created, modified, or deleted within the Yorkie Engineering Universe.

---

## 1. Purpose
- Prevent unauthorized or accidental memory mutations.
- Ensure only durable, high-value knowledge is stored.
- Keep memory consistent with the Constitution and Penalty System.

---

## 2. What Counts as Memory
- Saved architectural decisions
- Naming conventions and patterns
- Long-lived workflows or preferences
- Known pitfalls, incompatibilities, or constraints

**Not memory:** temporary tasks, debug notes, secrets, credentials, or speculative thoughts.

---

## 3. Authorization Rules
1. No autonomous memory creation.
2. No memory edits without explicit user approval.
3. All memory operations must reference this policy.
4. Violations trigger Critical penalties.

---

## 4. Workflow Requirements
All memory changes must use the MemoryControl workflow:
1. Draft the memory entry with title, description, rationale, scope.
2. Present to user for explicit approval.
3. Log approval details (time, reason).
4. Apply changes via `WORKFLOW-MEMORYCONTROL` automation.

---

## 5. Allowed Content
- Stable conventions (directory layout, typing rules)
- Governance updates
- Architecture constraints
- Dependency pinning when justified
- Known integration quirks

---

## 6. Forbidden Content
- Secrets or credentials
- PII
- Temporary tasks
- Debug logs
- Personal commentary

---

## 7. Retention & Auditing
- Every memory item must include timestamp + author + approval reference.
- Quarterly audit required: remove obsolete entries, reaffirm active ones.
- Changes must be traceable via Git history or audit log.

---

## 8. Enforcement
- Unauthorized creation → Critical violation + memory revert.
- Unauthorized modification → Critical violation + revert + incident log.
- Missing approvals → workflow failure + merge block.

---

## 9. Summary
Memory is a privileged system. Treat it like production data: strict approvals, precise content, zero improvisation.
