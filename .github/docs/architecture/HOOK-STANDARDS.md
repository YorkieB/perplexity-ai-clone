# Hook Standards

Hooks encapsulate reusable stateful logic. This guide defines how hooks must be designed, documented, and validated.

---

## 1. Naming & Location
- Hooks live in `src/hooks/` and are named `useSomething`.
- Each hook exports its contract via a TypeScript interface or type.

---

## 2. Required Contract
```ts
export type UseThingReturn = {
  state: StateType;
  action: () => Promise<void>;
  metadata: {
    loading: boolean;
    error?: string;
  };
};

export function useThing(deps: UseThingDeps): UseThingReturn {
  // ...
}
```
- Return objects must be stable (memoized or referentially consistent when appropriate).
- Errors must be surfaced explicitly.

---

## 3. Dependency Rules
- Hooks may import other hooks, services, utils, and types.
- Hooks must not import components or pages.
- Side-effects must be declared inside `useEffect`/`useLayoutEffect`.

---

## 4. State Management
- All state transitions must be explicit and typed.
- Derived values should use `useMemo` when computation is non-trivial.
- Event handlers must be wrapped in `useCallback` when passed to children.

---

## 5. Error & Loading Handling
- Hooks must expose loading/error metadata when performing asynchronous work.
- Never swallow errors; propagate or return structured error information.

---

## 6. Testing
- Tests live in `tests/hooks/`.
- Cover initial state, success, failure, edge cases, and cleanup behavior.
- Use React Testing Library hooks utilities or Vitest + custom renderers.

---

## 7. Documentation
- File header must describe purpose, inputs, outputs, and invariants.
- Chain-of-thought comments explain non-obvious branching or caching decisions.

---

## 8. Enforcement
- `WORKFLOW-LOGIC-COMPLETENESS` validates state/handler completeness.
- `WORKFLOW-PORT-INTEGRITY` ensures return contracts stay stable.
- `WORKFLOW-DUPLICATE-CODE-SCANNER` prevents repeated logic across hooks.

---

## 9. Summary
Hooks are the glue between services and components. Keep their contracts explicit, typed, well-documented, and fully tested.
