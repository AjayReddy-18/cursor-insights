import * as assert from 'assert';
import type { AuthProvider } from '../auth/types';
import {
	buildConversationInsightsUrl,
	fetchConversationInsights,
	parseConversationClassification,
	parseConversationSegments,
	parseHistogram,
} from '../api/conversationInsights';
import {
	DEFAULT_CONVERSATION_METRIC,
	DEFAULT_CONVERSATION_TIMEFRAME,
	getConversationMetric,
	getConversationTimeframe,
	parseConversationMetric,
	parseConversationTimeframe,
	setConversationMetric,
	setConversationTimeframe,
} from '../config';
import {
	formatInsightLabel,
	formatLocalDate,
	getChartSegmentsForMetric,
	getDateRangeForTimeframe,
	getHistogramForMetric,
	toChartSegments,
	type ConversationMetric,
	type ConversationTimeframe,
} from '../models/conversationInsights';
import { ConversationInsightsService } from '../services/conversationInsightsService';
import type { ConversationInsightsPayload } from '../api/types';

suite('Conversation Insights timeframe', () => {
	test('1D is today through today', () => {
		const now = new Date(2026, 7, 8, 15, 30, 0); // Aug 8 local
		const range = getDateRangeForTimeframe('1D', now);
		assert.deepStrictEqual(range, {
			startDate: '2026-08-08',
			endDate: '2026-08-08',
		});
	});

	test('7D is today minus 7 days through today', () => {
		const now = new Date(2026, 7, 8, 12, 0, 0);
		const range = getDateRangeForTimeframe('7D', now);
		assert.deepStrictEqual(range, {
			startDate: '2026-08-01',
			endDate: '2026-08-08',
		});
	});

	test('30D is today minus 30 days through today', () => {
		const now = new Date(2026, 7, 8, 12, 0, 0);
		const range = getDateRangeForTimeframe('30D', now);
		assert.deepStrictEqual(range, {
			startDate: '2026-07-09',
			endDate: '2026-08-08',
		});
	});

	test('MTD is first day of current month through today', () => {
		const now = new Date(2026, 7, 8, 9, 0, 0);
		const range = getDateRangeForTimeframe('MTD', now);
		assert.deepStrictEqual(range, {
			startDate: '2026-08-01',
			endDate: '2026-08-08',
		});
	});

	test('MTD on the first of the month is a single day', () => {
		const now = new Date(2026, 2, 1, 8, 0, 0); // Mar 1
		const range = getDateRangeForTimeframe('MTD', now);
		assert.deepStrictEqual(range, {
			startDate: '2026-03-01',
			endDate: '2026-03-01',
		});
	});

	test('formatLocalDate pads month and day', () => {
		assert.strictEqual(formatLocalDate(new Date(2026, 0, 5)), '2026-01-05');
	});

	test('uses local calendar across month boundaries for 7D', () => {
		const now = new Date(2026, 0, 3, 10, 0, 0); // Jan 3
		const range = getDateRangeForTimeframe('7D', now);
		assert.deepStrictEqual(range, {
			startDate: '2025-12-27',
			endDate: '2026-01-03',
		});
	});
});

