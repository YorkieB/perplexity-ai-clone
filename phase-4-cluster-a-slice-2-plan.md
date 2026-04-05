# Phase 4 Cluster A: URL Validation — Slice 2 Plan

## Objective
Apply URL validators to browser navigation paths and verify scheme/origin boundaries.

## Slice 2 Scope
Harden browser URL opening and navigation paths with validation framework from Slice 1.

### Deliverables

#### 1. Refactor `src/browser/embed-url-guard.ts`
**Current Issue**: Uses try-catch for URL parsing but limited path validation

**Changes**:
- Import helpers from `url-validation.ts`
- Replace custom logic with `isSafeScheme()`, `parseUrlSafely()`
- Add explicit path-based OAuth denial
- Add test for iframe sandboxing edge cases

#### 2. Harden `src/browser/screen-browser-act.ts`
**Current Issue**: `openUrl()` accepts URL without validation

**Changes**:
- Add URL validation before `JarvisBrowser.openUrl()`
- Use `sanitizeRedirectUrl()` with same-origin fallback
- Log validation failures with structured telemetry
- Add support for home page fallback on invalid URL

#### 3. Harden `src/hooks/useRealtimeVoice.ts` navigate tool
**Current Location**: Line ~2160-2171 (browser navigate tool handler)

**Changes**:
- Import `isSafeScheme()`, `sanitizeRedirectUrl()` 
- Validate `args.url` before calling `bc.navigate()`
- Fall back to safe defaults (e.g., google.com search) on invalid URL
- Emit warning telemetry for rejected URLs

#### 4. Create `tests/validation/url-validation-browser-integration.test.ts`
**Purpose**: Integration testing for browser navigation boundaries

**Test Categories** (12-15 tests):
- Valid web URLs (http/https with various domains)
- Rejected OAuth/token paths
- Rejected dangerous schemes (javascript:, data:, file:)
- Rejected path-traversal and attack vectors
- Same-origin fallback behavior
- Logging and telemetry verification

## Implementation Steps

### Step 1: Update embed-url-guard.ts
- Replace manual URL parsing with validation helpers
- Preserve all existing denial behavior
- Add inline comments for security intent

### Step 2: Update screen-browser-act.ts
- Add URL validation gate before invocation
- Handle validation failures gracefully
- Log rejected URLs with reason

### Step 3: Update useRealtimeVoice.ts navigate handler
- Add pre-invocation URL validation
- Normalize fallback behavior
- Log validation results

### Step 4: Add integration tests
- Test each hardened path with valid/invalid URLs
- Verify fallback semantics
- Verify telemetry emission

### Step 5: Verify diagnostics-clean & test gate
- Run `npx get_errors` on modified files
- Run `npx vitest run tests/validation/`
- Confirm all 39 existing + 12-15 new tests pass

## Expected Outcomes
- ✅ Browser navigation paths use centralized validators
- ✅ All OAuth/malicious URLs rejected before side effects
- ✅ Consistent error handling and fallback semantics
- ✅ Telemetry logged for security-relevant rejections
- ✅ Zero regressions in existing test suite
- ✅ Foundation for Slices 3-5 (file downloads, API routing, redirects)

## Next Steps (After Slice 2 Acceptance)
- Slice 3: File download/upload path validation
- Slice 4: API routing and proxy middleware validation
- Slice 5: Dynamic redirect and link-opening validation
