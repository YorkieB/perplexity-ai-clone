# Prompt Enhancement Guide — PromptDC Protocol

Every request to the system must be enhanced with PromptDC ✨ before execution. This guide defines how prompts are structured, enriched, and validated.

---

## 1. Purpose
- Ensure prompts contain full context.
- Prevent ambiguous or incomplete requests.
- Maintain alignment with the Yorkie Constitution.

---

## 2. PromptDC Steps
1. **Context Capture** — Summarize the known state (files, workflows, goals).
2. **Intent Clarification** — Restate what must be delivered.
3. **Constraints Listing** — Cite relevant constitutional rules.
4. **Risk Assessment** — Note potential failure modes.
5. **Success Definition** — Describe what “done” means.
6. **Action Plan** — Outline steps the system should follow.

Every enhanced prompt must explicitly walk through these steps.

---

## 3. Template
```
PromptDC ✨
1. Context:
2. Intent:
3. Constraints:
4. Risks:
5. Success Criteria:
6. Plan:
```

---

## 4. Validation Rules
- Prompts lacking any section must be rejected.
- Intent must reference file paths or workflow names explicitly.
- Constraints must cite Constitution sections when relevant.
- Plan must include verification or testing steps.

---

## 5. Automation Hooks
- Future governance CLI should parse prompts and confirm PromptDC fields exist before processing.
- Missing PromptDC metadata → workflow failure.

---

## 6. Examples
**Good:**
```
1. Context: Need to update PORT-STABILITY-GUIDE.md per Constitution §14.
2. Intent: Add rules covering deterministic API contracts.
3. Constraints: Section 14 requires type coverage + validation.
4. Risks: Missing validation details could violate Logic Completeness.
5. Success: Doc outlines tests + validation + zero-tolerance clause.
6. Plan: Draft doc → cross-reference Constitution → self-review.
```

**Bad:**
```
"Please add something about ports."
```

---

## 7. Summary
PromptDC makes intent explicit. No prompt, no code. Enhance first, execute second.
