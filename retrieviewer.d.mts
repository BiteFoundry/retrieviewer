/** A headless pet: the host owns input, time and terminal rendering. */
export interface PetOptions {
  /** Asset names are relative; return original file bytes (keep .gz files compressed). */
  loadAsset?: (name: string) => Promise<ArrayBuffer | ArrayBufferView>;
  seed?: number;
  energy?: number;
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
  [key: string]: unknown;
}
export interface LifeReport {
  /** Last selected autonomous episode; null before the first decision. */
  episode: string | null;
  intent: string;
  label: string;
  interaction: 'ball' | 'treat' | null;
  busy: boolean;
  energy: number;
  decisions: number;
  cooldowns: {ball: number; treat: number};
  gesture: {clip: string; progress: number} | null;
  ball: {x: number; z: number; height: number; carried: boolean} | null;
  treat: {x: number; z: number; height: number} | null;
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
  /** False when busy or cooling down. */
  interact(kind: 'ball' | 'treat'): boolean;
  readonly disposed: boolean;
  dispose(): void;
}
export function createPet(options?: PetOptions): Promise<Pet>;
export function defaultLoadAsset(name: string): Promise<ArrayBuffer | Uint8Array>;
export const STEP_SECONDS: number;
export const MAX_CATCH_UP_SECONDS: number;
export const INTERACTIONS: readonly ['ball', 'treat'];
export const ART_PROFILES: readonly ['original', 'q5'];
export const DEFAULT_ART_PROFILE: 'q5';
export function getPetAssetFiles(artProfile?: 'original' | 'q5'): readonly string[];
export const PET_ASSETS: Readonly<Record<string, string>>;
