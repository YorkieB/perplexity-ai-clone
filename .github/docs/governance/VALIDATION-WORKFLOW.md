# Validation Workflow — Yorkie Standard

This document defines the non-negotiable validation pipeline required before any file or feature can receive the YORKIE VALIDATED seal.

---

## 1. Purpose
- Guarantee deterministic, reproducible validation.
- Prevent partial verification or skipped steps.
- Align human and automated checks.

---

## 2. Validation Stages
1. **File Regeneration** — Regenerate the complete file (no patching).
2. **Dependency Sync** — Install or confirm required packages.
3. **Biome Check** — `npm run lint` must pass with zero fixes pending.
4. **Tests & Coverage** — `npm run test:coverage` with 100% thresholds.
5. **Custom Governance Checks** — Run all `npm run check:*` commands.
6. **Manual Self-Review** — Follow Master Self-Review checklist.
7. **YORKIE VALIDATED Footer** — Append only after evidence is recorded.

---

## 3. Required Evidence
For every validated change, capture:
- Commands run + timestamps
- Screenshots or logs of passing checks (if applicable)
- Summary of manual review findings

Evidence must be referenced in PR template and stored in CI logs.

---

## 4. Workflow Automation
All steps above must be mirrored in GitHub Actions:
- **Biome Workflow** — must match local lint command.
- **Test Enforcement** — must enforce coverage thresholds.
- **Custom Governance Workflows** — must mirror `check:*` scripts.

Local validation is invalid unless CI would pass with the same commands.

---

## 5. Failure Handling
If any stage fails:
1. Stop immediately.
2. Fix the root cause.
3. Restart the workflow from Stage 1 (regeneration).
4. Document the failure + fix.

---

## 6. Manual Self-Review Checklist (Excerpt)
- All props typed and imported
- All states/handlers wired
- Tests cover success + failure + edge cases
- No TODOs/HACKs/console logs
- Accessibility verified (labels, focus states)
- Performance considerations documented

Full checklist lives in `/docs/governance/VALIDATION-WORKFLOW.md#self-review-checklist`.

---

## 7. Output Requirements
- Every validated file must end with `// YORKIE VALIDATED — ...`
- Reports must cite specific validation steps (commands + outcomes).
- PR template checkbox for "Validation Workflow Completed" must be checked.

---

## 8. Auditing
- Weekly spot checks compare local validation evidence vs. CI runs.
- Failures trigger Penalty System actions.

---

## 9. Summary
Validation is a pipeline, not a checkbox. Run every stage, capture proof, and never claim success until every workflow agrees.
