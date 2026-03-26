import { useContext } from 'react'
import { CodeEditorContext } from './CodeEditorContext'
import type { CodeEditorControl } from './CodeEditorContext'

export function useCodeEditorRegister() {
  const { register, unregister } = useContext(CodeEditorContext)
  return { register, unregister }
}

export function useCodeEditor(): CodeEditorControl | null {
  const { control } = useContext(CodeEditorContext)
  return control
}

export function useCodeEditorItems() {
  const { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId } = useContext(CodeEditorContext)
  return { items, addItem, removeItem, updateItem, activeItemId, setActiveItemId }
}

export function useCodeEditorRunning() {
  const { running, setRunning, runResult, setRunResult } = useContext(CodeEditorContext)
  return { running, setRunning, runResult, setRunResult }
}
