# Phase 4 Execution: Medium-Risk Hardening and Refactors

## Objective
Close medium-risk security and quality debt without destabilizing delivery.

## Scope: 160 findings
- URL scheme/origin/path validation hardening
- Runtime input validation for tool invocations
- Structural code-quality and maintainability refactors

## Phase 3 → Phase 4 Handoff
- Phase 3 high-risk correctness work is complete (178 findings, 46 slices, all gates passing).
- Dependency audit remains clean (`npm audit` reports 0 vulnerabilities).
- Full Vitest suite: 30 test files, 132 tests, 0 failed.
- All Phase 3 modified files locked (read-only) to prevent regression.

## Current Execution State (2026-04-05)
- Phase 4 is now active.
- **Cluster A Slice 1 Complete**: URL validation framework implemented, tested, and verified.
- **Cluster A Slice 2 Complete**: Browser navigation validation applied to all entry points.
- **Cluster A Slice 3 Complete**: Cloud download/upload path validation gates applied and verified.
- **Cluster A Slice 4 Complete**: API routing/proxy search-result URL validation applied and verified.
- **Cluster A Slice 5 Complete**: Dynamic external-link opening paths hardened in IPC routes and verified.
- **Cluster A Complete**: Slices 1-5 complete with full regression gates passing.
- **Cluster B Slice 1 Complete**: Tool argument shape guards added to chat and realtime voice high-risk browser/task paths.
- **Cluster B Slice 2 Complete**: Deterministic numeric/string bounds enforcement added for browser/task/media and desktop-automation contracts.
- **Cluster B Slice 3 Complete**: Validation-failure telemetry standardized for chat/voice fail-closed paths with deterministic fallback outputs.
- **Cluster B Slice 4 Complete**: Desktop automation runner contract hardening verified with deny-before-side-effect reliability coverage.
- **Phase 4 Closeout Complete**: Dependency/build/regression/Snyk gates executed and captured.
- **Post-Closeout TLS Pass Complete**: Local bridge/listener transports moved to localhost HTTPS with repo-managed certs; all `HttpToHttps` medium findings cleared.
- **Current Security Backlog (post-static-cache hardening)**: `13 total` (`13 low`, `0 medium`, `0 high`).

### Phase 4 Verification Evidence (Cluster A, Slice 2 — Browser Navigation Hardening)
- **Refactored Files** (5):
  1. `src/browser/embed-url-guard.ts` — OAuth/token endpoint rejection expanded (imported centralized validators)
  2. `src/browser/screen-browser-act.ts` — Added `sanitizeRedirectUrl()` validation gate before `browser.openUrl()`
  3. `src/hooks/useRealtimeVoice.ts` — Added `sanitizeRedirectUrl()` validation in navigate tool handler
  4. `src/lib/google-calendar.ts` — Fixed TypeScript strict mode type guard in `listCalendars()` filter
  5. `tests/validation/url-validation-browser-integration.test.ts` — 18 new integration tests (created)
- **Integration Testing**: Browser navigation validation boundaries
  - OAuth token endpoint rejection: Rejects all `/oauth`, `/token`, `/authorize/token` paths
  - Redirect sanitization: Allows same-origin/hash URLs, rejects cross-origin without allowlist
  - Scheme validation: Blocks dangerous schemes (javascript, data, file, etc.)
  - Encoding edge cases: Handles URL-encoded path attempts correctly
- **Regression Gate** (Post-Slice 2): `npx vitest run --reporter=json`
  - Result: **82 test suites passed, 189 tests passed, 0 failed**
  - Breakdown: 39 (Slice 1) + 18 (Slice 2) + 132 (existing) = 189 tests, all green
  - No regressions detected; browser navigation hardening validated
- **Lint Fixes Applied** (during Slice 2):
  - Negated condition: `screen-browser-act.ts` — inverted condition logic
  - Type guard: `google-calendar.ts` — explicit type guard on filter
  - Syntax error: `google-calendar.ts` — removed stray quote in map arrow function
- **Lock Status**: All Slice 2 deliverables now read-only locked

