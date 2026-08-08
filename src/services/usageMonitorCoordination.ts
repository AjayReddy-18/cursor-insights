import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { UsageEvent } from '../api/types';
import { usageEventId } from '../api/usageEvents';
import { log, logError } from '../logger';

/** How long a leader lease remains valid without a heartbeat. */
export const LEADER_LEASE_TTL_MS = 150_000;

/** Abandoned UI claims on a pending alert can be retaken after this. */
export const PENDING_ALERT_CLAIM_TTL_MS = 60_000;

const LEADER_FILE = 'usage-monitor-leader.json';
const STATE_FILE = 'usage-monitor-state.json';
const LOCK_DIR = 'usage-monitor.lock';

export type PendingAlert = {
	eventId: string;
	event: UsageEvent;
	threshold: number;
	createdAt: number;
	claimedBy?: string;
	claimedAt?: number;
};

export type SharedAlertState = {
	lastProcessedId?: string;
	ignoredConversationIds: string[];
	pendingAlert?: PendingAlert | null;
};

export type LeaderLease = {
	instanceId: string;
	pid: number;
	heartbeatAt: number;
};

export type UsageMonitorCoordinatorOptions = {
	instanceId?: string;
	leaseTtlMs?: number;
	claimTtlMs?: number;
	now?: () => number;
	pid?: number;
};

export type AdvanceEventResult =
	| 'bootstrapped'
	| 'unchanged'
	| 'skipped_ignored'
	| 'skipped_below_threshold'
	| 'alert_enqueued'
	| 'alert_duplicate';

/**
 * Cross-window coordination for account-level usage monitoring.
 *
 * Uses files under the extension globalStorage directory so every Cursor
 * window on this machine shares leader election and alert state.
 */
export class UsageMonitorCoordinator {
	readonly instanceId: string;
	private readonly leaseTtlMs: number;
	private readonly claimTtlMs: number;
	private readonly now: () => number;
	private readonly pid: number;
	private heldLeadership = false;

	constructor(
		private readonly storageDir: string,
		options: UsageMonitorCoordinatorOptions = {}
	) {
		this.instanceId = options.instanceId ?? randomUUID();
		this.leaseTtlMs = options.leaseTtlMs ?? LEADER_LEASE_TTL_MS;
		this.claimTtlMs = options.claimTtlMs ?? PENDING_ALERT_CLAIM_TTL_MS;
		this.now = options.now ?? Date.now;
		this.pid = options.pid ?? process.pid;
	}

	/** Whether this instance currently believes it holds leadership. */
	isLeader(): boolean {
		return this.heldLeadership;
	}

	/**
	 * Attempt to become leader, or renew the lease if already leader.
	 * Returns true only for the elected leader.
	 */
	async tryBecomeLeader(): Promise<boolean> {
		await this.ensureStorageDir();

		return this.withLock(async () => {
			const lease = await this.readLeaderLease();
			const now = this.now();

			if (lease && lease.instanceId === this.instanceId) {
				await this.writeLeaderLease({
					instanceId: this.instanceId,
					pid: this.pid,
					heartbeatAt: now,
				});
				this.heldLeadership = true;
				return true;
			}

			if (lease && !this.isLeaseStale(lease, now)) {
				this.heldLeadership = false;
				return false;
			}

			await this.writeLeaderLease({
				instanceId: this.instanceId,
				pid: this.pid,
				heartbeatAt: now,
			});
			this.heldLeadership = true;
			if (!lease) {
				log(`Usage monitor leader elected: ${this.instanceId}`);
			} else {
				log(
					`Usage monitor leader recovered from stale lease: ${this.instanceId}`
				);
			}
			return true;
		});
	}

	/** Release leadership so another window can take over immediately. */
	async releaseLeadership(): Promise<void> {
		if (!this.heldLeadership) {
			return;
		}

		try {
			await this.ensureStorageDir();
			await this.withLock(async () => {
				const lease = await this.readLeaderLease();
				if (lease?.instanceId === this.instanceId) {
					await this.removeFile(this.leaderPath());
					log(`Usage monitor leader released: ${this.instanceId}`);
				}
				this.heldLeadership = false;
			});
		} catch (error) {
			this.heldLeadership = false;
			logError('Failed to release usage monitor leadership:', error);
		}
	}

	async getLastProcessedId(): Promise<string | undefined> {
		const state = await this.readState();
		return state.lastProcessedId;
	}

	async isConversationIgnored(conversationId: string): Promise<boolean> {
		if (!conversationId) {
			return false;
		}
		const state = await this.readState();
		return state.ignoredConversationIds.includes(conversationId);
	}

	async ignoreConversation(conversationId: string): Promise<void> {
		if (!conversationId) {
			return;
		}
		await this.mutateState((state) => {
			if (state.ignoredConversationIds.includes(conversationId)) {
				return state;
			}
			return {
				...state,
				ignoredConversationIds: [
					...state.ignoredConversationIds,
					conversationId,
				],
			};
		});
	}

