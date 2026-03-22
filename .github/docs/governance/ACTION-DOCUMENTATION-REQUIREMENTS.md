# Action Documentation Requirements

Every GitHub Action within `.github/workflows/` must have an accompanying documentation file that explains its purpose, inputs, outputs, and enforcement hooks. This policy defines the standard.

---

## 1. Purpose
- Keep automation transparent and auditable.
- Ensure workflows can be reviewed, extended, and reused.
- Provide a single source of truth for enforcement logic.

---

## 2. File Location & Naming
- All workflow docs live in `docs/workflows/`.
- File name format: `WORKFLOW-<UPPERCASE-NAME>.md` (e.g., `WORKFLOW-BIOME-LINT.md`).
- Each GitHub Action must reference its doc in comments or README.

---

## 3. Required Sections
Each workflow document must include:
1. **Purpose** — Why the workflow exists.
2. **Triggers** — Events that run the workflow (push, PR, schedule).
3. **Checks Performed** — Commands, scripts, thresholds.
4. **Failure Conditions** — Exactly what causes a failure.
5. **Artifacts / Outputs** — Reports, logs, annotations.
6. **Integration Points** — Dependencies on scripts, directories, or other workflows.
7. **Recovery Steps** — How to fix failures.
8. **Related Documents** — Constitution sections, policies, CLI commands.

---

## 4. Automation Template
All future action docs must follow the template below:
```
# Workflow Name

## Purpose
...

## Triggers
...

## Checks Performed
...

## Failure Conditions
...

## Outputs / Artifacts
...

## Integration Points
...

## Recovery Steps
...

## Related Documents
- ...
```

---

## 5. Action Documents Directory
- Store action documents in `docs/actions/` only when they describe composite or reusable actions.
- Auto-generated action logs must be saved in `docs/actions/generated/` (git-ignored unless needed).

---

## 6. Enforcement
- Pull requests introducing or modifying workflows must include matching doc updates.
- GitHub Action `action-documentation-validator.yml` must fail if documentation is missing or outdated.
- Penalty System applies to undocumented workflows.

---

## 7. Summary
Every workflow must be documented like production code: deterministic, auditable, future-proof.