suite('Conversation Insights parsing and mapping', () => {
	const classificationFixture = {
		intent_distribution: [
			{ intent: 'Ask', count: 13 },
			{ intent: 'Write Code', count: 6 },
			{ intent: 'Plan', count: 2 },
			{ intent: 'Task Automation', count: 1 },
		],
		categories_histogram: [
			{ category: 'New Features', count: 6 },
			{ category: 'Bug Fixing & Debugging', count: 6 },
		],
		complexity_distribution: [
			{ complexity: 'trivial', count: 2 },
			{ complexity: 'low', count: 4 },
			{ complexity: 'medium', count: 8 },
			{ complexity: 'high', count: 1 },
		],
		guidance_level_distribution: [
			{ guidance_level: 'low', count: 3 },
			{ guidance_level: 'medium', count: 5 },
			{ guidance_level: 'high', count: 7 },
		],
	};

	const segmentsFixture = {
		work_type_histogram: [
			{ work_type: 'ktlo', count: 6 },
			{ work_type: 'bug', count: 3 },
		],
	};

	test('parses conversation-classification response fields', () => {
		const parsed = parseConversationClassification(classificationFixture);
		assert.strictEqual(parsed.intentDistribution.length, 4);
		assert.strictEqual(parsed.categoriesHistogram[0].label, 'New Features');
		assert.strictEqual(parsed.complexityDistribution[2].label, 'medium');
		assert.strictEqual(parsed.guidanceLevelDistribution[0].label, 'low');
	});

	test('parses conversation-segments work_type_histogram', () => {
		const parsed = parseConversationSegments(segmentsFixture);
		assert.deepStrictEqual(parsed.workTypeHistogram, [
			{ label: 'ktlo', count: 6 },
			{ label: 'bug', count: 3 },
		]);
	});

	test('handles malformed and missing histogram fields', () => {
		assert.deepStrictEqual(parseConversationClassification(null).categoriesHistogram, []);
		assert.deepStrictEqual(parseConversationSegments(undefined).workTypeHistogram, []);
		assert.deepStrictEqual(
			parseHistogram(
				[{ count: 1 }, { work_type: 'ok', count: 'bad' }, { work_type: 'fine', count: 2 }],
				['work_type']
			),
			[{ label: 'fine', count: 2 }]
		);
	});

	test('maps metrics to response fields including Prompt Specificity', () => {
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: parseConversationSegments(segmentsFixture),
		};

		assert.strictEqual(
			getHistogramForMetric(payload, 'workType')[0].label,
			'ktlo'
		);
		assert.strictEqual(
			getHistogramForMetric(payload, 'intentDistribution')[0].label,
			'Ask'
		);
		assert.strictEqual(
			getHistogramForMetric(payload, 'categories')[0].label,
			'New Features'
		);
		assert.strictEqual(
			getHistogramForMetric(payload, 'taskComplexity')[0].label,
			'trivial'
		);
		assert.strictEqual(
			getHistogramForMetric(payload, 'promptSpecificity')[0].label,
			'low'
		);
	});

	test('calculates percentages and formats labels', () => {
		const segments = toChartSegments([
			{ label: 'ktlo', count: 6 },
			{ label: 'bug', count: 3 },
			{ label: 'zero', count: 0 },
		]);

		assert.strictEqual(segments.length, 2);
		assert.strictEqual(segments[0].label, 'Ktlo');
		assert.strictEqual(segments[0].percent, 66.66666666666666);
		assert.strictEqual(segments[1].label, 'Bug');
		assert.strictEqual(segments[1].percent, 33.33333333333333);
		assert.strictEqual(formatInsightLabel('New Features'), 'New Features');
	});

	test('empty histogram yields no chart segments', () => {
		assert.deepStrictEqual(toChartSegments([]), []);
		assert.deepStrictEqual(toChartSegments([{ label: 'x', count: 0 }]), []);
	});

	test('getChartSegmentsForMetric uses Categories by default field', () => {
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: parseConversationSegments(segmentsFixture),
		};
		const segments = getChartSegmentsForMetric(payload, 'categories');
		assert.strictEqual(segments.length, 2);
		assert.strictEqual(segments[0].percent, 50);
		assert.strictEqual(segments[1].percent, 50);
	});
});

suite('Conversation Insights API requests', () => {
	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	test('buildConversationInsightsUrl only includes startDate and endDate', () => {
		const url = buildConversationInsightsUrl(
			'https://cursor.com/api/v2/analytics/team/conversation-classification',
			{ startDate: '2026-07-10', endDate: '2026-08-08' }
		);
		const parsed = new URL(url);
		assert.strictEqual(
			parsed.pathname,
			'/api/v2/analytics/team/conversation-classification'
		);
		assert.strictEqual(parsed.searchParams.get('startDate'), '2026-07-10');
		assert.strictEqual(parsed.searchParams.get('endDate'), '2026-08-08');
		assert.strictEqual(parsed.searchParams.get('teamId'), null);
		assert.strictEqual(parsed.searchParams.get('email'), null);
		assert.strictEqual(parsed.searchParams.get('c'), null);
		assert.strictEqual(parsed.searchParams.get('user'), null);
	});

	test('fetchConversationInsights uses Cookie auth and both endpoints', async () => {
		const calls: Array<{ url: string; headers: RequestInit['headers'] }> = [];

		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, headers: init?.headers });
			const isClassification = url.includes('conversation-classification');
			const body = isClassification
				? {
						intent_distribution: [{ intent: 'Ask', count: 1 }],
						categories_histogram: [{ category: 'New Features', count: 1 }],
						complexity_distribution: [],
						guidance_level_distribution: [],
					}
				: {
						work_type_histogram: [{ work_type: 'bug', count: 2 }],
					};
			return new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}) as typeof fetch;

		const auth: AuthProvider = {
			isAuthenticated: async () => true,
			getAuthHeaders: async () => ({
				Cookie: 'WorkosCursorSessionToken=user_01ABC%3A%3Aaccess-token',
			}),
		};

		const payload = await fetchConversationInsights(auth, {
			startDate: '2026-07-10',
			endDate: '2026-08-08',
		});

		assert.strictEqual(calls.length, 2);
		assert.ok(
			calls.some((call) =>
				call.url.includes('/api/v2/analytics/team/conversation-classification?')
			)
		);
		assert.ok(
			calls.some((call) =>
				call.url.includes('/api/v2/analytics/team/conversation-segments?')
			)
		);

		for (const call of calls) {
			const headers = new Headers(call.headers);
			assert.strictEqual(
				headers.get('Cookie'),
				'WorkosCursorSessionToken=user_01ABC%3A%3Aaccess-token'
			);
			assert.strictEqual(headers.get('Authorization'), null);
		}

		assert.strictEqual(payload.classification.categoriesHistogram[0].label, 'New Features');
		assert.strictEqual(payload.segments.workTypeHistogram[0].label, 'bug');
	});

	test('fetchConversationInsights surfaces API errors', async () => {
		globalThis.fetch = (async () =>
			new Response('nope', { status: 401, statusText: 'Unauthorized' })) as typeof fetch;

		const auth: AuthProvider = {
			isAuthenticated: async () => true,
			getAuthHeaders: async () => ({
				Cookie: 'WorkosCursorSessionToken=user_01%3A%3Atoken',
			}),
		};

		await assert.rejects(
			() =>
				fetchConversationInsights(auth, {
					startDate: '2026-08-01',
					endDate: '2026-08-08',
				}),
			/401/
		);
	});
});

