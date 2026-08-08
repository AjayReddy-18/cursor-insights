import * as vscode from 'vscode';
import {
	CONVERSATION_METRICS,
	CONVERSATION_TIMEFRAMES,
	type ConversationMetric,
	type ConversationTimeframe,
} from './models/conversationInsights';

export const DEFAULT_ALERT_THRESHOLD = 2;
export const ALERT_THRESHOLD_MIN = 1;
export const ALERT_THRESHOLD_MAX = 10;

export const DEFAULT_CONVERSATION_TIMEFRAME: ConversationTimeframe = 'MTD';
export const DEFAULT_CONVERSATION_METRIC: ConversationMetric = 'categories';

/** Reads and clamps the configured alert threshold (USD). */
export function getAlertThreshold(): number {
	const raw = vscode.workspace
		.getConfiguration('cursorInsights')
		.get<number>('alertThreshold', DEFAULT_ALERT_THRESHOLD);

	if (typeof raw !== 'number' || Number.isNaN(raw)) {
		return DEFAULT_ALERT_THRESHOLD;
	}

	return clampAlertThreshold(raw);
}

export function clampAlertThreshold(value: number): number {
	return Math.min(ALERT_THRESHOLD_MAX, Math.max(ALERT_THRESHOLD_MIN, value));
}

/** Persists the alert threshold to user settings. */
export async function setAlertThreshold(value: number): Promise<void> {
	await vscode.workspace.getConfiguration('cursorInsights').update(
		'alertThreshold',
		clampAlertThreshold(value),
		vscode.ConfigurationTarget.Global
	);
}

export function parseConversationTimeframe(
	value: unknown
): ConversationTimeframe {
	if (
		typeof value === 'string' &&
		(CONVERSATION_TIMEFRAMES as readonly string[]).includes(value)
	) {
		return value as ConversationTimeframe;
	}
	return DEFAULT_CONVERSATION_TIMEFRAME;
}

export function parseConversationMetric(value: unknown): ConversationMetric {
	if (
		typeof value === 'string' &&
		(CONVERSATION_METRICS as readonly string[]).includes(value)
	) {
		return value as ConversationMetric;
	}
	return DEFAULT_CONVERSATION_METRIC;
}

/** Reads the persisted Conversation Insights timeframe (default MTD). */
export function getConversationTimeframe(): ConversationTimeframe {
	const raw = vscode.workspace
		.getConfiguration('cursorInsights')
		.get<string>('conversationInsightsTimeframe', DEFAULT_CONVERSATION_TIMEFRAME);
	return parseConversationTimeframe(raw);
}

/** Persists the Conversation Insights timeframe. */
export async function setConversationTimeframe(
	value: ConversationTimeframe
): Promise<void> {
	await vscode.workspace.getConfiguration('cursorInsights').update(
		'conversationInsightsTimeframe',
		parseConversationTimeframe(value),
		vscode.ConfigurationTarget.Global
	);
}

/** Reads the persisted Conversation Insights metric (default Categories). */
export function getConversationMetric(): ConversationMetric {
	const raw = vscode.workspace
		.getConfiguration('cursorInsights')
		.get<string>('conversationInsightsMetric', DEFAULT_CONVERSATION_METRIC);
	return parseConversationMetric(raw);
}

/** Persists the Conversation Insights metric. */
export async function setConversationMetric(
	value: ConversationMetric
): Promise<void> {
	await vscode.workspace.getConfiguration('cursorInsights').update(
		'conversationInsightsMetric',
		parseConversationMetric(value),
		vscode.ConfigurationTarget.Global
	);
}
