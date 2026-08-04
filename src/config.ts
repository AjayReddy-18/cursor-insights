import * as vscode from 'vscode';

export const DEFAULT_ALERT_THRESHOLD = 2;
export const ALERT_THRESHOLD_MIN = 1;
export const ALERT_THRESHOLD_MAX = 10;

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
