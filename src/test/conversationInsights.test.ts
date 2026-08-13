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
import {
	buildPlacedLabels,
	computeLayout,
	conversationChartHoverScript,
	formatPercent,
	renderConversationDoughnut,
	resolveCollisions,
} from '../sidebar/conversationChart';

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
		categories_histogram: [
			{ category: 'Code Explanation', count: 5 },
			{ category: 'Configuration', count: 4 },
			{ category: 'Architecture', count: 4 },
			{ category: 'Bug Fixing & Debugging', count: 3 },
			{ category: 'Learning', count: 2 },
			{ category: 'API Integration', count: 2 },
			{ category: 'Testing', count: 1 },
			{ category: 'Security', count: 1 },
			{ category: 'New Features', count: 1 },
		],
		// Prompt Specificity comes from conversation-segments, not classification.
		guidance_level_distribution: [
			{ guidance_level: 'high', count: 65 },
			{ guidance_level: 'medium', count: 5 },
			{ guidance_level: 'low', count: 5 },
		],
	};

	test('parses conversation-classification response fields', () => {
		const parsed = parseConversationClassification(classificationFixture);
		assert.strictEqual(parsed.intentDistribution.length, 4);
		assert.strictEqual(parsed.categoriesHistogram[0].label, 'New Features');
		assert.strictEqual(parsed.complexityDistribution[2].label, 'medium');
		assert.strictEqual(parsed.guidanceLevelDistribution[0].label, 'low');
	});

	test('parses conversation-segments work_type, categories, and guidance_level histograms', () => {
		const parsed = parseConversationSegments(segmentsFixture);
		assert.deepStrictEqual(parsed.workTypeHistogram, [
			{ label: 'ktlo', count: 6 },
			{ label: 'bug', count: 3 },
		]);
		assert.strictEqual(parsed.categoriesHistogram[0].label, 'Code Explanation');
		assert.strictEqual(parsed.categoriesHistogram[3].label, 'Bug Fixing & Debugging');
		// guidance_level_distribution must be parsed from segments
		assert.deepStrictEqual(parsed.guidanceLevelDistribution, [
			{ label: 'high', count: 65 },
			{ label: 'medium', count: 5 },
			{ label: 'low', count: 5 },
		]);
	});

	test('handles malformed and missing histogram fields', () => {
		assert.deepStrictEqual(parseConversationClassification(null).categoriesHistogram, []);
		assert.deepStrictEqual(parseConversationSegments(undefined).workTypeHistogram, []);
		assert.deepStrictEqual(parseConversationSegments(undefined).categoriesHistogram, []);
		// Missing guidance_level_distribution in segments yields empty array
		assert.deepStrictEqual(parseConversationSegments(undefined).guidanceLevelDistribution, []);
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
		// Categories come from segments — same series Cursor's Categories chart uses.
		assert.strictEqual(
			getHistogramForMetric(payload, 'categories')[0].label,
			'Code Explanation'
		);
		assert.strictEqual(
			getHistogramForMetric(payload, 'taskComplexity')[0].label,
			'trivial'
		);
		// Prompt Specificity MUST read from segments.guidanceLevelDistribution,
		// NOT from classification.guidanceLevelDistribution.
		// segmentsFixture has high=65 (first entry); classificationFixture has low=3 (first entry).
		assert.strictEqual(
			getHistogramForMetric(payload, 'promptSpecificity')[0].label,
			'high'
		);
		assert.notStrictEqual(
			getHistogramForMetric(payload, 'promptSpecificity')[0].label,
			'low',
			'promptSpecificity must NOT use classification.guidanceLevelDistribution'
		);
	});

	test('Prompt Specificity percentages match verified 7-day data (high=86.7%, medium=6.7%, low=6.7%)', () => {
		// Verified against Cursor dashboard for 7D: high=65, medium=5, low=5 → total=75
		const segmentsWithVerifiedData = {
			work_type_histogram: [],
			categories_histogram: [],
			guidance_level_distribution: [
				{ guidance_level: 'high', count: 65 },
				{ guidance_level: 'medium', count: 5 },
				{ guidance_level: 'low', count: 5 },
			],
		};
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: parseConversationSegments(segmentsWithVerifiedData),
		};
		const segments = getChartSegmentsForMetric(payload, 'promptSpecificity');
		assert.strictEqual(segments.length, 3);
		const high = segments.find((s) => s.label === 'High');
		const medium = segments.find((s) => s.label === 'Medium');
		const low = segments.find((s) => s.label === 'Low');
		assert.ok(high, 'missing High segment');
		assert.ok(medium, 'missing Medium segment');
		assert.ok(low, 'missing Low segment');
		assert.strictEqual(Number(high!.percent.toFixed(1)), 86.7);
		assert.strictEqual(Number(medium!.percent.toFixed(1)), 6.7);
		assert.strictEqual(Number(low!.percent.toFixed(1)), 6.7);
	});

	test('Prompt Specificity uses segments, other metrics remain on their original sources', () => {
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: parseConversationSegments(segmentsFixture),
		};
		// intentDistribution — classification
		assert.strictEqual(getHistogramForMetric(payload, 'intentDistribution')[0].label, 'Ask');
		// taskComplexity — classification
		assert.strictEqual(getHistogramForMetric(payload, 'taskComplexity')[0].label, 'trivial');
		// workType — segments
		assert.strictEqual(getHistogramForMetric(payload, 'workType')[0].label, 'ktlo');
		// categories — segments
		assert.strictEqual(getHistogramForMetric(payload, 'categories')[0].label, 'Code Explanation');
		// promptSpecificity — segments (not classification)
		const ps = getHistogramForMetric(payload, 'promptSpecificity');
		assert.strictEqual(ps[0].label, 'high');
		assert.strictEqual(ps[0].count, 65);
	});

	test('empty/missing guidance_level_distribution in segments yields empty state for Prompt Specificity', () => {
		const emptySegments = parseConversationSegments({
			work_type_histogram: [],
			categories_histogram: [],
			// no guidance_level_distribution key
		});
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: emptySegments,
		};
		const segments = getChartSegmentsForMetric(payload, 'promptSpecificity');
		assert.deepStrictEqual(segments, [], 'missing distribution must yield empty chart segments');
	});

	test('preserves Cursor category names exactly and formats work-type tokens', () => {
		assert.strictEqual(
			formatInsightLabel('Bug Fixing & Debugging'),
			'Bug Fixing & Debugging'
		);
		assert.strictEqual(formatInsightLabel('Code Explanation'), 'Code Explanation');
		assert.strictEqual(formatInsightLabel('New Features'), 'New Features');
		assert.strictEqual(formatInsightLabel('ktlo'), 'Ktlo');
		assert.strictEqual(formatInsightLabel('new_feature'), 'New Feature');

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
	});

	test('empty histogram yields no chart segments', () => {
		assert.deepStrictEqual(toChartSegments([]), []);
		assert.deepStrictEqual(toChartSegments([{ label: 'x', count: 0 }]), []);
	});

	test('Categories metric matches Cursor segments percentage distribution', () => {
		const payload: ConversationInsightsPayload = {
			classification: parseConversationClassification(classificationFixture),
			segments: parseConversationSegments(segmentsFixture),
		};
		const segments = getChartSegmentsForMetric(payload, 'categories');
		assert.strictEqual(segments.length, 9);
		assert.strictEqual(segments[0].label, 'Code Explanation');
		assert.strictEqual(Number(segments[0].percent.toFixed(1)), 21.7);
		assert.strictEqual(Number(segments[1].percent.toFixed(1)), 17.4);
		assert.strictEqual(Number(segments[2].percent.toFixed(1)), 17.4);
		assert.strictEqual(Number(segments[3].percent.toFixed(1)), 13.0);
		assert.strictEqual(segments[3].label, 'Bug Fixing & Debugging');
		assert.strictEqual(Number(segments[8].percent.toFixed(1)), 4.3);
		assert.strictEqual(segments[8].label, 'New Features');
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
						categories_histogram: [
							{ category: 'Code Explanation', count: 5 },
							{ category: 'Bug Fixing & Debugging', count: 3 },
						],
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
		assert.strictEqual(payload.segments.categoriesHistogram[0].label, 'Code Explanation');
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
		guidanceLevelDistribution?: Array<{ guidance_level: string; count: number }>;
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
						categories_histogram: [
							{ category: 'Classification Only', count: 99 },
						],
						complexity_distribution: [{ complexity: 'low', count: 3 }],
						// Classification also has guidance_level_distribution, but
						// Prompt Specificity must NOT use this — it uses segments.
						guidance_level_distribution: [{ guidance_level: 'high', count: 5 }],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({
					work_type_histogram: [{ work_type: 'ktlo', count: 9 }],
					categories_histogram: options?.categories ?? [
						{ category: 'Code Explanation', count: 6 },
						{ category: 'Bug Fixing & Debugging', count: 2 },
					],
					// Verified 7-day data from Cursor dashboard: high=65, medium=5, low=5
					guidance_level_distribution: options?.guidanceLevelDistribution ?? [
						{ guidance_level: 'high', count: 65 },
						{ guidance_level: 'medium', count: 5 },
						{ guidance_level: 'low', count: 5 },
					],
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
		assert.strictEqual(service.getSegments()[0].label, 'Code Explanation');

		service.setMetric('workType');
		assert.strictEqual(fetchCount, 2);
		assert.strictEqual(service.getSegments()[0].label, 'Ktlo');
		assert.strictEqual(service.getMetric(), 'workType');

		// Prompt Specificity uses conversation-segments.guidance_level_distribution.
		// mockInsightsApis returns high=65, medium=5, low=5 in the segments response.
		// classification has guidance_level: 'high', count: 5 (a different dataset).
		// The first segment must be 'High' with count=65 (from segments, not classification).
		service.setMetric('promptSpecificity');
		assert.strictEqual(fetchCount, 2, 'metric change must not trigger another API call');
		const psSegments = service.getSegments();
		assert.strictEqual(psSegments[0].label, 'High');
		assert.strictEqual(psSegments[0].count, 65, 'must read from segments (count=65), not classification (count=5)');
		assert.strictEqual(Number(psSegments[0].percent.toFixed(1)), 86.7);
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

suite('Conversation Insights donut visualization', () => {
	const cursorParitySegments = toChartSegments([
		{ label: 'Code Explanation', count: 5 },
		{ label: 'Configuration', count: 4 },
		{ label: 'Architecture', count: 4 },
		{ label: 'Bug Fixing & Debugging', count: 3 },
		{ label: 'Learning', count: 2 },
		{ label: 'API Integration', count: 2 },
		{ label: 'Testing', count: 1 },
		{ label: 'Security', count: 1 },
		{ label: 'New Features', count: 1 },
	]);

	function assertDonutStructure(svg: string, labels: string[]): void {
		assert.ok(svg.includes('data-chart="conversation-donut"'));
		assert.ok(svg.includes('donut-slice') || svg.includes('donut-slices'));
		for (const label of labels) {
			const escaped = label.replace(/&/g, '&amp;');
			assert.ok(
				svg.includes(escaped) || svg.includes(label),
				`missing label ${label}`
			);
		}
		const leaders = svg.match(/class="donut-leader"/g) || [];
		const labelNodes = svg.match(/class="chart-label"/g) || [];
		assert.strictEqual(leaders.length, labels.length);
		assert.strictEqual(labelNodes.length, labels.length);
		assert.ok(!svg.includes('bar-chart'));
		assert.ok(!svg.includes('<table'));
	}

	test('always renders a donut with leader lines for Cursor parity dataset', () => {
		const svg = renderConversationDoughnut(cursorParitySegments);
		assertDonutStructure(
			svg,
			cursorParitySegments.map((segment) => segment.label)
		);
		assert.ok(svg.includes('Bug Fixing &amp; Debugging'));
		assert.ok(svg.includes('21.7%'));
		assert.ok(svg.includes('Code Explanation: 5 (21.7%)'));
	});

	test('renders donut for 2, 4, 9, and 15+ categories', () => {
		const sets = [
			toChartSegments([
				{ label: 'A', count: 1 },
				{ label: 'B', count: 1 },
			]),
			toChartSegments([
				{ label: 'A', count: 1 },
				{ label: 'B', count: 1 },
				{ label: 'C', count: 1 },
				{ label: 'D', count: 1 },
			]),
			cursorParitySegments,
			toChartSegments(
				Array.from({ length: 16 }, (_, index) => ({
					label: `Category ${index + 1}`,
					count: 16 - index,
				}))
			),
		];

		for (const set of sets) {
			const svg = renderConversationDoughnut(set, { width: 220 });
			assertDonutStructure(
				svg,
				set.map((segment) => segment.label)
			);
		}
	});

	test('keeps long category names readable without ellipsis truncation', () => {
		const segments = toChartSegments([
			{ label: 'Bug Fixing & Debugging', count: 3 },
			{ label: 'Very Long Category Name For Integration Testing', count: 2 },
		]);
		const svg = renderConversationDoughnut(segments, { width: 200 });
		assert.ok(svg.includes('Bug Fixing &amp; Debugging'));
		assert.ok(svg.includes('Very Long Category Name For Integration Testing'));
		assert.ok(!svg.includes('…'));
		assert.ok(!/Bug Fixing[^<]*\.\.\./.test(svg));
	});

	test('collision resolution separates neighbouring label Y positions', () => {
		const layout = computeLayout(9, 220);
		const crowded = [
			{ labelY: 100, lines: ['one'] },
			{ labelY: 101, lines: ['two'] },
			{ labelY: 102, lines: ['three'] },
		];
		resolveCollisions(crowded, layout);
		assert.ok(crowded[1].labelY - crowded[0].labelY >= layout.minLabelSpacing);
		assert.ok(crowded[2].labelY - crowded[1].labelY >= layout.minLabelSpacing);
	});

	test('placed labels include leader geometry and full tooltips', () => {
		const layout = computeLayout(cursorParitySegments.length, 240);
		const total = cursorParitySegments.reduce((sum, s) => sum + s.count, 0);
		const placed = buildPlacedLabels(cursorParitySegments, total, layout);
		assert.strictEqual(placed.length, 9);
		for (const item of placed) {
			assert.ok(Number.isFinite(item.sliceX));
			assert.ok(Number.isFinite(item.elbowX));
			assert.ok(Number.isFinite(item.labelX));
			assert.ok(item.tooltip.includes(item.segment.label));
			assert.ok(item.tooltip.includes(String(item.segment.count)));
			assert.ok(item.tooltip.includes('%'));
		}
	});

	test('hover script dims inactive categories via is-dimmed class toggles', () => {
		const script = conversationChartHoverScript();
		assert.ok(script.includes('is-dimmed'));
		assert.ok(script.includes('is-active'));
		assert.ok(script.includes('data-index'));
		assert.ok(script.includes('mouseenter'));
		assert.ok(script.includes('mouseleave'));
	});

	test('narrow sidebar width still keeps every category', () => {
		const svg = renderConversationDoughnut(cursorParitySegments, { width: 180 });
		assertDonutStructure(
			svg,
			cursorParitySegments.map((segment) => segment.label)
		);
	});

	test('percent formatting matches Cursor one-decimal style', () => {
		assert.strictEqual(formatPercent(21.739), '21.7%');
		assert.strictEqual(formatPercent(50), '50%');
	});
});