	/**
	 * Atomically advance shared monitoring state for a usage event.
	 *
	 * On bootstrap (first-ever monitor start with empty shared state), records
	 * the current event without alerting. Otherwise enqueues at most one
	 * pending alert when the event is new and above threshold.
	 */
	async advanceToEvent(
		event: UsageEvent,
		options: { threshold: number; bootstrap: boolean }
	): Promise<AdvanceEventResult> {
		const eventId = usageEventId(event);
		const costUsd = event.chargedCents / 100;

		const { result } = await this.mutateState((state) => {
			if (options.bootstrap && !state.lastProcessedId) {
				return {
					state: {
						...state,
						lastProcessedId: eventId,
					},
					result: 'bootstrapped' as const,
				};
			}

			if (state.lastProcessedId === eventId) {
				if (state.pendingAlert?.eventId === eventId) {
					return { state, result: 'alert_duplicate' as const };
				}
				return { state, result: 'unchanged' as const };
			}

			if (
				event.conversationId &&
				state.ignoredConversationIds.includes(event.conversationId)
			) {
				return {
					state: {
						...state,
						lastProcessedId: eventId,
						pendingAlert: null,
					},
					result: 'skipped_ignored' as const,
				};
			}

			if (costUsd <= options.threshold) {
				return {
					state: {
						...state,
						lastProcessedId: eventId,
						pendingAlert: null,
					},
					result: 'skipped_below_threshold' as const,
				};
			}

			if (state.pendingAlert?.eventId === eventId) {
				return { state, result: 'alert_duplicate' as const };
			}

			const pendingAlert: PendingAlert = {
				eventId,
				event,
				threshold: options.threshold,
				createdAt: this.now(),
			};

			return {
				state: {
					...state,
					lastProcessedId: eventId,
					pendingAlert,
				},
				result: 'alert_enqueued' as const,
			};
		});

		return result;
	}

	/**
	 * Claim a pending alert for display in the focused window.
	 * Returns null when there is nothing to show or another instance holds a fresh claim.
	 */
	async claimPendingAlert(): Promise<PendingAlert | null> {
		const { result } = await this.mutateState((state) => {
			const pending = state.pendingAlert;
			if (!pending) {
				return { state, result: null as PendingAlert | null };
			}

			const now = this.now();
			const claimedByOther =
				pending.claimedBy !== undefined &&
				pending.claimedBy !== this.instanceId &&
				pending.claimedAt !== undefined &&
				now - pending.claimedAt < this.claimTtlMs;

			if (claimedByOther) {
				return { state, result: null };
			}

			const claimed: PendingAlert = {
				...pending,
				claimedBy: this.instanceId,
				claimedAt: now,
			};

			return {
				state: { ...state, pendingAlert: claimed },
				result: claimed,
			};
		});

		return result;
	}

	/** Clear the pending alert after the user dismisses it (OK or Ignore). */
	async markAlertHandled(eventId: string): Promise<void> {
		await this.mutateState((state) => {
			if (state.pendingAlert?.eventId !== eventId) {
				return state;
			}
			return {
				...state,
				lastProcessedId: eventId,
				pendingAlert: null,
			};
		});
	}

	async readState(): Promise<SharedAlertState> {
		await this.ensureStorageDir();
		return this.withLock(() => this.readStateUnlocked());
	}

	private async mutateState<T>(
		updater: (
			state: SharedAlertState
		) => SharedAlertState | { state: SharedAlertState; result: T }
	): Promise<{ state: SharedAlertState; result: T }> {
		await this.ensureStorageDir();

		return this.withLock(async () => {
			const current = await this.readStateUnlocked();
			const updated = updater(current);

			if (isStateUpdateResult(updated)) {
				await this.writeState(updated.state);
				return updated;
			}

			await this.writeState(updated);
			return { state: updated, result: undefined as T };
		});
	}

	private async readStateUnlocked(): Promise<SharedAlertState> {
		try {
			const raw = await fs.readFile(this.statePath(), 'utf8');
			return normalizeState(JSON.parse(raw));
		} catch (error) {
			if (isNotFound(error)) {
				return emptyState();
			}
			throw error;
		}
	}

	private async writeState(state: SharedAlertState): Promise<void> {
		const payload = JSON.stringify(
			{
				lastProcessedId: state.lastProcessedId,
				ignoredConversationIds: state.ignoredConversationIds,
				pendingAlert: state.pendingAlert ?? null,
			},
			null,
			2
		);
		const tmp = `${this.statePath()}.${this.instanceId}.tmp`;
		await fs.writeFile(tmp, payload, 'utf8');
		await fs.rename(tmp, this.statePath());
	}

