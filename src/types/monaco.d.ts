/**
 * Minimal stubs for `monaco-editor` so `tsc` passes without the full package types.
 * Runtime comes from `@monaco-editor/react` + bundled Monaco. Replace with official
 * typings when `@types/monaco-editor` or package `types` field is wired.
 */
/* eslint-disable sonarjs/redundant-type-aliases -- intentional: these are public module-augmentation exports required by consumers; `any` stubs are replaced when real Monaco types are adopted */

declare module 'monaco-editor' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub module; refine when adopting real Monaco types
  export type IRange = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
  export type IPosition = any

  export namespace editor {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
    export type IStandaloneCodeEditor = any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
    export type IStandaloneEditorConstructionOptions = any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
    export type IEditorOptions = any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
    export type IModelContentChangedEvent = any
  }
}
