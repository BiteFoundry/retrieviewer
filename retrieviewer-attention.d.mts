export interface AttentionSnapshot {
 source: string;
 scope: string;
 /** label is a bounded local display name, never remote model input. */
 items: {id: string; generation: string; turnId: number | null; requestId?: string; kind: 'approval' | 'input'; label?: string}[];
}
export interface AttentionStatus {
 state: 'connecting' | 'connected' | 'unavailable' | 'paused' | 'stale' | 'off';
 pendingCount: number;
 target: {seatId: string; label: string; kind: 'approval' | 'input'} | null;
 retainedNotices: number;
 inFlight: boolean;
 judging?: boolean;
 lastJudgment?: 'rule_first' | 'model_notify' | 'rule_override' | 'rule_fallback' | null;
}
export function validateAttentionSnapshot(value: unknown): AttentionSnapshot;
/** Host owns tick/lifetime. Import and construction start no timers or I/O. */
export function createAttentionMonitor(options: {
 readSnapshot: (options: {signal: AbortSignal}) => Promise<AttentionSnapshot>;
 onNotice: (notice: {kind: 'approval' | 'input'; side: 'left'}) => boolean;
 onClear?: () => void;
 onChange?: (status: AttentionStatus) => void;
 /** Anonymous metadata only. Runs after the immediate rule alert, never delays or suppresses it. */
 judgeNotice?: (input: {kind: 'approval' | 'input'; pendingCount: number; signal: AbortSignal}) => Promise<{decision: 'notify' | 'ignore' | 'uncertain'}>;
 judgeTimeoutMs?: number;
 now?: () => number;
 intervalMs?: number;
 staleMs?: number;
 noticeCooldownMs?: number;
}): {
 tick(options?: {active?: boolean}): void;
 readonly status: AttentionStatus;
 settled(): Promise<void>;
 dispose(): void;
};
