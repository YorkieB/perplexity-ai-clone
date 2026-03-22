# File Header Standards

Every file must begin with a conversational header block that explains the file to a non-technical friend. This standard defines the required format and content.

---

## 1. Format
```
/*
Hey friend! This file handles ...
It does ...
Key detail ...
*/
```
- 2–5 sentences, friendly tone.
- Must appear at the very top of the file (no imports above it).
- Use plain language while still conveying purpose and key behaviors.

---

## 2. Required Content
- What the file does.
- Why it exists / what problem it solves.
- Any notable constraints, dependencies, or behaviors.
- Mention related docs if relevant.

---

## 3. Additional Metadata (Optional but Encouraged)
- Reference to Constitution section.
- Link to workflow or policy docs.
- Instructions for future maintainers.

---

## 4. Enforcement
- Missing or incorrect headers trigger `WORKFLOW-ARCHITECTURE-INTEGRITY` failure.
- Headers must be updated whenever file behavior changes significantly.
- Automated lint rules may check for the header pattern.

---

## 5. Examples
Good:
```
/*
Hey friend! This component renders the dashboard header.
It shows the user name, notifications, and quick actions.
If you change navigation links, update NAVIGATION-GUIDE.md too.
*/
```

Bad:
```
/* header */
```

---

## 6. Summary
File headers are lightweight documentation. Write them with empathy, keep them honest, and update them whenever you touch the file.