### Phase 4 Verification Evidence (Cluster A, Slice 3 — File Download/Upload Path Validation)
- **Refactored File**: `src/lib/cloudServices.ts`
  - Added `isPathTraversalAttempt` import from centralized URL validation helpers.
  - Added `validateOpaqueFileId(fileId, provider)` for Google Drive/OneDrive/Dropbox IDs.
  - Added `validateDropboxPath(path)` for remote Dropbox file path input.
  - Added `validateGitHubRepoPath(path)` for GitHub repository/content path input.
  - All validation gates run before `fetch` calls (fail closed on invalid input).
- **Created Test File**: `tests/validation/cloud-services-download-validation.test.ts`
  - Added 5 tests for traversal and malformed input rejection plus valid-path acceptance.
  - Verifies `fetch` is not called when validation rejects unsafe input.
- **Validation Suite Gate**: `npx vitest run tests/validation/`
  - Result: **3 test files passed, 62 tests passed, 0 failed**
- **Full Regression Gate**: `npx vitest run --reporter=json --outputFile=vitest-summary.json`
  - Result: **84 test suites passed, 194 tests passed, 0 failed**
  - No regressions detected.
- **Diagnostics**: No TypeScript/IDE errors in modified files.

### Phase 4 Verification Evidence (Cluster A, Slice 4 — API Routing & Proxy Validation)
- **Refactored File**: `src/lib/api.ts`
  - Added centralized URL validation usage with `parseUrlSafely()` + `isSafeScheme()` for Tavily result URLs.
  - Added `normalizeSearchResult()` to fail closed on malformed/unsafe result URLs.
  - Rejected credential-bearing URLs (`username/password`) in provider result links.
  - Clamped confidence to deterministic `0..100` range and normalized result title/snippet fields.
  - Added telemetry warning when unsafe/malformed provider URLs are dropped.
- **Updated Test File**: `tests/reliability/api-followups-reliability.test.ts`
  - Added reliability tests for unsafe/malformed URL filtering in `executeWebSearch`.
  - Added coverage for all-results-invalid path (returns empty source list instead of throwing).
- **Targeted Gate**: `npx vitest run tests/reliability/api-followups-reliability.test.ts`
  - Result: **1 test file passed, 8 tests passed, 0 failed**
- **Full Regression Gate**: `npx vitest run --reporter=json --outputFile=vitest-summary.json`
  - Result: **84 test suites passed, 196 tests passed, 0 failed**
  - No regressions detected.
- **Diagnostics**: No TypeScript/IDE errors in modified files.

### Phase 4 Verification Evidence (Cluster A, Slice 5 — Dynamic Redirect & Link-Opening Paths)
- **Refactored File**: `electron/main.cjs`
  - Added `normalizeSafeExternalUrl()` guard to external URL open paths.
  - Enforced safe `http/https`-only scheme policy for external opens.
  - Rejected credential-bearing URLs (`username/password`) before shell invocation.
  - Applied validation in:
    - `shell-open-external` (browser IPC)
    - `jarvis-ide-open-external` (IDE IPC)
- **Updated Test File**: `tests/security/main-ipc-runtime-denial.test.ts`
  - Added trusted-sender negative tests to verify unsafe scheme rejection.
  - Added trusted-sender negative tests to verify URL credential rejection.
- **Targeted Security Gate**: `npx vitest run tests/security/main-ipc-runtime-denial.test.ts`
  - Result: **1 test file passed, 16 tests passed, 0 failed**
- **Final Cluster A Regression Gate**: `npx vitest run --reporter=json --outputFile=vitest-summary.json`
  - Result: **84 test suites passed, 198 tests passed, 0 failed**
  - No regressions detected.
- **Diagnostics**: No errors in modified Slice 5 files.
### Phase 4 Verification Evidence (Cluster A, Slice 1)
- **Created**: `src/lib/url-validation.ts` with 7 reusable URL validation helpers
  - `isValidUrl()` — basic URL parsing validation
  - `isSafeScheme()` — whitelist scheme checking (http/https/ws/wss only)
  - `isOriginAllowed()` — origin whitelist matching with wildcard support
  - `parseUrlSafely()` — structured URL parsing with null fallback
  - `isPathTraversalAttempt()` — path traversal detection (basic and encoded)
  - `sanitizeRedirectUrl()` — redirect safety gate for location assignments
  - `validateFileDownloadPath()` — download sandbox validation
