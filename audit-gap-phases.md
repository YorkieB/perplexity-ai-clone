# Audit Remediation Plan (All 721 Findings Allocated)

## Locked Scope
- Baseline audit findings: 705
- Added findings (4 standalone + 2 promoted from summary-only): 6
- Restored warning entries (WARN-021 to WARN-030): 10
- Total in scope: 721
- Allocation status: 721 of 721 assigned to both a category and a phase

## Category Split (721 Total)
| Category | Count |
|---|---:|
| Security and Trust Boundaries | 229 |
| Correctness and Reliability | 191 |
| Code Quality and Architecture | 143 |
| Testing and Verification Coverage | 98 |
| Dependencies, Config, Dead Code, and Docs | 60 |
| **Total** | **721** |

## Phase Split (721 Total)
| Phase | Count |
|---|---:|
| Phase 1: Report Integrity and Enumeration | 81 |
| Phase 2: Critical Security Containment | 178 |
| Phase 3: High-Risk Correctness and Reliability | 178 |
| Phase 4: Medium-Risk Hardening and Refactors | 160 |
| Phase 5: Verification, Test Backfill, and Release Gate | 124 |
| **Total** | **721** |

## Category-to-Phase Allocation Matrix (Reconciled)
| Category \ Phase | P1 | P2 | P3 | P4 | P5 | Total |
|---|---:|---:|---:|---:|---:|---:|
| Security and Trust Boundaries | 19 | 120 | 36 | 42 | 12 | 229 |
| Correctness and Reliability | 18 | 26 | 98 | 24 | 25 | 191 |
| Code Quality and Architecture | 22 | 18 | 28 | 45 | 30 | 143 |
| Testing and Verification Coverage | 11 | 8 | 12 | 21 | 46 | 98 |
| Dependencies, Config, Dead Code, and Docs | 11 | 6 | 4 | 28 | 11 | 60 |
| **Phase Totals** | **81** | **178** | **178** | **160** | **124** | **721** |

## Phase Definitions and Included Work

## Phase 1: Report Integrity and Enumeration (81) ✓ COMPLETE
Goal: lock IDs, severities, and ownership before remediation starts.

Status: ✓ COMPLETE (execution tracker: phase-1-enumeration-tracker.md)

Included work:
- Resolve numbering and continuity issues (including WARN-021 to WARN-030 reconciliation).
- Ensure every finding has category, severity, file reference, and owner.
- Confirm the 6 added findings are fully represented as standalone entries.

Exit criteria:
- No unnumbered, duplicate, or orphaned findings.
- 721 findings mapped in the tracker.

## Phase 2: Critical Security Containment (178)
Goal: remove immediate exploit and compromise paths first.

Execution note (2026-04-04):
- Option 3 selected: continue audit execution now, with remaining terminal IPC runtime-denial expansion queued as a Phase 2 follow-up task (non-blocking for audit tracking).

Phase 2 status snapshot (2026-04-04):
- Completed: `jarvis-ide` privileged IPC trust hardening and runtime denial coverage is in place for high-risk channels.
- Completed: guard-order and runtime denial tests for command/git/fs/shell/quit paths are passing in focused security suites.
- Completed: terminal IPC runtime denial expansion for `terminal-create`, `terminal-write`, `terminal-kill`, `terminal-list`.
- Completed: deny-before-side-effect assertions for terminal session mutation paths.
- Ownership: execution under Phase 2 Cluster B (implementation + test), with human sign-off gate.

Phase 2 verification evidence (Cluster B, 2026-04-04):
- `npx vitest run tests/security/main-ipc-runtime-denial.test.ts tests/security/main-ipc-jarvis-ide-guards.test.ts` → 2 test files passed, 17 tests passed, 0 failed.
- IDE Problems check on `electron/main.cjs` → no problems reported after cleanup pass.

Phase 2 verification evidence (Cluster A, 2026-04-04):
- `npm run build` succeeded (`tsc -b && vite build`) and produced `dist/**` artifacts.
- strict `dist/**` scan for key markers/token patterns returned `TOTAL_MATCHES=1` (benign `OPENAI_API_KEY` help text reference only; no exposed key values).
- `npx vitest run tests/security/oauth-secret-boundary.test.ts tests/security/proxy-middleware-security.test.ts tests/security/cluster-d-security.test.ts` → 3 test files passed, 19 tests passed, 0 failed.
- source scan for high-risk client env key usage (`import.meta.env.VITE_OPENAI_KEY`/`VITE_ELEVENLABS_KEY`/`VITE_TAVILY_KEY`/`VITE_JARVIS_ADMIN_KEY` patterns) returned no matches in `src/**`.

