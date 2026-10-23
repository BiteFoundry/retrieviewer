import type {FrameOptions, PetFrame, PetOptions} from './retrieviewer.mjs';

/** The host owns size and output; the plugin never touches DOM, stdio or signals. */
export interface PetPluginHost {
  /** Called before every frame. Null or a zero-size pane means hidden: no render, no time. */
  getSize(): FrameOptions | null;
  /** `frame.pixels` is borrowed; copy anything kept past this call. */
  render(frame: PetFrame): void;
  /** Called once by dispose(). */
  clear?(): void;
  /** Errors from scheduled frames. The plugin is already paused (not disposed). */
  onError?(error: unknown): void;
}
export interface PetPluginScheduler {
  /** Milliseconds, monotonic. */
  now(): number;
  /** Must call back later, never synchronously. */
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}
export interface PetPluginOptions {
  host: PetPluginHost;
  petOptions?: PetOptions;
  /** Scheduled frame rate, default 30. */
  fps?: number;
  /** Default: performance.now() with setTimeout/clearTimeout, used only after start(). */
  scheduler?: PetPluginScheduler;
}
export interface PetPlugin {
  /** Idempotent. Renders immediately, then once per 1/fps s. */
  start(): void;
  /** Cancels the pending frame; paused time is never caught up. */
  pause(): void;
  /** Renders without advancing time. False while hidden. */
  render(): boolean;
  /** Host-owned loop: advance seconds then render. False while hidden. Throws while running. */
  tick(dtSeconds: number): boolean;
  /** False when busy or cooling down. */
  interact(kind: 'ball' | 'treat' | 'tug'): boolean;
  readonly running: boolean;
  readonly disposed: boolean;
  dispose(): void;
}
export function createPetPlugin(options: PetPluginOptions): Promise<PetPlugin>;
