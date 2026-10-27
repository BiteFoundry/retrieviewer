/** A headless pet: the host owns input, time and terminal rendering. */
export type FetchReturnStyle = 'auto' | 'brake' | 'trot' | 'run-trot';
export interface PetOptions {
  /** Relative names; return unchanged .rvz/.gz file bytes. Custom loaders use memory-backed art. */
  loadAsset?: (name: string) => Promise<ArrayBuffer | ArrayBufferView>;
  seed?: number;
  energy?: number;
  /** Default auto mixes all three existing return styles without adjacent repeats. */
  returnStyle?: FetchReturnStyle;
  /** Keep true for the current paw correction; false selects the legacy comparison. */
  pawTransport?: boolean;
  /** Default q5 (32 levels). Original requires separately supplied original assets. */
  artProfile?: 'original' | 'q5';
}
export interface FrameOptions {
  columns: number;
  rows: number;
  /** Character width / line height. Default .5; measure your terminal font if needed. */
  cellAspect?: number;
  poseFps?: 12 | 24 | 30;
  contactEnabled?: boolean;
  camera?: {
    viewportWidth: number;
    viewportHeight: number;
    rect: {left: number; top: number; width: number; height: number};
  };
}
export interface PetState {
  state: string;
  x: number;
  z: number;
  speed: number;
  view: string;
  flip: boolean;
  seatProgress: number | null;
  behavior: string | null;
  actionName: string | null;
  /** Physical vertical lift during an optional authored recovery bound. */
  bodyLift?: number;
  [key: string]: unknown;
}
export interface LifeReport {
  /** Metadata-triggered visual cue only. No host input or approval authority. */
  attention: {kind: 'approval' | 'input'; side: 'left' | 'right'; gesture: 'paw' | 'wall'; phase: 'queued' | 'approaching' | 'showing'} | null;
  /** Last selected autonomous episode; null before the first decision. */
  episode: string | null;
  intent: string;
  label: string;
  interaction: 'ball' | 'treat' | 'tug' | null;
  busy: boolean;
  energy: number;
  /** Awake-time sleep pressure; ordinary sitting does not erase it. */
  drowsiness: number;
  decisions: number;
  cooldowns: {ball: number; treat: number; tug: number};
  gesture: {clip: string; progress: number} | null;
  ball: {x: number; z: number; height: number; carried: boolean; occluded?: boolean; pickupProgress?: number; spin?: number; speed?: number; phase?: 'flight' | 'roll' | 'rest'; settled?: boolean} | null;
  /** Local deterministic fetch variation; null outside a ball interaction. */
  fetchPattern: 'clean' | 'rolling' | 'miss' | 'tumble' | null;
  /** Ball-carry gait, selected independently of the fetch/roaming random stream. */
  returnStyle: FetchReturnStyle;
  returnMode: Exclude<FetchReturnStyle, 'auto'> | null;
  /** Rare autonomous visitor; absent during direct user interactions. */
  butterfly: {x: number; z: number; height: number; phase: number; opacity: number} | null;
  treat: {x: number; z: number; height: number} | null;
  /** Tug-of-war state while a tug interaction is active. */
  tug: {progress: number; grip: number} | null;
  /** Silent rising sleep cue, normalized cycle progress; no audio process. */
  snore: number | null;
}
export interface PetFrame {
  artProfile: 'original' | 'q5';
  /** Plain Unicode Braille: rows lines of exactly columns cells, no ANSI. */
  text: string;
  columns: number;
  rows: number;
  /** Borrowed RGBA buffer; copy it before retaining across frame() calls. */
  pixels: Uint8ClampedArray;
  state: PetState;
  report: LifeReport;
  mouth: {x: number; y: number; rx: number; ry: number; family: string; frame: number} | null;
  /** Current ball center/radii in raster pixels; occlusion does not delete it. */
  ballScreen: {x: number; y: number; rx: number; ry: number; owner: 'world' | 'mouth' | 'gesture'; occluded: boolean; behind: boolean} | null;
  placement: {x: number; y: number; size: number; pixelAspect: number; depth: number};
  projection: {
    project(x: number, y: number, z: number): {x: number; y: number; depth: number};
    ground(u: number, v: number): {x: number; z: number} | null;
    focalPixels: number;
  };
  contacts: {samples: number; max: number; limited: number; releaseEvents: number; releasedMax: number};
}
export interface Pet {
  /** Seconds. Fixed 60 Hz simulation, at most .1 s catch-up per call. */
  step(dt: number): number;
  frame(options: FrameOptions): PetFrame;
  /** Conservative pre-render check for held poses. Simulation still needs step(). */
  needsFrame(options: FrameOptions): boolean;
  /** False when busy or cooling down. */
  interact(kind: 'ball' | 'treat' | 'tug'): boolean;
  /** False during direct play/feeding or another cue. Does not operate the host. */
  notify(notice: {kind: 'approval' | 'input'; side?: 'left' | 'right'; gesture?: 'auto' | 'paw' | 'wall'}): boolean;
  /** Cancel the cue, preserving any in-progress connected pose recovery. */
  clearNotice(): void;
  /** Sets the next throw's return style. Does not interrupt a fetch in progress. */
  setReturnStyle(style: FetchReturnStyle): FetchReturnStyle;
  readonly disposed: boolean;
  dispose(): void;
}
export function createPet(options?: PetOptions): Promise<Pet>;
export function defaultLoadAsset(name: string): Promise<ArrayBuffer | Uint8Array>;
export const STEP_SECONDS: number;
export const MAX_CATCH_UP_SECONDS: number;
export const INTERACTIONS: readonly ['ball', 'treat', 'tug'];
export const ART_PROFILES: readonly ['original', 'q5'];
export const DEFAULT_ART_PROFILE: 'q5';
export function getPetAssetFiles(artProfile?: 'original' | 'q5'): readonly string[];
export const PET_ASSETS: Readonly<Record<string, string>>;