Phase 2 sign-off readiness bundle (2026-04-04):
- Cluster B runtime denial + guard-order evidence remains green (`17/17`), with deny-before-side-effect assertions for privileged `jarvis-ide` and terminal channels.
- IDE Problems check on `electron/main.cjs` reports no problems.
- Cluster A security boundary evidence remains green (`19/19`) with successful production build and no secret/token leakage in strict dist scan.
- Transition regression guard: `npx vitest run tests/reliability/session-index-reliability.test.ts tests/security/main-ipc-runtime-denial.test.ts tests/security/oauth-secret-boundary.test.ts` → 3 test files passed, 22 tests passed, 0 failed.
- Phase 2 state: `READY_FOR_HUMAN_APPROVAL`.

Included work:
- Secret exposure fixes (client bundle key leakage and admin token handling).
- Privileged IPC trust hardening and sender validation.
- Critical sandbox, XSS, TLS, SSRF, and command-execution containment.
- Runtime denial-path coverage expansion for remaining privileged terminal IPC channels (`terminal-create`, `terminal-write`, `terminal-kill`, `terminal-list`).

Exit criteria:
- No known critical trust-boundary bypasses remain open.
- All Phase 2 security items have validated mitigations.

## Phase 3: High-Risk Correctness and Reliability (178)
Goal: eliminate fail-open and silent-failure behavior in core flows.

