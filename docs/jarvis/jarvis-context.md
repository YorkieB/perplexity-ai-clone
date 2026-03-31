# Jarvis context (orchestrator)

Use this file with `docs/jarvis/agent-registry.md` before routing. Update when the product’s domains or constraints change.

## Product

Jarvis is a modular personal AI assistant. The **Orchestrator** coordinates work; specialists implement or analyse within their roles.

## Domains (classification hints)

| Domain | Signals |
|--------|---------|
| Code | Repos, bugs, refactors, tests, CI |
| Infra | Docker, cloud, deploy, networking |
| Voice | TTS, STT, realtime audio, SSML |
| LLM | Models, prompts, routing, cost |
| Browser | Automation, scraping, E2E |
| Data | DB, storage, ETL, schemas |
| Security | Secrets, auth, vulns, PII |
| Creative | Copy, images, music |
| Research | External facts, comparisons, literature |

## Repository note

This workspace may embed Jarvis-related app code. The Orchestrator still **does not** implement; it only assigns and synthesises.