suite('Conversation Insights service behavior', () => {
	const originalFetch = globalThis.fetch;

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	function mockAuth(authenticated = true): AuthProvider {
		return {
			isAuthenticated: async () => authenticated,
			getAuthHeaders: async () => ({
				Cookie: 'WorkosCursorSessionToken=user_01%3A%3Atoken',
			}),
		};
	}

	function mockInsightsApis(options?: {
		fail?: boolean;
		categories?: Array<{ category: string; count: number }>;
	}): void {
		globalThis.fetch = (async (input: string | URL | Request) => {
			if (options?.fail) {
				return new Response('fail', { status: 500, statusText: 'Error' });
			}
			const url = String(input);
			if (url.includes('conversation-classification')) {
				return new Response(
					JSON.stringify({
						intent_distribution: [{ intent: 'Ask', count: 4 }],
						categories_histogram: options?.categories ?? [
							{ category: 'New Features', count: 6 },
							{ category: 'Bug Fixing & Debugging', count: 2 },
						],
						complexity_distribution: [{ complexity: 'low', count: 3 }],
						guidance_level_distribution: [{ guidance_level: 'high', count: 5 }],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({
					work_type_histogram: [{ work_type: 'ktlo', count: 9 }],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}) as typeof fetch;
	}

	test('changing metric remaps cached data without another API call', async () => {
		mockInsightsApis();
		let fetchCount = 0;
		const inner = globalThis.fetch;
		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			fetchCount += 1;
			return inner(input, init);
		}) as typeof fetch;

		const service = new ConversationInsightsService(mockAuth());
		service.setMetric('categories');
		await service.refresh('MTD');
		assert.strictEqual(fetchCount, 2);
		assert.strictEqual(service.getSegments()[0].label, 'New Features');

		service.setMetric('workType');
		assert.strictEqual(fetchCount, 2);
		assert.strictEqual(service.getSegments()[0].label, 'Ktlo');
		assert.strictEqual(service.getMetric(), 'workType');

		service.setMetric('promptSpecificity');
		assert.strictEqual(fetchCount, 2);
		assert.strictEqual(service.getSegments()[0].label, 'High');
		service.dispose();
	});

	test('changing timeframe refetches both endpoints', async () => {
		mockInsightsApis();
		let fetchCount = 0;
		const inner = globalThis.fetch;
		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			fetchCount += 1;
			return inner(input, init);
		}) as typeof fetch;

		const service = new ConversationInsightsService(mockAuth());
		await service.refresh('1D');
		assert.strictEqual(fetchCount, 2);
		await service.refresh('7D');
		assert.strictEqual(fetchCount, 4);
		service.dispose();
	});

	test('API error does not throw and reports error state', async () => {
		mockInsightsApis({ fail: true });
		const service = new ConversationInsightsService(mockAuth());
		const result = await service.refresh('MTD');
		assert.deepStrictEqual(result, []);
		assert.strictEqual(service.getState(), 'error');
		service.dispose();
	});

	test('empty response yields ready state with no segments', async () => {
		mockInsightsApis({ categories: [] });
		const service = new ConversationInsightsService(mockAuth());
		service.setMetric('categories');
		const result = await service.refresh('MTD');
		assert.deepStrictEqual(result, []);
		assert.strictEqual(service.getState(), 'ready');
		service.dispose();
	});
});

suite('Conversation Insights persistence', () => {
	const previousTimeframe = getConversationTimeframe();
	const previousMetric = getConversationMetric();

	teardown(async () => {
		await setConversationTimeframe(previousTimeframe);
		await setConversationMetric(previousMetric);
	});

	test('parse helpers validate timeframe and metric defaults', () => {
		assert.strictEqual(parseConversationTimeframe('7D'), '7D');
		assert.strictEqual(
			parseConversationTimeframe('nope'),
			DEFAULT_CONVERSATION_TIMEFRAME
		);
		assert.strictEqual(parseConversationMetric('workType'), 'workType');
		assert.strictEqual(
			parseConversationMetric('guidanceLevel'),
			DEFAULT_CONVERSATION_METRIC
		);
		assert.strictEqual(DEFAULT_CONVERSATION_TIMEFRAME, 'MTD');
		assert.strictEqual(DEFAULT_CONVERSATION_METRIC, 'categories');
	});

	test('persists selected timeframe', async () => {
		const next: ConversationTimeframe = '7D';
		await setConversationTimeframe(next);
		assert.strictEqual(getConversationTimeframe(), '7D');
	});

	test('persists selected metric', async () => {
		const next: ConversationMetric = 'taskComplexity';
		await setConversationMetric(next);
		assert.strictEqual(getConversationMetric(), 'taskComplexity');
	});
});
