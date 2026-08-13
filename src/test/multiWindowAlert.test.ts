import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IndividualOverallUsage, UsageEvent } from '../api/types';
import type { AuthProvider } from '../auth/types';
import { HighCostAlertService } from '../services/highCostAlertService';
import {
	LEADER_LEASE_TTL_MS,
	UsageMonitorCoordinator,
} from '../services/usageMonitorCoordination';

suite('Usage monitor multi-window coordination', () => {
	let storageDir: string;
	let nowMs: number;

	setup(async () => {
		storageDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'cursor-insights-mw-')
		);
		nowMs = 1_700_000_000_000;
	});

	teardown(async () => {
		await fs.rm(storageDir, { recursive: true, force: true });
	});

	function createCoordinator(
		instanceId: string,
		overrides: { leaseTtlMs?: number } = {}
	): UsageMonitorCoordinator {
		return new UsageMonitorCoordinator(storageDir, {
			instanceId,
			now: () => nowMs,
			leaseTtlMs: overrides.leaseTtlMs ?? LEADER_LEASE_TTL_MS,
			pid: 1000 + instanceId.charCodeAt(0),
		});
	}

	test('one window becomes leader', async () => {
		const a = createCoordinator('window-a');
		assert.strictEqual(await a.tryBecomeLeader(), true);
		assert.strictEqual(a.isLeader(), true);
	});

	test('second window remains follower while leader lease is fresh', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');

		assert.strictEqual(await a.tryBecomeLeader(), true);
		nowMs += 1_000;
		assert.strictEqual(await b.tryBecomeLeader(), false);
		assert.strictEqual(b.isLeader(), false);
		assert.strictEqual(await a.tryBecomeLeader(), true);
	});

	test('third window remains follower', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');
		const c = createCoordinator('window-c');

		assert.strictEqual(await a.tryBecomeLeader(), true);
		assert.strictEqual(await b.tryBecomeLeader(), false);
		assert.strictEqual(await c.tryBecomeLeader(), false);
	});

	test('two windows starting simultaneously elect exactly one leader', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');

		const results = await Promise.all([
			a.tryBecomeLeader(),
			b.tryBecomeLeader(),
		]);

		const leaders = results.filter(Boolean);
		assert.strictEqual(leaders.length, 1);
		assert.strictEqual(a.isLeader() !== b.isLeader(), true);
	});

	test('stale leader state allows another window to recover', async () => {
		const a = createCoordinator('window-a', { leaseTtlMs: 5_000 });
		const b = createCoordinator('window-b', { leaseTtlMs: 5_000 });

		assert.strictEqual(await a.tryBecomeLeader(), true);
		nowMs += 6_000;
		assert.strictEqual(await b.tryBecomeLeader(), true);
		assert.strictEqual(b.isLeader(), true);
		assert.strictEqual(await a.tryBecomeLeader(), false);
	});

	test('leader release lets another window take over immediately', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');

		assert.strictEqual(await a.tryBecomeLeader(), true);
		await a.releaseLeadership();
		assert.strictEqual(a.isLeader(), false);

		assert.strictEqual(await b.tryBecomeLeader(), true);
		assert.strictEqual(b.isLeader(), true);
	});

	test('threshold crossing is recorded once globally', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');
		const event = makeEvent({ chargedCents: 342 });

		await a.advanceToEvent(event, { threshold: 2, bootstrap: true });
		const first = await a.advanceToEvent(
			makeEvent({ chargedCents: 342, timestamp: '2' }),
			{ threshold: 2, bootstrap: false }
		);
		const second = await b.advanceToEvent(
			makeEvent({ chargedCents: 342, timestamp: '2' }),
			{ threshold: 2, bootstrap: false }
		);

		assert.strictEqual(first, 'alert_enqueued');
		assert.strictEqual(second, 'alert_duplicate');

		const state = await a.readState();
		assert.ok(state.pendingAlert);
		assert.strictEqual(state.pendingAlert?.event.chargedCents, 342);
	});

	test('new leader does not replay an already-processed event', async () => {
		const a = createCoordinator('window-a', { leaseTtlMs: 5_000 });
		const b = createCoordinator('window-b', { leaseTtlMs: 5_000 });
		const event = makeEvent({ chargedCents: 500, timestamp: '10' });

		await a.tryBecomeLeader();
		await a.advanceToEvent(makeEvent({ chargedCents: 50, timestamp: '9' }), {
			threshold: 2,
			bootstrap: true,
		});
		assert.strictEqual(
			await a.advanceToEvent(event, { threshold: 2, bootstrap: false }),
			'alert_enqueued'
		);
		const claimed = await a.claimPendingAlert();
		assert.ok(claimed);
		await a.markAlertHandled(claimed!.eventId);

		await a.releaseLeadership();
		nowMs += 6_000;
		assert.strictEqual(await b.tryBecomeLeader(), true);

		assert.strictEqual(
			await b.advanceToEvent(event, { threshold: 2, bootstrap: true }),
			'unchanged'
		);
		assert.strictEqual(await b.claimPendingAlert(), null);
	});

	test('ignored conversations are shared across windows', async () => {
		const a = createCoordinator('window-a');
		const b = createCoordinator('window-b');

		await a.ignoreConversation('conv-1');
		assert.strictEqual(await b.isConversationIgnored('conv-1'), true);

		const result = await b.advanceToEvent(
			makeEvent({
				chargedCents: 900,
				conversationId: 'conv-1',
				timestamp: '20',
			}),
			{ threshold: 2, bootstrap: false }
		);
		assert.strictEqual(result, 'skipped_ignored');
		assert.strictEqual((await b.readState()).pendingAlert, null);
	});
});

