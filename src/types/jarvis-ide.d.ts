export interface JarvisIdeGitResult {
  ok: boolean
  stdout?: string
  stderr?: string
  error?: string
}

export interface JarvisIdeRunCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}

export interface JarvisIdeApi {
  appRoot: () => Promise<string>
  openFiles: () => Promise<Array<{ path: string; name: string; content?: string; error?: string }>>
  openFolder: () => Promise<string | null>
  saveFile: (opts: { defaultPath?: string; content: string }) => Promise<string | null>
  readDir: (dirPath: string) => Promise<Array<{ name: string; isDir: boolean }>>
  walkFiles: (rootPath: string) => Promise<string[]>
  fsRead: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string }>
  fsWrite: (opts: { filePath: string; content: string }) => Promise<{ ok: boolean; error?: string }>
  fsDelete: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  fsMkdir: (dirPath: string) => Promise<{ ok: boolean; error?: string }>
  fsExists: (p: string) => Promise<boolean>
  shellOpenPath: (p: string) => Promise<string>
  openExternal: (url: string) => Promise<boolean>
  newWindow: () => Promise<void>
  quit: () => Promise<void>
  toggleFullscreen: () => Promise<boolean>
  git: (opts: { cwd: string; args: string[] }) => Promise<JarvisIdeGitResult>
  runCommand: (opts: { cwd: string; command: string }) => Promise<JarvisIdeRunCommandResult>
}

declare global {
  interface Window {
    jarvisIde?: JarvisIdeApi
  }
}

export {}
