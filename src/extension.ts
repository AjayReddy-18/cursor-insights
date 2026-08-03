import * as vscode from 'vscode';
import { CursorStatsStatusBar, REFRESH_COMMAND } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
	const statusBar = new CursorStatsStatusBar();

	const refreshCommand = vscode.commands.registerCommand(
		REFRESH_COMMAND,
		() => statusBar.refresh()
	);

	context.subscriptions.push(statusBar, refreshCommand);
}

export function deactivate(): void {}