suite('HighCostAlertService multi-window behavior', () => {
	let storageDir: string;
	let latestEvent: UsageEvent | undefined;
	let alertCalls: string[];
	let focused: Map<string, boolean>;

	setup(async () => {
		storageDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'cursor-insights-alert-')
		);
		latestEvent = makeEvent({ chargedCents: 50, timestamp: '1' });
		alertCalls = [];
		focused = new Map();
	});

	teardown(async () => {
		await fs.rm(storageDir, { recursive: true, force: true });
	});

	function createService(
		instanceId: string,
		options: {
			initiallyFocused?: boolean;
			alertChoice?: string | undefined;
			threshold?: number;
			/**
			 * Override for getFocusedInstanceId. When omitted, the helper returns
			 * the instanceId of whichever service currently has focused=true in
			 * the shared `focused` map (i.e. the default registry lookup).
			 */
			getFocusedInstanceId?: () => string | undefined;
		} = {}
	): HighCostAlertService {
		focused.set(instanceId, options.initiallyFocused ?? false);
		const auth: AuthProvider = {
			isAuthenticated: async () => true,
			getAuthHeaders: async () => ({}),
		};

		return new HighCostAlertService(auth, {
			storageDir,
			instanceId,
			isWindowFocused: () => focused.get(instanceId) === true,
			getFocusedInstanceId:
				options.getFocusedInstanceId ??
				(() => {
					for (const [id, isFocused] of focused) {
						if (isFocused) {
							return id;
						}
					}
					return undefined;
				}),
			pollIntervalMs: 60_000,
			coordinationIntervalMs: 60_000,
			leaseTtlMs: 150_000,
			getAlertThreshold: () => options.threshold ?? 2,
			fetchCurrentTeamId: async () => 0,
			fetchIndividualUsage: async () => makeBilling(),
			fetchLatestUsageEvent: async () => latestEvent,
			showInformationMessage: async (message) => {
				alertCalls.push(`${instanceId}:${message}`);
				return options.alertChoice;
			},
		});
	}

	test('only the leader polls usage across three windows', async () => {
		let pollCount = 0;
		latestEvent = makeEvent({ chargedCents: 50, timestamp: '1' });

		const services = ['a', 'b', 'c'].map((id) => {
			const auth: AuthProvider = {
				isAuthenticated: async () => true,
				getAuthHeaders: async () => ({}),
			};
			return new HighCostAlertService(auth, {
				storageDir,
				instanceId: id,
				isWindowFocused: () => false,
				fetchCurrentTeamId: async () => 0,
				fetchIndividualUsage: async () => makeBilling(),
				fetchLatestUsageEvent: async () => {
					pollCount += 1;
					return latestEvent;
				},
				getAlertThreshold: () => 2,
				showInformationMessage: async () => undefined,
			});
		});

		try {
			await Promise.all(
				services.map((service) => service.tick({ bootstrap: true }))
			);

			const leaders = services.filter((service) => service.isLeader());
			assert.strictEqual(leaders.length, 1);
			assert.strictEqual(pollCount, 1);

			pollCount = 0;
			await Promise.all(
				services.map((service) =>
					service.tick({ bootstrap: false, usagePoll: true })
				)
			);
			assert.strictEqual(pollCount, 1);
			assert.strictEqual(
				services.filter((service) => service.isLeader()).length,
				1
			);
		} finally {
			for (const service of services) {
				service.dispose();
			}
		}
	});

	test('threshold crossing shows exactly one alert in the focused window', async () => {
		const leader = createService('leader', { initiallyFocused: false });
		const followerFocused = createService('follower-focused', {
			initiallyFocused: true,
		});
		const followerOther = createService('follower-other', {
			initiallyFocused: false,
		});

		try {
			await leader.tick({ bootstrap: true });
			assert.strictEqual(leader.isLeader(), true);

			await followerFocused.tick({
				bootstrap: false,
				usagePoll: true,
			});
			await followerOther.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(followerFocused.isLeader(), false);
			assert.strictEqual(followerOther.isLeader(), false);

			latestEvent = makeEvent({
				chargedCents: 342,
				timestamp: '2',
				model: 'claude-4-sonnet',
			});

			await leader.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 0);

			await followerFocused.tick({
				bootstrap: false,
				usagePoll: false,
			});
			await followerOther.tick({ bootstrap: false, usagePoll: false });

			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('follower-focused:'));
			assert.ok(alertCalls[0]?.includes('Your last Cursor request cost'));
			assert.ok(alertCalls[0]?.includes('Threshold: $2.00'));
			assert.ok(alertCalls[0]?.includes('Model: Claude 4 Sonnet'));
		} finally {
			leader.dispose();
			followerFocused.dispose();
			followerOther.dispose();
		}
	});

	test('followers do not display duplicate alerts', async () => {
		const leader = createService('leader', { initiallyFocused: true });
		const follower = createService('follower', { initiallyFocused: true });

		try {
			await leader.tick({ bootstrap: true });
			latestEvent = makeEvent({ chargedCents: 400, timestamp: '3' });

			await leader.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);

			await follower.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('leader:'));
		} finally {
			leader.dispose();
			follower.dispose();
		}
	});

	test('leader close transfers monitoring without replaying handled alerts', async () => {
		const first = createService('first', { initiallyFocused: true });
		const second = createService('second', { initiallyFocused: false });

		try {
			await first.tick({ bootstrap: true });
			assert.strictEqual(first.isLeader(), true);

			latestEvent = makeEvent({ chargedCents: 350, timestamp: '4' });
			await first.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);

			first.dispose();
			await second.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(second.isLeader(), true);
			assert.strictEqual(alertCalls.length, 1);

			await second.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);
		} finally {
			second.dispose();
		}
	});

	test('ignore conversation remains correct across windows', async () => {
		const leader = createService('leader', {
			initiallyFocused: true,
			alertChoice: 'Ignore this conversation',
		});
		const follower = createService('follower', { initiallyFocused: true });

		try {
			await leader.tick({ bootstrap: true });

			latestEvent = makeEvent({
				chargedCents: 500,
				timestamp: '5',
				conversationId: 'conv-shared',
			});
			await leader.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);

			latestEvent = makeEvent({
				chargedCents: 600,
				timestamp: '6',
				conversationId: 'conv-shared',
			});
			await leader.tick({ bootstrap: false, usagePoll: true });
			await follower.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
		} finally {
			leader.dispose();
			follower.dispose();
		}
	});

	test('alert message and buttons match existing UX', async () => {
		let receivedMessage = '';
		let receivedButtons: string[] = [];
		let event: UsageEvent = makeEvent({
			chargedCents: 50,
			timestamp: '1',
			model: 'gpt-4.1',
		});

		const auth: AuthProvider = {
			isAuthenticated: async () => true,
			getAuthHeaders: async () => ({}),
		};
		const service = new HighCostAlertService(auth, {
			storageDir,
			instanceId: 'ux',
			isWindowFocused: () => true,
			getAlertThreshold: () => 2,
			fetchCurrentTeamId: async () => 0,
			fetchIndividualUsage: async () => makeBilling(),
			fetchLatestUsageEvent: async () => event,
			showInformationMessage: async (message, ...items) => {
				receivedMessage = message;
				receivedButtons = items;
				return 'OK';
			},
		});

		try {
			await service.tick({ bootstrap: true });
			event = makeEvent({
				chargedCents: 999,
				timestamp: '9',
				model: 'gpt-4.1',
			});
			await service.tick({ bootstrap: false, usagePoll: true });

			assert.strictEqual(
				receivedMessage,
				[
					'Your last Cursor request cost $9.99.',
					'',
					'Threshold: $2.00',
					'',
					'Model: Gpt 4.1',
				].join('\n')
			);
			assert.deepStrictEqual(receivedButtons, [
				'OK',
				'Ignore this conversation',
			]);
		} finally {
			service.dispose();
		}
	});

	test('changing focused window does not replay a handled alert', async () => {
		const a = createService('a', { initiallyFocused: true });
		const b = createService('b', { initiallyFocused: false });

		try {
			await a.tick({ bootstrap: true });
			latestEvent = makeEvent({ chargedCents: 300, timestamp: '7' });
			await a.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 1);

			focused.set('a', false);
			focused.set('b', true);
			await b.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
		} finally {
			a.dispose();
			b.dispose();
		}
	});

	// ── Targeted delivery tests ──────────────────────────────────────────────

	test('focused polling window receives alert directly (leader is focused)', async () => {
		// Window A is leader AND focused — the alert must appear in A, not elsewhere.
		const a = createService('a', { initiallyFocused: true });
		const b = createService('b', { initiallyFocused: false });
		const c = createService('c', { initiallyFocused: false });

		try {
			await a.tick({ bootstrap: true });
			assert.strictEqual(a.isLeader(), true);

			latestEvent = makeEvent({ chargedCents: 350, timestamp: '11' });
			await a.tick({ bootstrap: false, usagePoll: true });

			// A is leader and focused → alert targeted at A and shown in A.
			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('a:'));

			// B and C tick; neither should re-show the alert.
			await b.tick({ bootstrap: false, usagePoll: false });
			await c.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
		} finally {
			a.dispose();
			b.dispose();
			c.dispose();
		}
	});

	test('non-focused polling window targets the currently focused window', async () => {
		// Window A = leader, not focused.
		// Window B = inactive.
		// Window C = focused.
		// Expected: C receives and shows the alert; A and B do not.
		const a = createService('a', { initiallyFocused: false });
		const b = createService('b', { initiallyFocused: false });
		const c = createService('c', { initiallyFocused: true });

		try {
			await a.tick({ bootstrap: true });
			assert.strictEqual(a.isLeader(), true);

			// Followers register themselves (non-polling tick).
			await b.tick({ bootstrap: false, usagePoll: false });
			await c.tick({ bootstrap: false, usagePoll: false });

			latestEvent = makeEvent({ chargedCents: 400, timestamp: '12' });
			// A detects threshold crossing: C is focused → targets C.
			await a.tick({ bootstrap: false, usagePoll: true });
			// A is not focused, so it should not show the alert itself.
			assert.strictEqual(alertCalls.length, 0);

			// B ticks — not focused AND not the target → skips.
			await b.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 0);

			// C ticks — focused AND is the target → claims and shows.
			await c.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('c:'));

			// A ticks again — alert is already handled, no replay.
			await a.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
		} finally {
			a.dispose();
			b.dispose();
			c.dispose();
		}
	});

	test('wrong (non-targeted) window cannot claim a targeted alert', async () => {
		// Leader A targets C. Window B should not be able to claim the alert
		// even if it is also focused at the same time.
		const a = createService('a', { initiallyFocused: false });
		const b = createService('b', { initiallyFocused: true }); // focused but NOT target
		const c = createService('c', { initiallyFocused: true }); // focused AND target

		try {
			await a.tick({ bootstrap: true });
			assert.strictEqual(a.isLeader(), true);

			latestEvent = makeEvent({ chargedCents: 500, timestamp: '13' });

			// Override getFocusedInstanceId on A so it always reports 'c' as the
			// focused window, regardless of the map order.
			const strictA = createService('a-strict', {
				initiallyFocused: false,
				getFocusedInstanceId: () => 'c',
			});
			a.dispose();

			await strictA.tick({ bootstrap: true });
			assert.strictEqual(strictA.isLeader(), true);

			await strictA.tick({ bootstrap: false, usagePoll: true });
			assert.strictEqual(alertCalls.length, 0);

			// B ticks — focused but target is c → must be skipped.
			await b.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 0);

			// C ticks — is the target → shows the alert.
			await c.tick({ bootstrap: false, usagePoll: false });
			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('c:'));
		} finally {
			a.dispose();
			b.dispose();
			c.dispose();
		}
	});

	test('multiple windows open produce exactly one alert (targeted delivery)', async () => {
		// Three windows; leader is A (not focused); C is focused.
		// All three tick after the threshold crossing.
		const a = createService('a', { initiallyFocused: false });
		const b = createService('b', { initiallyFocused: false });
		const c = createService('c', { initiallyFocused: true });

		try {
			await a.tick({ bootstrap: true });
			assert.strictEqual(a.isLeader(), true);

			latestEvent = makeEvent({ chargedCents: 600, timestamp: '14' });
			await a.tick({ bootstrap: false, usagePoll: true });

			// All three windows tick simultaneously (simulate parallel ticks).
			await Promise.all([
				a.tick({ bootstrap: false, usagePoll: false }),
				b.tick({ bootstrap: false, usagePoll: false }),
				c.tick({ bootstrap: false, usagePoll: false }),
			]);

			assert.strictEqual(alertCalls.length, 1);
			assert.ok(alertCalls[0]?.startsWith('c:'));
		} finally {
			a.dispose();
			b.dispose();
			c.dispose();
		}
	});
});

function makeEvent(
	overrides: Partial<UsageEvent> = {}
): UsageEvent {
	return {
		timestamp: '1000',
		conversationId: 'conv-default',
		chargedCents: 100,
		model: 'claude-4-sonnet',
		...overrides,
	};
}

function makeBilling(): IndividualOverallUsage {
	return {
		usedCents: 1000,
		limitCents: 10000,
		remainingCents: 9000,
		billingCycleStart: new Date('2026-08-01T00:00:00.000Z'),
		billingCycleEnd: new Date('2026-09-01T00:00:00.000Z'),
	};
}
