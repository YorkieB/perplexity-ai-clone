# Penalty System — Enforcement Protocol

The Penalty System keeps the Yorkie Engineering Universe deterministic. Any violation of the Constitution triggers immediate action. This document defines violation levels, enforcement steps, recovery obligations, and reporting requirements.

---

## 1. Objectives
- Preserve trust in the YORKIE VALIDATED seal.
- Keep governance rules self-enforcing.
- Ensure every contributor knows exactly what happens when a rule is broken.

---

## 2. Violation Levels
| Level | Description | Examples | Immediate Consequence |
|-------|-------------|----------|------------------------|
| **Critical** | Code threatens stability, security, or governance. | Missing tests, missing logic, failing workflows, debacle coding, bypassing validation. | Block merge, revoke validation, trigger full regeneration. |
| **Major** | Code violates style, structure, or documentation requirements but does not immediately break prod. | Missing headers, incomplete chain-of-thought, inconsistent naming, undocumented ports. | Block merge until resolved, require checklist confirmation. |
| **Minor** | Small deviations that do not impact behavior but erode discipline. | Comment tone, formatting drift, missing optional metadata. | Warning + fix before merge. |

Any Critical or Major violation automatically resets the impacted file’s validation status to “UNVERIFIED.”

---

## 3. Enforcement Flow
1. **Detection** — Workflow, reviewer, or contributor identifies violation.
2. **Classification** — Determine Critical/Major/Minor.
3. **Immediate response**
   - Critical: Block merge, revoke validation, open incident note.
   - Major: Block merge until fixed.
   - Minor: Annotate PR, require fix before merge.
4. **Recovery tasks**
   - Regenerate affected files from scratch.
   - Re-run validation workflow end-to-end.
   - Document fixes in PR summary.
5. **Verification**
   - All workflows must pass.
   - Reviewer confirms checklist.
   - YORKIE VALIDATED tag restored.

---

## 4. Zero-Tolerance Rules
- **Never ignore a failing workflow.**
- **Never merge while errors exist.**
- **Never re-validate without rerunning tests & Biome.**
- **Never claim “fixed” without listing every correction.**

Violating zero-tolerance rules escalates a Major issue to Critical.

---

## 5. Recovery Requirements
For every Critical/Major violation:
1. Regenerate each impacted file fully (no patches).
2. Document:
   - Root cause
   - Fix applied
   - Validation proof (commands + outputs)
3. Re-run:
   - `npm run lint`
   - `npm run test:coverage`
   - All custom governance scripts
4. Reapply YORKIE VALIDATED footer only after proof is attached.

---

## 6. Incident Reporting
- All Critical incidents require a short report in `/docs/governance/PENALTY-SYSTEM.md#incidents-log` (create log if missing).
- Report must include:
  - Date / PR / Author
  - Rule violated
  - Impacted files
  - Recovery summary

---

## 7. Escalation Matrix
| Repeat Count | Action |
|--------------|--------|
| 1st Critical in 30 days | Mandatory review + checklist reminder |
| 2nd | Require peer pairing + architecture review |
| 3rd | Freeze contributor access until governance retraining |

---

## 8. Automation Hooks
- Workflows must fail on any violation.
- PR template must include “Penalty System Check” confirmation box.
- Incident log updates should be automated via future governance CLI.

---

## 9. Summary
The Penalty System guarantees discipline. Violations are transparent, recoveries are documented, and no file regains YORKIE VALIDATED status without full proof. This protocol is non-negotiable.
