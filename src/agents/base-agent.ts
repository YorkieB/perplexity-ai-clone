/**
 * Minimal contract for Jarvis sub-agents (screen, future plugins).
 * Kept intentionally small — domain agents extend this in their own modules.
 */
export abstract class BaseAgent {
  /** Stable id for orchestration / telemetry (e.g. `jarvis-screen-agent`). */
  abstract readonly id: string

  protected constructor() {
    /* subclasses call super() */
  }
}
