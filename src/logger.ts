import * as vscode from 'vscode';

const CHANNEL_NAME = 'Cursor Stats';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Creates the shared OutputChannel once and registers it for disposal.
 * Must be called during extension activation before any other logging.
 */
export function initLogger(context: vscode.ExtensionContext): void {
	if (outputChannel) {
		return;
	}

	outputChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
	context.subscriptions.push(outputChannel);
}

function getOutput(): vscode.OutputChannel {
	if (!outputChannel) {
		throw new Error('Logger not initialized. Call initLogger() during activation.');
	}
	return outputChannel;
}

/** Reveals the Output panel with the Cursor Stats channel selected. */
export function showLogs(): void {
	getOutput().show(true);
}

function timestamp(): string {
	return new Date().toISOString();
}

export function log(message: string): void {
	getOutput().appendLine(`[${timestamp()}] ${message}`);
}

export function logJson(label: string, data: unknown): void {
	log(label);
	getOutput().appendLine(JSON.stringify(data, null, 2));
}

export function logError(message: string, error: unknown): void {
	log(message);

	if (error instanceof Error) {
		getOutput().appendLine(error.stack ?? `${error.name}: ${error.message}`);
		return;
	}

	getOutput().appendLine(String(error));
}
