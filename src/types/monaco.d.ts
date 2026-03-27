/**
 * Minimal stubs for `monaco-editor` so `tsc` passes without the full package types.
 * Runtime comes from `@monaco-editor/react` + bundled Monaco. Replace with official
 * typings when `@types/monaco-editor` or package `types` field is wired.
 */

declare module 'monaco-editor' {
  /** @internal Intentionally loose — refine when adopting real Monaco types. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub module
  type MonacoStub = any

  export type IRange = MonacoStub
  export type IPosition = MonacoStub

  export namespace editor {
    export type IStandaloneCodeEditor = MonacoStub
    export type IStandaloneEditorConstructionOptions = MonacoStub
    export type IEditorOptions = MonacoStub
    export type IModelContentChangedEvent = MonacoStub
  }
}
