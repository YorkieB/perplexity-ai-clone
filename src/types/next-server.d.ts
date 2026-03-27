/**
 * Minimal `next/server` surface for optional Next.js App Router handlers in this Vite repo.
 * When deployed behind Next.js, replace with real `next` types via dependency install.
 */
declare module 'next/server' {
  export interface NextRequest extends Request {
    readonly nextUrl: URL
  }
}