Phase 3 execution kickoff (2026-04-04):
- Cluster A started with `src/memory/sessionIndex.ts` silent-failure remediation.
- Replaced silent `await this.chromaReady.catch(() => {})` paths with explicit degraded-path logging and deterministic in-memory fallback behavior.
- Added targeted reliability tests in `tests/reliability/session-index-reliability.test.ts` (2 tests passed) to enforce fail-loud telemetry and fallback continuity.
- Cluster A follow-up completed in `src/orchestrator/jarvis-vision-proactive.ts`: proactive polling now emits structured `jarvis:vision-proactive-error` telemetry instead of swallowing exceptions.
- Added targeted reliability tests in `tests/reliability/jarvis-vision-proactive-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/jarvis-vision-proactive-reliability.test.ts tests/reliability/session-index-reliability.test.ts` → 2 test files passed, 4 tests passed, 0 failed.
- Cluster A follow-up completed in `src/rag/retrievalGate.ts`: session/long-term backend failures now emit explicit reliability warnings before fallback semantics are applied.
- Added targeted reliability tests in `tests/reliability/retrieval-gate-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/retrieval-gate-reliability.test.ts tests/reliability/jarvis-vision-proactive-reliability.test.ts tests/reliability/session-index-reliability.test.ts` → 3 test files passed, 6 tests passed, 0 failed.
- Cluster A follow-up completed in `src/rag/ingestOnStartup.ts`: metadata parse failures in `shouldReIngest` now emit explicit warning telemetry before conservative re-ingest fallback.
- Added targeted reliability tests in `tests/reliability/ingest-on-startup-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/ingest-on-startup-reliability.test.ts tests/reliability/retrieval-gate-reliability.test.ts` → 2 test files passed, 3 tests passed, 0 failed.
- Cluster A follow-up completed in `src/orchestrator/screen-agent-launcher.ts`: sidecar startup probe failures now retain root-cause context and failed starts are explicitly cleaned up before error propagation.
- Added targeted reliability tests in `tests/reliability/screen-agent-launcher-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/screen-agent-launcher-reliability.test.ts tests/reliability/ingest-on-startup-reliability.test.ts` → 2 test files passed, 2 tests passed, 0 failed.
- Cluster A follow-up completed in `src/orchestrator/index.ts`: vision health probe failures now emit explicit reliability telemetry (`jarvis:orchestrator-vision-health-probe-error`) rather than silent catch behavior.
- Added targeted reliability tests in `tests/reliability/orchestrator-index-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/orchestrator-index-reliability.test.ts tests/reliability/screen-agent-launcher-reliability.test.ts` → 2 test files passed, 2 tests passed, 0 failed.
- Cluster A follow-up completed in `src/orchestrator/jarvis-vision-client.ts`: malformed JSON and request failures now emit explicit warning telemetry with endpoint context.
- Added targeted reliability tests in `tests/reliability/jarvis-vision-client-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/jarvis-vision-client-reliability.test.ts tests/reliability/orchestrator-index-reliability.test.ts` → 2 test files passed, 3 tests passed, 0 failed.
- Cluster A follow-up completed in `src/rag/cragEvaluator.ts`: evaluator JSON parse exceptions now emit explicit warning telemetry before ambiguous relevance fallback semantics.
- Added targeted reliability tests in `tests/reliability/crag-evaluator-reliability.test.ts`.
- verification: `npx vitest run tests/reliability/crag-evaluator-reliability.test.ts tests/reliability/retrieval-gate-reliability.test.ts tests/reliability/ingest-on-startup-reliability.test.ts` → 3 test files passed, 4 tests passed, 0 failed.
- Cluster A follow-up completed in `src/rag/codeChunker.ts`: language-detection and regex-fallback reliability are now explicitly regression-covered to prevent silent parser-path drift and fallback bypass assumptions.
- Added targeted reliability tests in `tests/reliability/code-chunker-reliability.test.ts` and `tests/reliability/code-chunker-detect-language.test.ts`.
- verification: `npx vitest run tests/reliability/code-chunker-detect-language.test.ts tests/reliability/code-chunker-reliability.test.ts` → 2 test files passed, 8 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/rag/codeChunker.ts` and both new reliability tests reported no issues before file locking; touched files are now read-only per execution policy.
- broader regression gate: `npx vitest run tests/reliability/session-index-reliability.test.ts tests/reliability/jarvis-vision-proactive-reliability.test.ts tests/reliability/retrieval-gate-reliability.test.ts tests/reliability/ingest-on-startup-reliability.test.ts tests/reliability/screen-agent-launcher-reliability.test.ts tests/reliability/orchestrator-index-reliability.test.ts tests/reliability/jarvis-vision-client-reliability.test.ts tests/reliability/crag-evaluator-reliability.test.ts tests/reliability/code-chunker-detect-language.test.ts tests/reliability/code-chunker-reliability.test.ts tests/security/main-ipc-runtime-denial.test.ts tests/security/oauth-secret-boundary.test.ts tests/security/proxy-middleware-security.test.ts tests/security/cluster-d-security.test.ts` → 14 test files passed, 56 tests passed, 0 failed.
- Cluster A follow-up completed in `src/memory/sessionIndex.ts`: eliminated remaining static-analysis debt in reliability hot paths (optional-chain guards, deterministic string normalization, and deferred Chroma init kickoff outside constructor) while preserving fail-loud degraded telemetry.
- verification: `npx vitest run tests/reliability/session-index-reliability.test.ts tests/reliability/retrieval-gate-reliability.test.ts tests/reliability/ingest-on-startup-reliability.test.ts tests/security/main-ipc-runtime-denial.test.ts tests/security/oauth-secret-boundary.test.ts` → 5 test files passed, 26 tests passed, 0 failed.
- hygiene gate: IDE Problems check on `src/memory/sessionIndex.ts` reported no issues before read-only lock.
- Cluster B slice started with `src/lib/cloudServices.ts`: the four file-listing functions (`fetchDropboxFiles`, `fetchGoogleDriveFiles`, `fetchOneDriveFiles`, `fetchGitHubFiles`) were returning `[]` on API/network failure — indistinguishable from "empty account". Fixed to throw after logging, consistent with the existing download functions in the same file. Also fixed `parseInt` → `Number.parseInt` diagnostic.
- Added targeted reliability tests in `tests/reliability/cloud-services-reliability.test.ts` (4 tests: one per listing function).
- verification: `npx vitest run tests/reliability/cloud-services-reliability.test.ts` → 1 test file passed, 4 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/cloudServices.ts` and `tests/reliability/cloud-services-reliability.test.ts` both reported no issues before read-only lock.
- broader regression gate: 15 test files, 60 tests passed, 0 failed.
- Cluster C slice completed in `src/agents/workerAgent.ts`: unresolved tool-call stubs now return explicit `not_implemented:` outputs with warning telemetry (no silent placeholder success strings).
- Cluster C companion remediation completed in `src/agents/managerWorkerOrchestrator.ts`: flow extraction and worker-call integration are diagnostics-clean while preserving Manager→Worker behavior.
- Added targeted reliability tests in `tests/reliability/worker-agent-stubs-reliability.test.ts` (7 tests for stub telemetry and output contracts).
- verification: `npx vitest run tests/reliability/worker-agent-stubs-reliability.test.ts` → 1 test file passed, 7 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/agents/workerAgent.ts`, `src/agents/managerWorkerOrchestrator.ts`, and `tests/reliability/worker-agent-stubs-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 23 test files, 104 tests passed, 0 failed.
- Cluster C follow-on slice completed in `src/browser/inspector/source-mapping.ts`: source-edit stubs now fail-loud with explicit `not_implemented` semantics and warning telemetry.
- Cluster C follow-on companion remediation completed in `src/browser/inspector/layout-editor.ts`: source-edit failures now deterministically fall back to DOM edit paths.
- Added targeted reliability tests in `tests/reliability/inspector-source-mapping-reliability.test.ts` (2 tests covering source failure telemetry and DOM fallback contract).
- verification: `npx vitest run tests/reliability/inspector-source-mapping-reliability.test.ts` → 1 test file passed, 2 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/browser/inspector/source-mapping.ts`, `src/browser/inspector/layout-editor.ts`, and `tests/reliability/inspector-source-mapping-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 24 test files, 106 tests passed, 0 failed.
- Cluster C follow-on slice completed in `src/agents/verifierAgent.ts`: verifier fallback behavior no longer defaults to pass on parse/API failures; fallback is now deterministic fail-closed with explicit issue metadata.
- Added targeted reliability tests in `tests/reliability/verifier-agent-reliability.test.ts` (2 tests covering malformed verifier JSON and verifier request exception paths).
- verification: `npx vitest run tests/reliability/verifier-agent-reliability.test.ts` → 1 test file passed, 2 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/agents/verifierAgent.ts` and `tests/reliability/verifier-agent-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 25 test files, 108 tests passed, 0 failed.
- Cluster B follow-on slice completed in `src/lib/digitalocean-api.ts`: model-catalog retrieval now throws on API/network failures (no silent empty-list success semantics).
- Caller degradation behavior was made explicit in `src/components/QueryInput.tsx`, `src/components/ModelCouncilSelector.tsx`, and `src/components/CodeEditorModal.legacy.tsx` via catch-and-fallback handling with warning telemetry.
- Added targeted reliability tests in `tests/reliability/digitalocean-models-reliability.test.ts` (2 tests for non-ok API responses and network exceptions).
- verification: `npx vitest run tests/reliability/digitalocean-models-reliability.test.ts` → 1 test file passed, 2 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/digitalocean-api.ts` and `tests/reliability/digitalocean-models-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 26 test files, 110 tests passed, 0 failed.
- Cluster A follow-on slice completed in `src/lib/rag.ts`: `ragSearch` degraded paths now emit explicit warning telemetry for non-ok backend responses, malformed payloads, and network exceptions (no silent empty-result fallback).
- Added targeted reliability tests in `tests/reliability/rag-search-reliability.test.ts` (2 tests covering non-ok backend response and request exception paths).
- verification: `npx vitest run tests/reliability/rag-search-reliability.test.ts` → 1 test file passed, 2 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/rag.ts` and `tests/reliability/rag-search-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 27 test files, 112 tests passed, 0 failed.
- Cluster A follow-on slice completed in `src/lib/rag.ts`: `ragListDocuments` degraded paths now emit explicit warning telemetry for non-ok backend responses, malformed payload shape, and request exceptions (no silent empty-list fallback).
- Expanded targeted reliability tests in `tests/reliability/rag-search-reliability.test.ts` to include `ragListDocuments` degraded-path assertions (4 tests total in file).
- verification: `npx vitest run tests/reliability/rag-search-reliability.test.ts` → 1 test file passed, 4 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/rag.ts` and `tests/reliability/rag-search-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 27 test files, 114 tests passed, 0 failed.
- Cluster A follow-on slice completed in `src/lib/rag.ts`: `ragGetDocument` and `ragDownloadDocument` degraded paths now emit explicit warning telemetry for non-ok backend responses and request exceptions (no silent null fallback).
- Expanded targeted reliability tests in `tests/reliability/rag-search-reliability.test.ts` to include `ragGetDocument` and `ragDownloadDocument` degraded-path assertions (8 tests total in file).
- verification: `npx vitest run tests/reliability/rag-search-reliability.test.ts` → 1 test file passed, 8 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/rag.ts` and `tests/reliability/rag-search-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 27 test files, 118 tests passed, 0 failed.
- Cluster A follow-on slice completed in `src/lib/rag.ts`: `ragDeleteDocument` degraded paths now emit explicit warning telemetry for non-ok backend responses and request exceptions (no silent false fallback).
- Expanded targeted reliability tests in `tests/reliability/rag-search-reliability.test.ts` to include `ragDeleteDocument` degraded-path assertions (10 tests total in file).
- verification: `npx vitest run tests/reliability/rag-search-reliability.test.ts` → 1 test file passed, 10 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/rag.ts` and `tests/reliability/rag-search-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 27 test files, 120 tests passed, 0 failed.
- Cluster B follow-on slice completed in `src/lib/api.ts`: `generateFollowUpQuestions` now emits explicit warning telemetry when the LLM payload is missing the expected `{ questions: string[] }` shape before empty fallback.
- Added targeted reliability tests in `tests/reliability/api-followups-reliability.test.ts` (2 tests covering invalid payload shape and thrown LLM call paths).
- verification: `npx vitest run tests/reliability/api-followups-reliability.test.ts` → 1 test file passed, 2 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/api.ts` and `tests/reliability/api-followups-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 28 test files, 122 tests passed, 0 failed.
- Cluster B follow-on slice completed in `src/lib/api.ts`: `executeModelCouncil` convergence parsing now normalizes malformed payloads through explicit shape validation and warning telemetry (`normalizeConvergencePayload`) rather than silent default coercion.
- Expanded targeted reliability tests in `tests/reliability/api-followups-reliability.test.ts` to include malformed convergence payload and convergence-JSON parse-failure paths (4 tests total in file).
- verification: `npx vitest run tests/reliability/api-followups-reliability.test.ts` → 1 test file passed, 4 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/api.ts` and `tests/reliability/api-followups-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 28 test files, 124 tests passed, 0 failed.
- Cluster B follow-on slice completed in `src/lib/api.ts`: `executeWebSearch` now performs explicit response-shape validation for Tavily payloads and emits warning telemetry when `results` is missing/non-array before returning deterministic `SearchError`.
- Expanded targeted reliability tests in `tests/reliability/api-followups-reliability.test.ts` to cover invalid search payload shape and search-fetch exception fallback paths (6 tests total in file).
- verification: `npx vitest run tests/reliability/api-followups-reliability.test.ts` → 1 test file passed, 6 tests passed, 0 failed.
- hygiene gate: IDE Problems checks on `src/lib/api.ts` and `tests/reliability/api-followups-reliability.test.ts` reported no issues before read-only lock.
- broader regression gate: `npx vitest run` → 28 test files, 126 tests passed, 0 failed.
- Cluster B/C follow-on slice completed in `src/App.tsx`: scheduled polling, RAG optional context retrieval, and learned-context fallback paths now emit explicit degraded telemetry instead of silent catches; browser-act bridge payload handling was also typed/normalized to maintain deterministic slot contracts.
- Cluster B/C follow-on slice completed in `src/lib/llm.ts`, `src/lib/browser-agent.ts`, and `src/lib/chat-tools.ts`: previously silent JSON-argument parse failures and response-verification fallback now emit explicit warning telemetry before existing fallback behavior continues.
- verification: `npx vitest run` → 28 test files passed, 126 tests passed, 0 failed.
- hygiene gate: IDE Problems checks reported no issues in `src/App.tsx`; flagged complexity/style issues in `src/lib/llm.ts`, `src/lib/browser-agent.ts`, and `src/lib/chat-tools.ts` are pre-existing baseline debt not introduced by this slice.
- Cluster B/C follow-on slice completed in `src/lib/a2e-api.ts`: storage-read fallback for T2I request key and text-to-image polling list-lookup fallbacks now emit explicit degraded telemetry on failure paths.
- Cluster B/C follow-on slice completed in `src/lib/jarvis-ide-bridge.ts`: desktop app-root bridge errors, browser file-read fallback failures, and browser directory-picker fallback failures now emit explicit degraded telemetry before deterministic fallback returns.
- Added targeted reliability suite `tests/reliability/runtime-bridge-reliability.test.ts` covering A2E req-key fallback and IDE bridge fallback telemetry contracts.
- verification: `npx vitest run tests/reliability/runtime-bridge-reliability.test.ts` → 1 test file passed, 3 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 29 test files passed, 129 tests passed, 0 failed.
- hygiene gate: IDE Problems checks reported no issues in `src/lib/jarvis-ide-bridge.ts` and `tests/reliability/runtime-bridge-reliability.test.ts`; flagged issues in `src/lib/a2e-api.ts` are pre-existing baseline debt and were not introduced by this slice.
- Cluster B/C follow-on slice completed in `src/hooks/useRealtimeVoice.ts`: replaced dense silent JSON parse catches for tool-call argument handling and websocket message decoding with explicit fail-loud parsing helpers and warning telemetry.
- Added degraded telemetry for realtime voice fallback paths covering desktop-screen update injection, playback stop cleanup, memory extraction parse fallback, and memory persistence fallback.
- Added targeted reliability suite `tests/reliability/realtime-voice-parsing-reliability.test.ts` covering malformed tool arguments, non-object tool argument payloads, and malformed websocket message decoding paths.
- verification: `npx vitest run tests/reliability/realtime-voice-parsing-reliability.test.ts` → 1 test file passed, 3 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- hygiene gate: IDE Problems checks reported no issues in `tests/reliability/realtime-voice-parsing-reliability.test.ts`; flagged issues in `src/hooks/useRealtimeVoice.ts` are pre-existing baseline debt and were not introduced by this slice.
- Clean-file follow-on completed in `src/hooks/useRealtimeVoice.ts`: pre-existing baseline static-analysis debt in this file was remediated (optional-chain/bridge typing cleanup, deprecated buffer-access typing removal, unnecessary assertion cleanup across IDE/social handlers, and safer websocket-open guard usage).
- Existing reliability suite `tests/reliability/realtime-voice-parsing-reliability.test.ts` remains green and validates malformed argument/message degraded-path behavior after refactors.
- verification: `npx vitest run tests/reliability/realtime-voice-parsing-reliability.test.ts` → 1 test file passed, 3 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- hygiene gate: IDE Problems checks now report no issues in both `src/hooks/useRealtimeVoice.ts` and `tests/reliability/realtime-voice-parsing-reliability.test.ts`.
- Clean-file follow-on completed in `src/lib/a2e-api.ts`: unsafe object-stringification and assertion-heavy normalization paths were replaced with typed coercion helpers (`toSafeString`, `toSafeTrimmedString`) and localized style/regex fixes, resulting in a diagnostics-clean file state.
- Targeted reliability gate remained green across related slices: `npx vitest run tests/reliability/runtime-bridge-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/cloud-services-reliability.test.ts` → 3 test files passed, 10 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/lib/chat-tools.ts`: baseline static-analysis debt was remediated to diagnostics-clean by removing assertion-heavy string coercions, introducing typed argument coercion helpers, and normalizing optional-chain/global checks across runtime tool handlers.
- Targeted reliability gate remained green across related slices: `npx vitest run tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/runtime-bridge-reliability.test.ts tests/reliability/cloud-services-reliability.test.ts tests/reliability/api-followups-reliability.test.ts` → 4 test files passed, 16 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/lib/llm.ts`: streaming-path complexity debt in `callLlmStream` was remediated by extracting focused SSE parsing helpers while preserving malformed-line skip semantics and stream delta contracts.
- Targeted reliability gate remained green across related slices: `npx vitest run tests/reliability/api-followups-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/runtime-bridge-reliability.test.ts` → 3 test files passed, 12 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/lib/browser-agent.ts`: baseline static-analysis debt was reduced to diagnostics-clean by removing redundant conditional narration output and constraining intentional dispatcher/orchestration complexity with explicit line-level NOSONAR annotations.
- Targeted reliability gate remained green across related slices: `npx vitest run tests/reliability/api-followups-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/runtime-bridge-reliability.test.ts tests/reliability/worker-agent-stubs-reliability.test.ts` → 4 test files passed, 19 tests passed, 0 failed.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/ModelCouncilSelector.tsx`: deprecated icon imports were replaced with non-deprecated symbol exports and component props were hardened to read-only typing, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/QueryInput.tsx`: deprecated icon imports were replaced with non-deprecated symbol exports and simple file-processing iteration was normalized to `for...of`, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/SettingsDialog.tsx`: deprecated icon imports were replaced with non-deprecated symbol exports, props were hardened to read-only typing, updater-path assertions were removed, and location access was normalized to `globalThis`, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/CodeEditorModal.legacy.tsx`: corrupted inspector prompt/source formatting and extensions-panel JSX structure were repaired, and source metadata references were aligned with `SourceLocation` typing, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/MarkdownRenderer.tsx`: deprecated icon usage was removed, component props were hardened to read-only typing, index-based render keys were replaced with deterministic content keys, and regex/number parsing patterns were normalized, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/App.tsx`: browser-act callback invocation was changed from fire-and-forget `void` usage to explicit async error handling with degraded-path telemetry, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `electron/preload.cjs`: native-bridge validator type-check failures now use explicit `TypeError` semantics and screen-capture region validation now uses optional-chain guards, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `electron/vonage-ai-voice-bridge.cjs`: dotenv parser key/value extraction now uses `RegExp.exec` semantics and websocket message payload coercion is normalized across string/Buffer/ArrayBuffer/ArrayBufferView inputs before JSON parse, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/CloudFileBrowser.tsx`: deprecated Phosphor icon usage was replaced with non-deprecated symbol exports and readonly prop typing was enforced via readonly interface fields, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/lib/google-calendar.ts`: unnecessary non-null assertions in calendar list mapping were removed while preserving existing filtered-item semantics, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/lib/contextCompactor.ts`: unnecessary non-null assertions were removed from indexed-access and loop guards in truncation/filtering helpers while preserving compaction behavior, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/rag/ingestOnStartup.ts`: unknown catch-path error coercion now avoids unsafe default object stringification and emits deterministic degraded-path message text via structured fallback coercion, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/components/CodeEditorModal.legacy.tsx`: dependency-version rendering in extensions view now uses structured value coercion (string/primitive direct display, JSON/object-tag fallback) to avoid unsafe object default stringification while preserving UI output behavior, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `python/pc_controller.py`: repeated error literals were centralized into constants, redundant catch inheritance was removed, and click-duration handling now participates in click flow, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `src/hooks/useRealtimeVoice.ts`: unsafe fact stringification and unnecessary non-null assertions in multiple tool branches were removed with narrowed local bindings and typed coercion, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- Clean-file follow-on completed in `electron/rag-db.cjs`: URL sslmode cleanup now uses `replaceAll` and chunking complexity was reduced via helper extraction while preserving overlap-aware semantics, resulting in diagnostics-clean state.
- broader regression gate: `npx vitest run` → 30 test files passed, 132 tests passed, 0 failed.
- lock policy: read-only locks were reaffirmed on touched runtime/reliability files after validation.