	private async readLeaderLease(): Promise<LeaderLease | undefined> {
		try {
			const raw = await fs.readFile(this.leaderPath(), 'utf8');
			const parsed: unknown = JSON.parse(raw);
			if (!isRecord(parsed)) {
				return undefined;
			}
			if (
				typeof parsed.instanceId !== 'string' ||
				typeof parsed.pid !== 'number' ||
				typeof parsed.heartbeatAt !== 'number'
			) {
				return undefined;
			}
			return {
				instanceId: parsed.instanceId,
				pid: parsed.pid,
				heartbeatAt: parsed.heartbeatAt,
			};
		} catch (error) {
			if (isNotFound(error)) {
				return undefined;
			}
			logError('Failed to read usage monitor leader lease:', error);
			return undefined;
		}
	}

	private async writeLeaderLease(lease: LeaderLease): Promise<void> {
		const tmp = `${this.leaderPath()}.${this.instanceId}.tmp`;
		await fs.writeFile(tmp, JSON.stringify(lease, null, 2), 'utf8');
		await fs.rename(tmp, this.leaderPath());
	}

	private isLeaseStale(lease: LeaderLease, now: number): boolean {
		return now - lease.heartbeatAt > this.leaseTtlMs;
	}

	private leaderPath(): string {
		return path.join(this.storageDir, LEADER_FILE);
	}

	private statePath(): string {
		return path.join(this.storageDir, STATE_FILE);
	}

	private lockPath(): string {
		return path.join(this.storageDir, LOCK_DIR);
	}

	private async ensureStorageDir(): Promise<void> {
		await fs.mkdir(this.storageDir, { recursive: true });
	}

	/**
	 * Cross-process critical section via atomic mkdir.
	 * Stale locks (crashed holder) are removed based on directory mtime.
	 */
	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		const lockPath = this.lockPath();
		// Wall clock for acquisition timeout so injected test clocks cannot hang.
		const deadline = Date.now() + 5_000;

		while (Date.now() < deadline) {
			try {
				await fs.mkdir(lockPath);
				try {
					return await fn();
				} finally {
					await fs.rm(lockPath, { recursive: true, force: true });
				}
			} catch (error) {
				if (!isExist(error)) {
					throw error;
				}

				try {
					const stat = await fs.stat(lockPath);
					if (Date.now() - stat.mtimeMs > 10_000) {
						await fs.rm(lockPath, { recursive: true, force: true });
						continue;
					}
				} catch {
					// Lock disappeared between mkdir failure and stat.
				}

				await sleep(25);
			}
		}

		throw new Error('Timed out acquiring usage monitor lock');
	}

	private async removeFile(filePath: string): Promise<void> {
		try {
			await fs.unlink(filePath);
		} catch (error) {
			if (!isNotFound(error)) {
				throw error;
			}
		}
	}
}

function emptyState(): SharedAlertState {
	return {
		ignoredConversationIds: [],
		pendingAlert: null,
	};
}

function normalizeState(value: unknown): SharedAlertState {
	if (!isRecord(value)) {
		return emptyState();
	}

	const ignored = Array.isArray(value.ignoredConversationIds)
		? value.ignoredConversationIds.filter(
				(id): id is string => typeof id === 'string' && id.length > 0
			)
		: [];

	const lastProcessedId =
		typeof value.lastProcessedId === 'string'
			? value.lastProcessedId
			: undefined;

	return {
		lastProcessedId,
		ignoredConversationIds: ignored,
		pendingAlert: normalizePendingAlert(value.pendingAlert),
	};
}

function normalizePendingAlert(value: unknown): PendingAlert | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (!isRecord(value)) {
		return null;
	}
	if (typeof value.eventId !== 'string' || typeof value.threshold !== 'number') {
		return null;
	}
	if (!isRecord(value.event)) {
		return null;
	}

	const event = value.event;
	if (
		typeof event.timestamp !== 'string' ||
		typeof event.conversationId !== 'string' ||
		typeof event.chargedCents !== 'number' ||
		typeof event.model !== 'string'
	) {
		return null;
	}

	return {
		eventId: value.eventId,
		threshold: value.threshold,
		createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
		claimedBy:
			typeof value.claimedBy === 'string' ? value.claimedBy : undefined,
		claimedAt:
			typeof value.claimedAt === 'number' ? value.claimedAt : undefined,
		event: {
			timestamp: event.timestamp,
			conversationId: event.conversationId,
			chargedCents: event.chargedCents,
			model: event.model,
		},
	};
}

function isStateUpdateResult<T>(
	value: SharedAlertState | { state: SharedAlertState; result: T }
): value is { state: SharedAlertState; result: T } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'state' in value &&
		'result' in value
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: string }).code === 'ENOENT'
	);
}

function isExist(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: string }).code === 'EEXIST'
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
