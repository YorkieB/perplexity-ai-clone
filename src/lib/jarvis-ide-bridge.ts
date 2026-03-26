/**
 * Native file system + shell for Jarvis IDE (Electron) with browser fallbacks (File System Access API / downloads).
 */

import type { JarvisIdeRunCommandResult } from '@/types/jarvis-ide'

function hasElectron(): boolean {
  return globalThis.window !== undefined && (globalThis as unknown as { jarvisIde?: unknown }).jarvisIde !== undefined
}

export async function ideAppRoot(): Promise<string | null> {
  if (!hasElectron()) return null
  try {
    return await (globalThis as unknown as { jarvisIde: { appRoot(): Promise<string> } }).jarvisIde.appRoot()
  } catch {
    return null
  }
}

function ide(): import('@/types/jarvis-ide').JarvisIdeApi {
  return (globalThis as unknown as { jarvisIde: import('@/types/jarvis-ide').JarvisIdeApi }).jarvisIde
}

export async function ideOpenFilesFromDisk(): Promise<Array<{ path: string; name: string; content: string }>> {
  if (hasElectron()) {
    const rows = await ide().openFiles()
    return rows
      .filter((r) => r.content != null && !r.error)
      .map((r) => ({ path: r.path, name: r.name, content: r.content! }))
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '*/*'
    input.onchange = () => {
      const files = input.files
      if (!files?.length) {
        resolve([])
        return
      }
      const out: Array<{ path: string; name: string; content: string }> = []
      let pending = files.length
      for (const f of Array.from(files)) {
        void f.text().then((text) => {
          out.push({ path: f.name, name: f.name, content: text })
          pending -= 1
          if (pending === 0) resolve(out)
        }).catch(() => {
          pending -= 1
          if (pending === 0) resolve(out)
        })
      }
    }
    input.click()
  })
}

export async function ideOpenFolderFromDisk(): Promise<string | null> {
  if (hasElectron()) {
    return ide().openFolder()
  }
  const w = globalThis as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
  if (typeof w.showDirectoryPicker === 'function') {
    try {
      const dir = await w.showDirectoryPicker()
      return dir.name
    } catch {
      return null
    }
  }
  return null
}

export async function ideSaveFileDialog(content: string, defaultPath?: string): Promise<string | null> {
  if (hasElectron()) {
    return ide().saveFile({ content, defaultPath })
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = defaultPath?.split(/[/\\]/).pop() || 'untitled.txt'
  a.click()
  URL.revokeObjectURL(a.href)
  return a.download
}

export async function ideWalkFiles(rootPath: string): Promise<string[]> {
  if (hasElectron()) {
    return ide().walkFiles(rootPath)
  }
  return []
}

export async function ideFsRead(filePath: string): Promise<{ ok: boolean; content?: string; error?: string }> {
  if (hasElectron()) {
    return ide().fsRead(filePath)
  }
  return { ok: false, error: 'Filesystem read requires the desktop app.' }
}

export async function ideFsWrite(filePath: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (hasElectron()) {
    return ide().fsWrite({ filePath, content })
  }
  return { ok: false, error: 'Filesystem write requires the desktop app.' }
}

export async function ideFsDelete(filePath: string): Promise<{ ok: boolean; error?: string }> {
  if (hasElectron()) {
    return ide().fsDelete(filePath)
  }
  return { ok: false, error: 'Delete requires the desktop app.' }
}

export async function ideFsMkdir(dirPath: string): Promise<{ ok: boolean; error?: string }> {
  if (hasElectron()) {
    return ide().fsMkdir(dirPath)
  }
  return { ok: false, error: 'Create folder requires the desktop app.' }
}

export async function ideShellOpenPath(p: string): Promise<void> {
  if (hasElectron()) {
    await ide().shellOpenPath(p)
  }
}

export async function ideOpenExternal(url: string): Promise<boolean> {
  if (hasElectron()) {
    return ide().openExternal(url)
  }
  globalThis.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export async function ideNewWindow(): Promise<void> {
  if (hasElectron()) {
    await ide().newWindow()
  } else {
    globalThis.open(globalThis.location.href, '_blank', 'noopener,noreferrer')
  }
}

export async function ideQuit(): Promise<void> {
  if (hasElectron()) {
    await ide().quit()
  }
}

export async function ideToggleFullscreen(): Promise<boolean> {
  if (hasElectron()) {
    return ide().toggleFullscreen()
  }
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen()
    return true
  }
  await document.exitFullscreen()
  return false
}

export async function ideGit(cwd: string, args: string[]) {
  if (hasElectron()) {
    return ide().git({ cwd, args })
  }
  return { ok: false, stdout: '', stderr: '', error: 'Git requires the desktop app.' }
}

export async function ideRunCommand(cwd: string, command: string): Promise<JarvisIdeRunCommandResult> {
  if (!hasElectron()) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: 'Shell commands require the desktop app.',
    }
  }
  return ide().runCommand({ cwd, command })
}

export function ideJoinPath(root: string, ...parts: string[]): string {
  const sep = root.includes('\\') ? '\\' : '/'
  const clean = (s: string) => s.replaceAll(/^[\\/]+|[\\/]+$/g, '')
  return [clean(root), ...parts.map(clean)].filter(Boolean).join(sep)
}
