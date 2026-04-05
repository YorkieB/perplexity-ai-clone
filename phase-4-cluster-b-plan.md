# Phase 4 Cluster B: Tool Input Validation — Plan

## Objective
Harden runtime tool argument validation to ensure all tool invocations fail closed on malformed or unsafe input.

## Scope
- Runtime tool dispatch and argument parsing in [src/hooks/useRealtimeVoice.ts](src/hooks/useRealtimeVoice.ts)
- Tool execution pipeline in [src/lib/chat-tools.ts](src/lib/chat-tools.ts)
- Desktop automation bridge inputs in [src/lib/desktop-automation-tool-runner.ts](src/lib/desktop-automation-tool-runner.ts)
- Validation utility reuse in [src/lib/url-validation.ts](src/lib/url-validation.ts)

## Slice Plan

### Slice 1: Argument shape guards for high-risk tools
- Add strict object/field guards for browser navigation, command execution, URL-bearing tools.
- Ensure malformed payloads never call side-effectful code.
- Add targeted reliability tests for parse/decode failures.

### Slice 2: String/number coercion and bounds enforcement
- Normalize numeric fields with explicit bounds checks.
- Reject oversized payloads and invalid enum values.
- Add tests for boundary and overflow cases.

### Slice 3: Fail-closed telemetry consistency
- Standardize warning/error telemetry for validation failures.
- Ensure degraded-path outputs are deterministic for voice and chat tool flows.
- Add tests asserting fallback output shape.

### Slice 4: Desktop automation tool input contract hardening
- Tighten cwd/command/payload checks before privileged automation paths.
- Reuse existing security validators where possible.
- Add security tests confirming no process/spawn calls on invalid input.

## Verification Gates
- Targeted tests per slice via `npx vitest run tests/reliability/ tests/security/`
- Full regression gate after Cluster B completion:
  - `npx vitest run --reporter=json --outputFile=vitest-summary.json`
- Diagnostics gate on all touched files.

## Success Criteria
- No malformed tool payload can trigger privileged side effects.
- All new validation paths are covered by negative and boundary tests.
- Full suite remains green with zero regressions.