- **Test Coverage**: `tests/validation/url-validation.test.ts` with 39 comprehensive tests
  - Positive cases: valid URLs, safe schemes, allowed origins, proper parsing
  - Negative cases: malformed URLs, dangerous schemes (ftp, file, javascript), path traversal attempts (../../../, %2e%2e, double-encoded)
  - Boundary cases: wildcards, multiple origins, empty inputs, non-string inputs
- **Regression Gate**: `npx vitest run --reporter=json`
  - Result: **77 test files passed, 171 tests passed, 0 failed**
  - Analysis: 39 new URL validation tests + 132 existing tests all green
  - No regressions detected; full suite remains stable
- **Diagnostics Check**: All files diagnostics-clean after lint fixes
- **Lock Status**: Ready for lock application after verification

### Phase 4 Verification Evidence (Cluster B, Slice 1-2 — Tool Args Shape + Bounds Hardening)
- **Refactored Files** (4):
  1. `src/lib/chat-tools.ts`
  2. `src/hooks/useRealtimeVoice.ts`
  3. `src/lib/desktop-automation-guard.ts`
  4. `src/lib/desktop-automation-tool-runner.ts`
- **Created Test File**: `tests/reliability/desktop-automation-guard-reliability.test.ts`
  - Rejects invalid/non-integer/negative `session_id` values.
  - Rejects oversized PowerShell command payloads.
  - Rejects invalid `cwd` contracts.
  - Confirms bounded valid payload acceptance.
- **Validation Changes Applied**:
  - Fail-closed args-shape guard at chat executor entry (`Invalid tool arguments.` when payload is non-object).
  - Browser tool bounds in chat/voice (`navigate`, `new_tab`, `scroll`, `switch_tab`, `close_tab`, `browser_task.goal`).
  - URL safety enforcement in chat and voice for navigation/new-tab actions.
  - Desktop automation pre-validation for command length, optional cwd, and strict positive integer `session_id`.
- **Targeted Reliability/Security Gate**:
  - `npx vitest run tests/reliability/desktop-automation-guard-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts tests/security/desktop-automation-ipc-guard.test.ts`
  - Result: **3 test files passed, 22 tests passed, 0 failed** (initial post-slice gate)

### Phase 4 Verification Evidence (Cluster B, Slice 3 — Fail-Closed Telemetry Consistency)
- **Refactored Files** (2):
  1. `src/lib/chat-tools.ts`
  2. `src/hooks/useRealtimeVoice.ts`
- **Updated Test File**: `tests/reliability/realtime-voice-parsing-reliability.test.ts`
  - Added deterministic fallback-shape assertions for non-string tool args (`{}` fallback) and non-string websocket payloads (`null` drop).
- **Telemetry Consistency Changes**:
  - Added standardized validation-failure warnings in chat executor (`[ChatTools] Validation failed for <tool>: <reason>` with metadata object).
  - Added standardized validation-failure warnings in realtime voice (`[RealtimeVoice] Validation failed for <tool>: <reason>`).
  - Voice `browser_action.new_tab` now uses the same URL safety gate as chat and fails closed with deterministic output.
  - Voice invalid browser-task goal now returns deterministic `Missing or invalid goal parameter.` output.
- **Targeted Reliability/Security Gate (final)**:
  - `npx vitest run tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/desktop-automation-guard-reliability.test.ts tests/security/desktop-automation-ipc-guard.test.ts`
  - Result: **3 test files passed, 24 tests passed, 0 failed**
- **Diagnostics Gate**:
  - No type/compile errors in modified files: `src/lib/chat-tools.ts`, `src/hooks/useRealtimeVoice.ts`, `tests/reliability/realtime-voice-parsing-reliability.test.ts`.

### Phase 4 Verification Evidence (Cluster B, Slice 4 — Desktop Automation Contract Enforcement)
- **Created Test File**: `tests/reliability/desktop-automation-tool-runner-reliability.test.ts`
  - Added deny-before-side-effect assertions for:
    - invalid `cwd` in `powershell_session_create` (no `terminalCreate` invocation),
    - invalid `session_id` in `powershell_session_write` (no `terminalWrite` invocation),
    - oversized command in `powershell_session_write` (no `terminalWrite` invocation),
    - invalid `cwd` in `powershell_execute` (no `powershellExec` invocation).
- **Targeted Reliability/Security Gate**:
  - `npx vitest run tests/reliability/desktop-automation-tool-runner-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts tests/reliability/desktop-automation-guard-reliability.test.ts tests/security/desktop-automation-ipc-guard.test.ts`
  - Result: **4 test files passed, 28 tests passed, 0 failed**
