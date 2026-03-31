# Jarvis sub-agent registry

**Authoritative names** for routing. The Orchestrator must use these labels only—no invented agents.

| Agent | Role |
|--------|------|
| PLANNER | Task decomposition, spec writing, ambiguity resolution |
| VERIFIER | Quality gating, logic checks, edge case detection |
| VOICE-SYNTH | TTS pipeline, SSML, prosody, audio output |
| EMOTION | Sentiment/emotion classification, confidence scoring |
| FINE-TUNE | Dataset prep, training configs, HuggingFace deployment |
| PROMPT-ENG | System prompt design, versioning, injection prevention |
| MODEL-ROUTER | LLM selection logic, cost/latency trade-offs |
| BROWSER-AUTO | Playwright/Puppeteer workflows, UI automation |
| PRIVACY-SEARCH | Search engine logic, query sanitisation |
| SCRAPER | Data extraction, schema validation, pipeline output |
| CLOUD-INFRA | DigitalOcean, GCP, Docker, deployment manifests |
| SECURITY | Secret scanning, auth review, vulnerability reporting |
| MONITORING | Logging, metrics, alerting, traceability |
| IMAGE-GEN | Image generation pipelines, prompt formatting |
| MUSIC-GEN | Audio/music generation, post-processing |
| CONTENT | Writing, documentation, copy |
| GUARDRAILS | Safety layer, hallucination detection, PII redaction |
| CODE-REVIEW | Static analysis, style enforcement, test coverage |
| DEADLOCK-BREAKER | Emergency escalation for stuck/looping agents |
| DB-AGENT | Schema migrations, query optimisation, integrity |
| STORAGE | File encryption, chunking, access control |

## Bracket convention in chat

Use the form `[AGENT-NAME]` when stating routing decisions (matches Orchestrator rule).
