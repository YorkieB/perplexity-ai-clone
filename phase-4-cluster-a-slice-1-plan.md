# Phase 4 Cluster A: URL Validation — Slice 1 Plan

## Objective
Establish reusable URL validation framework with comprehensive test coverage.

## Slice 1 Scope
Create the foundational URL validation helper module and test suite.

### Deliverables

#### 1. Create `src/lib/url-validation.ts`
**Purpose**: Centralized URL parsing, scheme/origin/path validation

**Exports**:
- `isValidUrl(url: unknown): boolean` — basic URL parsing validation
- `isSafeScheme(scheme: string): boolean` — only allow `http:` and `https:`
- `isOriginAllowed(origin: string, allowedOrigins: string[]): boolean` — whitelist checking
- `parseUrlSafely(url: string): { scheme: string; origin: string; pathname: string; search: string } | null` — structured parsing with null fallback
- `isPathTraversalAttempt(pathname: string): boolean` — detect `..` and encoded variants
- `sanitizeRedirectUrl(url: unknown, allowedOrigins: string[]): string | null` — redirect safety gate
- `validateFileDownloadPath(downloadPath: string, allowedDirs: string[]): boolean` — download sandbox check

#### 2. Create `tests/validation/url-validation.test.ts`
**Purpose**: Comprehensive validation boundary testing

**Test Categories** (15-20 tests):
- Valid URLs (http/https with various TLDs, ports, paths)
- Invalid URLs (malformed, missing components)
- Scheme validation (reject ftp://, file://, javascript:, data:)
- Origin validation (whitelist enforcement, subdomain handling)
- Path traversal attempts (../../../, %2e%2e%2f, URL-encoded variants)
- Redirect safety (external URLs, same-origin, allowed list)
- Download path validation (relative vs absolute, sandbox escape attempts)
- Edge cases (empty strings, null/undefined, oversized URLs)

#### 3. Update `phase-4-medium-risk-hardening-execution.md`
Add Cluster A execution log entry for Slice 1.

## Implementation Steps

### Step 1: Create URL validation helpers
- Parse and validate URL components safely
- Return structured results with fallback null on parse failure
- No exceptions thrown; all parse errors handled gracefully

### Step 2: Add comprehensive test suite
- Positive cases: well-formed URLs, various schemes, ports, paths
- Negative cases: malformed URLs, dangerous schemes, path traversal
- Boundary cases: oversized, empty, special characters

### Step 3: Verify diagnostics-clean
- Run `npx get_errors` on new files
- Confirm no TypeScript or lint issues

### Step 4: Run initial test gate
- `npx vitest run tests/validation/url-validation.test.ts`
- Confirm all new tests pass
- No regressions in existing suites

### Step 5: Document usage patterns
- Add code comments to each exported function
- Include examples in JSDoc

## Expected Outcomes
- ✅ Reusable URL validation helpers in place
- ✅ 15-20 validation tests passing
- ✅ Zero new regressions
- ✅ Foundation for Clusters A Slices 2-5 (application of helpers across codebase)

## Next Steps (After Slice 1 Acceptance)
- Slice 2: Apply URL validators to `src/lib/browser-agent.ts` and browser navigation paths
- Slice 3: Apply URL validators to file download/upload paths
- Slice 4: Apply URL validators to API routing and proxy middleware
- Slice 5: Apply URL validators to dynamic redirect and link-opening paths