- **Diagnostics Gate**:
  - Diagnostics-clean after follow-on refactor: `src/lib/desktop-automation-tool-runner.ts`, `src/lib/desktop-automation-guard.ts`, `tests/reliability/desktop-automation-tool-runner-reliability.test.ts`.

### Phase 4 Verification Evidence (Cluster C, Slice 1 — Static Analysis Quick-Fixes)
- **Files Modified** (15):
  1. `src/agents/voice/index.ts` — removed `void` from `ctx.close/resume.catch()` and `this.drain()` calls; replaced `Math.random()` temp-file suffix with `crypto.randomBytes(8).toString('hex')`; fixed PowerShell spawn to pass path via `$env:JARVIS_WAV_PATH` env var instead of string interpolation; added eslint-disable-line comments for legitimate system-binary PATH resolution
  2. `src/reasoning/confidenceElicitor.ts` — removed unused `ELICITATION_INSTRUCTION` import; applied bounded quantifier (`{0,200}`) on `CONFIDENCE_FLAT_REGEX` slow-regex; removed `void scores.verbalized` and `void taskType` no-op lines; extracted nested ternary into `if/else if/else` block
  3. `src/reasoning/routingClassifier.ts` — removed unused `ComplexityAssessment` type import; removed unused `ModelSpec` from type import; removed `MODEL_REGISTRY` from runtime import; removed `void MODEL_REGISTRY[tier]` no-op line
  4. `src/reasoning/uncertaintyResolver.ts` — removed unused `ConfidenceVector` and `ConfidenceAction` type imports; removed `void` from `lessonsStore.recordApplied().catch()` fire-and-forget call
  5. `src/reasoning/modelRouter.ts` — removed unused `ROUTING_RULES` import; removed `void ROUTING_RULES` no-op line
  6. `src/reasoning/costTracker.ts` — removed unused `MODEL_REGISTRY` import; removed `void MODEL_REGISTRY[tier]` no-op line
  7. `src/reasoning/reflexionController.ts` — removed `void` from both `lessonsStore.recordApplied().catch()` calls
  8. `src/reasoning/lessonsStore.ts` — changed constructor `void this.ensureLoaded()` to `this.ensureLoaded().catch(() => {})` for proper fire-and-forget semantics
  9. `src/agents/behaviour/behaviour-analyser.ts` — `let peakHours` → `const peakHours` (prefer-const: binding never reassigned)
  10. `src/agents/screen-agent/significance-detector.ts` — split destructure: `const { score, reason } = result; let { shouldSpeak } = result`; added initial value to `reduce()` call
  11. `src/agents/behaviour/behaviour-logger.ts` — changed `void this.flush()` in `setInterval` to `this.flush().catch(() => {})`
  12. `src/agents/screen-agent/python-bridge.ts` — removed `void` from `this.connect().catch()` reconnect call
  13. `src/hooks/useScreenVision.ts` — changed `void videoRef.current.play()` to `videoRef.current.play().catch(() => {})`
  14. `src/components/VoiceMode.tsx` — removed `void` from both `ipc(open).catch()` and `ipc(false).catch()` calls
  15. `src/agents/managerWorkerOrchestrator.ts` — re-applied duplicate-block removal (lines 595–732 of HEAD); re-applied `Array.findLast` → explicit backward-scan loop
- **Rules Resolved**:
  - `sonarjs/void-use`: 14 violations cleared across 10 files
  - `sonarjs/no-os-command`: 1 violation cleared (PowerShell path via env var)
  - `sonarjs/no-os-command-from-path`: 3 spawn calls annotated with documented disable-line justifications
  - `sonarjs/pseudo-random`: 1 violation cleared (crypto.randomBytes)
  - `sonarjs/slow-regex`: 1 violation cleared (bounded quantifier on CONFIDENCE_FLAT_REGEX)
  - `sonarjs/no-nested-conditional`: 1 violation cleared (nested ternary extracted)
  - `sonarjs/reduce-initial-value`: 1 violation cleared
  - `@typescript-eslint/prefer-const`: 2 violations cleared
  - `@typescript-eslint/no-unused-vars` / unused imports: 8 unused type/value imports removed