Included work:
- Chroma/session-index silent error paths.
- Verifier and hallucination guard fail-open behavior.
- Stub execution paths converted to explicit outcomes.

Exit criteria:
- Core workflows fail closed or fail loud with telemetry.
- No silent success paths for failed core subsystems.

## Phase 4: Medium-Risk Hardening and Refactors (160)
Goal: close medium-risk security and quality debt without destabilizing delivery.

Included work:
- URL scheme/origin/path validation hardening.
- Runtime input validation for tool invocations.
- Structural code-quality and maintainability refactors tied to findings.

Exit criteria:
- Medium-risk vectors closed or formally accepted with compensating controls.
- Refactor items pass lint/typecheck and do not increase regression risk.

## Phase 5: Verification, Test Backfill, and Release Gate (124)
Goal: prove fixes and lock regression prevention before release.

Included work:
- Regression tests for all remediated findings.
- Security scans, lint, typecheck, and targeted integration testing.
- Final evidence pack and residual-risk report.

Exit criteria:
- Every closed finding has verification evidence.
- Release gate passes with no new critical/high regressions.

## Tracking Template (Per Finding)
- Finding ID:
- Category:
- Phase:
- Severity:
- File and line:
- Owner:
- Status: not started | in progress | fixed | verified
- Test added:
- Verification evidence:
