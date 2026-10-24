export const OPENROUTER_MODEL: 'deepseek/deepseek-v4.1-flash-1017';
export type BrainDecision = 'notify' | 'ignore' | 'uncertain';
export interface BrainObservation {kind: 'approval' | 'input' | 'none'; pendingCount: number; signal?: AbortSignal;}
export interface BrainStatus {
 provider: 'openrouter'; model: typeof OPENROUTER_MODEL;
 state: 'ready' | 'requesting' | 'fallback' | 'off';
 calls: number; cacheHits: number; dailyUsed: number; dailyLimit: number;
 cacheEntries: number; inFlight: boolean; lastLatencyMs: number | null;
 lastError: string | null; lastDecision: BrainDecision | null;
}
export class BrainError extends Error {readonly code: string; constructor(code: string);}
export function anonymousBrainState(input: BrainObservation): {event: 'pending_input' | 'no_pending_input'; kind: BrainObservation['kind']; pending_count: number};
export function parseBrainDecision(value: unknown): BrainDecision;
/** Node/server only. Never put an API key in browser code or saved settings. */
export function createOpenRouterBrain(options?: {
 apiKey?: string; fetch?: typeof fetch; now?: () => number; day?: () => string;
 timeoutMs?: number; maxRequestsPerDay?: number; cacheMs?: number;
}): {
 decide(input: BrainObservation): Promise<{decision: BrainDecision; via: 'llm' | 'cache'; latencyMs: number}>;
 readonly status: BrainStatus;
 dispose(): void;
};