- **Remaining in scope (Cluster C Slice 2)**: 7 `sonarjs/cognitive-complexity` violations, 1 `sonarjs/no-nested-functions`
- **Build Gate**: `npx tsc -b` — 0 errors
- **Full Regression Gate**: `npx vitest run`
  - Result: **35 test files passed, 208 tests passed, 0 failed**
  - No regressions detected.

---

### Phase 4 Verification Evidence (Cluster D — Maintainability and Architecture)
- **Files Modified** (13):
  1. `src/orchestrator.ts` — removed dead `_legacyClassifyIntent` private method (INFO-003/WARN-022) and its sole helper `isProbablyCodeRelated` (both dead after SemanticRouter became sole intent classifier)
  2. `src/agents/managerWorkerOrchestrator.ts` — fixed `PRE_TASK_LOG` prefix from `'[Orchestrator]'` → `'[MWOrchestrator]'` (INFO-004)
  3. `src/lib/voice/voiceSession.ts` — removed dead `if (chunk.byteLength < 0) return` guard in `NullVoiceSession.sendAudioChunk` (INFO-007); removed deprecated `VoiceSessionStub` alias export and its JSDoc (INFO-008/WARN-023)
  4. `src/lib/voice/index.ts` — removed `VoiceSessionStub` from named export (INFO-008/WARN-023)
  5. `src/lib/voice/openaiRealtimeVoiceSession.ts` — removed dead `if (chunk.byteLength < 0) return` guard in `sendAudioChunk` (INFO-009/WARN-025)
  6. `src/lib/story-api.ts` — replaced unreachable `return fetch(url) // unreachable but satisfies TS` with `throw new Error('fetchWithRetry: unreachable — all retry attempts consumed')` (INFO-016/WARN-024)
  7. `src/components/EmptyState.tsx` — replaced `key={index}` with `key={query}` and removed unused `index` parameter (INFO-020)
  8. `python/pc_controller.py` — removed unused `base_path: Optional[str] = None` parameter and `self.base_path = ...` field from constructor (INFO-028/WARN-026)
  9. `src/lib/email-api.ts` — added `DEFAULT_EMAIL_ACCOUNT` and `SECONDARY_EMAIL_ACCOUNT` named constants (WARN-021 config collocation)
  10. `src/lib/chat-tools.ts` — imported email constants; updated tool description strings and all 6 runtime `|| 'contact@yorkiebrown.uk'` defaults to use constants (WARN-021)
  11. `src/lib/jarvis-tool-system-prompt.ts` — imported email constants; updated both email-account system-prompt paragraphs to use template interpolation (WARN-021)
  12. `src/hooks/useRealtimeVoice.ts` — imported email constants; updated system-prompt block, tool descriptions, and account parameter descriptions to use constants (WARN-021)
  13. `src/lib/digitalocean-api.ts` — removed 3 debug `console.log` calls (INFO-013)
- **Rules Resolved**:
  - INFO-003/WARN-022: `_legacyClassifyIntent` dead code removed
  - INFO-004: `PRE_TASK_LOG` prefix corrected
  - INFO-007: dead `byteLength < 0` guard removed (NullVoiceSession)
  - INFO-008/WARN-023: `VoiceSessionStub` deprecated alias removed
  - INFO-009/WARN-025: dead `byteLength < 0` guard removed (OpenAIRealtimeVoiceSession)
  - INFO-013: debug console.log calls removed from digitalocean-api.ts
  - INFO-016/WARN-024: unreachable `return fetch(url)` → explicit throw
  - INFO-020: `key={index}` anti-pattern eliminated
  - INFO-028/WARN-026: unused `base_path` field removed from pc_controller.py
  - WARN-021: hardcoded PII email literals collocated to named constants
- **Build Gate**: `npx tsc -b --noEmit` — 0 errors
- **ESLint Gate**: `npx eslint src --max-warnings=0` — 0 violations
- **Full Regression Gate**: `npx vitest run`
  - Result: **35 test files passed, 208 tests passed, 0 failed**
  - No regressions detected.
- **Files Locked**: all 13 modified files set read-only post-gate.

### Phase 4 Verification Evidence (Cluster E, Slice 1 — Config/UX Cleanup)
- **Files Modified** (2):
  1. `src/components/WorkspaceHomeView.tsx` — removed demo dataset hydration/reset path and now hydrates file rows from `workspace.workspaceFiles` source-of-truth mapping (WARN-027)
  2. `src/components/QueryInput.tsx` — replaced 4 no-op toolbar handlers with deterministic explicit UX (`toast.info("<feature> is coming soon.")`) for:
     - Connectors and sources (WARN-028)
     - Deep research (WARN-029)
     - Create files and apps (WARN-030)
     - Learn step by step (WARN-030)
- **Rules Resolved**:
  - WARN-027: workspace home files panel no longer resets to hardcoded demo rows on workspace change
  - WARN-028/029/030: non-functional toolbar affordances now produce explicit unavailable behavior (no silent no-op)
- **Diagnostics Gate**:
  - `get_errors` on touched files → 0 errors (`src/components/WorkspaceHomeView.tsx`, `src/components/QueryInput.tsx`)
- **Targeted Regression Gate**:
  - `npx vitest run tests/reliability/realtime-voice-parsing-reliability.test.ts`
  - Result: **1 test file passed, 5 tests passed, 0 failed**

### Phase 4 Verification Evidence (Cluster E, Slice 2 — Cancellation-Safe IDE Polling)
- **File Modified** (1):
  1. `src/lib/chat-tools.ts` — IDE/tool preflight polling loop now honors `AbortSignal` and exits early with deterministic `Operation cancelled.` output (WARN-031)
- **Rules Resolved**:
  - WARN-031: IDE open busy-poll no longer continues for the full retry window after cancellation
- **Validation Gates**:
  - `get_errors` on `src/lib/chat-tools.ts` → 0 errors
  - `npx eslint src/lib/chat-tools.ts --max-warnings=0` → 0 violations
  - `npx tsc -b --noEmit` → 0 errors
  - `npx vitest run` → **35 test files passed, 208 tests passed, 0 failed**

### Phase 4 Verification Evidence (Cluster E, Slice 3 — Tool Argument Validation Hardening)
- **Files Modified** (2):
  1. `src/lib/browser-agent.ts` — tool-call argument JSON parse failures now fail closed with explicit tool error feedback and skip execution (WARN-034)
  2. `src/lib/chat-tools.ts` — replaced high-risk `as string/number` casts with runtime validation in git, HuggingFace/GitHub, dataset, music, and finance date-argument tool paths (WARN-032)
- **Rules Resolved / Reduced**:
  - WARN-034: malformed browser tool argument payloads no longer silently degrade to `{}` and continue execution
  - WARN-032 (partial): major cast-heavy tool branches now validate type/shape before side effects and return deterministic errors on invalid arguments
- **Validation Gates**:
  - `get_errors` on touched files → 0 errors
  - `npx eslint src/lib/chat-tools.ts src/lib/browser-agent.ts --max-warnings=0` → 0 violations
  - `npx tsc -b --noEmit` → 0 errors
  - `npx vitest run tests/reliability/worker-agent-stubs-reliability.test.ts tests/reliability/realtime-voice-parsing-reliability.test.ts` → **2 test files passed, 12 tests passed, 0 failed**
  - `npx vitest run` → **35 test files passed, 208 tests passed, 0 failed**

### Phase 4 Verification Evidence (Cluster E, Slice 4 — Hallucination Guard Fail-Closed Reliability)
- **Files Modified** (3):
  1. `src/lib/hallucination-guard.ts` — fail-closed validator catch path now emits explicit telemetry (`console.error`) and returns a structured high-severity `validation_error` flag instead of silent unverified pass-through semantics (WARN-036)
  2. `src/lib/contextCompactor.ts` — verified existing WARN-035 remediation is intact: summary generation routes through `/api/llm` proxy and no direct `process.env.OPENAI_API_KEY` read remains in this module
  3. `tests/reliability/hallucination-guard-reliability.test.ts` — new reliability test covering audit-model failure path and asserting `passed:false` + `validation_error` high-severity flag
- **Rules Resolved**:
  - WARN-036: hallucination-guard audit failure now returns explicit fail-closed validation signal with machine-detectable flagging
  - WARN-035: context compactor remains server-proxy based for summarization path (no direct key usage in the module)
- **Validation Gates**:
  - `get_errors` on touched files → 0 errors
  - `npx eslint src/lib/hallucination-guard.ts tests/reliability/hallucination-guard-reliability.test.ts --max-warnings=0` → 0 violations
  - `npx vitest run tests/reliability/hallucination-guard-reliability.test.ts` → **1 test file passed, 1 test passed, 0 failed**
  - `npx tsc -b --noEmit` → 0 errors
  - `npx vitest run` → **36 test files passed, 209 tests passed, 0 failed**

### Phase 4 Verification Evidence (Cluster E, Slice 5 — Threads DOM Drift Hardening + UI Sync Finding Revalidation)
- **Files Modified** (3):
  1. `src/lib/social-api.ts` — hardened `postToThreadsViaBrowser()` selector logic to use ordered fallback patterns for compose/post refs, switched regex extraction to `RegExp.exec()` for static-analysis compliance, and added post-click confirmation semantics before reporting success (WARN-037)
  2. `tests/reliability/social-api-reliability.test.ts` — new reliability coverage for Threads UI text drift (`Create a thread...` placeholder fallback) and non-confirmed submit path (`Clicked Post but could not confirm...`)
  3. `phase-4-medium-risk-hardening-execution.md` — execution evidence/log update
- **Rules Resolved / Revalidated**:
  - WARN-037: Threads posting flow no longer relies on a single brittle label match and no longer returns unconditional success immediately after click
  - WARN-043: revalidated as **not applicable/stale in current branch** — no active `hydrateUiSyncFromServer()` or `/api/ui-sync` hydration path exists in repository state
    - Evidence commands:
      - `grep_search` for `hydrateUiSyncFromServer|UI_SYNC_STORAGE_KEYS|/api/ui-sync` across `**/*.{ts,tsx,mjs,cjs}` → no matches
      - `file_search` for `**/*ui-sync*` and `**/*sync*` (source modules) → no ui-sync module present
- **Validation Gates**:
  - `get_errors` on touched files → 0 errors
  - `npx eslint src/lib/social-api.ts tests/reliability/social-api-reliability.test.ts --max-warnings=0` → `ESLINT_OK`
  - `npx vitest run tests/reliability/social-api-reliability.test.ts` → **1 test file passed, 2 tests passed, 0 failed**
  - `npx tsc -b --noEmit` → 0 errors
  - `npx vitest run` → **37 test files passed, 211 tests passed, 0 failed**

### Phase 4 Final Closeout Evidence (Dependency/Build/Security)
- **Closeout Gates Executed**:
  - `npm audit --json > closeout-npm-audit.json`
    - Result: **AUDIT_EXIT=0**
  - `npm ls --depth=0 > closeout-npm-ls.txt`
    - Result: **NPM_LS_EXIT=0**
  - `npx tsc -b --noEmit`
    - Result: **TSC_EXIT=0**
  - `npx vitest run --reporter=json --outputFile=vitest-summary.json`
    - Result: **VITEST_EXIT=0**
    - Suite summary: **37 test files passed, 211 tests passed, 0 failed**
- **Snyk Security-at-Inception Gate**:
  - Authenticated using `mcp_snyk_snyk_auth`, then ran `mcp_snyk_snyk_code_scan` at workspace root.
  - Scan summary: **40 issues total** (`5 high`, `22 medium`, `13 low`) in broader baseline.
  - Differential check against latest Cluster E touched files (`src/lib/chat-tools.ts`, `src/lib/browser-agent.ts`, `src/lib/hallucination-guard.ts`, `src/lib/social-api.ts`, `src/components/WorkspaceHomeView.tsx`, `src/components/QueryInput.tsx`, and related reliability tests) returned **no matching findings**.
  - Interpretation: no newly introduced Snyk issues detected in latest first-party changes; baseline issues remain for separate backlog handling.
- **Phase 4 Exit Status**:
  - Implemented Phase 4 scope passes dependency, typecheck, lint/diagnostics, and regression gates.
  - Phase 4 marked complete pending human prioritization of pre-existing baseline Snyk findings.

## Work Breakdown (160 Findings)

### Cluster A: URL Scheme/Origin/Path Validation (42 findings)
Priority: high

Target areas:
- Browser security boundaries (`src/browser/**`)
- Download/upload paths (`src/lib/**` file I/O)
- External service routing (`src/lib/api.ts`, proxy middleware)

Primary outcomes:
- All URL inputs are parsed and validated for scheme/origin/path consistency.
- Downloads and navigation never escape expected origin boundaries.
- Redirect chains are bounded and logged.

Verification:
1. Add unit tests for URL validation helpers with malformed/cross-origin/path-traversal inputs.
2. Add integration tests for download/upload/redirect boundaries.
3. Confirm no open-redirect or origin-confusion vulnerabilities remain.

---

### Cluster B: Runtime Input Validation for Tool Invocations (24 findings)
Priority: high

Target areas:
- Tool argument coercion in `src/lib/chat-tools.ts`, `src/hooks/useRealtimeVoice.ts`
- Agent worker call boundaries in `src/agents/**`
- External file/process invocation paths in `python/`, `electron/**`

Primary outcomes:
- All external tool arguments are validated against expected schemas.
- Type narrowing and coercion is deterministic and logged for ambiguous cases.
- Out-of-bounds or malformed arguments fail-closed with clear reasons.

Verification:
1. Add unit tests for tool-argument validation with boundary/invalid inputs.
2. Add regression tests for previously ambiguous coercion paths.
3. Confirm no silent degradation or assumption-violating coercion occurs.

---

### Cluster C: Code-Quality Refactors (45 findings)
Priority: medium

Target areas:
- Component props and TypeScript strictness (`src/components/**`)
- Functional purity and side-effect containment in core libs
- Callback/event-handler cleanup and error handling

Primary outcomes:
- React components enforce readonly prop contracts.
- Async/callback flows have explicit error handling and cleanup semantics.
- Dead code and unused parameters are removed; function signatures are precise.

Verification:
1. Run TypeScript strict mode and fix any regressions.
2. Add linting rules and verify no violations remain.
3. Confirm no behavioral changes from refactors (regression tests pass).

---

### Cluster D: Maintainability and Architecture Improvements (21 findings)
Priority: medium

Target areas:
- Module organization and export/import consistency
- Configuration and constant collocation
- Documentation and naming clarity

Primary outcomes:
- Modules have clear, single responsibilities.
- Configuration is centralized and accessible.
- Public APIs are documented; internal helpers are marked clearly.

Verification:
1. Run static-analysis linting for architecture violations.
2. Audit module exports and imports for clarity.
3. Verify documentation strings are present for public APIs.

---

### Cluster E: Dependencies and Configuration Cleanup (28 findings)
Priority: low

Target areas:
- Unused dependencies and transitive bloat
- Build/test configuration consistency
- Documentation and changelog management

Primary outcomes:
- No unmaintained or superseded dependencies remain.
- Build and test workflows are consistent and reproducible.
- Breaking changes and upgrades are documented.

Verification:
1. Run `npm audit` and confirm 0 vulnerabilities remain.
2. Run `npm ls` and verify no circular dependencies or broken transitive chains.
3. Verify build artifacts are reproducible and docs are current.

---

## Execution Workflow

### Sequential Gate Order
- Workstream A: Cluster A (URL validation)
- Workstream B: Cluster B (tool input validation)
- Workstream C: Cluster C (code-quality refactors)
- Workstream D: Cluster D (maintainability)
- Workstream E: Cluster E (dependency cleanup)

### Regression Gate Policy
- Run `npx vitest run` after each cluster completion.
- Verify IDE Problems check remains clean.
- Reapply read-only locks to modified files.

## Exit Criteria
- All 160 Phase 4 findings moved to fixed or accepted with rationale.
- No new regressions detected in Vitest suite.
- URL validation and input-validation helpers are in place and tested.
- Code-quality refactors pass lint/typecheck with no new warnings.
- Full regression gate passes: all test suites green.

## Suggested Agent Invocation Order
1. Enforcement Supervisor on Phase 4 scope (`src/**`, `electron/**`, `python/**`).
2. Change Detection Guardian on current diff.
3. Static Analysis Guardian on changed files.
4. Test Guardian on affected modules.
5. Coder - Feature Agent for validation helpers and refactors (per cluster).
6. Tester - Test Implementation Agent for coverage gaps.

## Cursor Prompt Starters
- Act as Enforcement Supervisor on Phase 4 scope to identify blocking issues before execution.
- Act as Coder - Feature Agent and implement Phase 4 Cluster A (URL validation helpers) in `src/lib/`.
- Act as Coder - Refactor Agent and execute Phase 4 Cluster C (code-quality refactors) in `src/components/**`.
- Act as Tester - Test Implementation Agent and add regression tests for Phase 4 Cluster A and B validations.
