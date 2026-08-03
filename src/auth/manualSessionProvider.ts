import * as vscode from 'vscode';
import { log, logError } from '../logger';
import type { AuthProvider } from './types';

const SECRET_KEY = 'cursor-stats.workosCursorSessionToken';
const COOKIE_NAME = 'WorkosCursorSessionToken';

/**
 * Auth via a manually pasted WorkosCursorSessionToken.
 * Token is stored only in vscode.SecretStorage — never in settings or files.
 */
export class ManualSessionProvider implements AuthProvider {
	constructor(private readonly secrets: vscode.SecretStorage) {}

	async isAuthenticated(): Promise<boolean> {
		const token = await this.secrets.get(SECRET_KEY);
		return Boolean(token);
	}

	async getAuthHeaders(): Promise<Record<string, string>> {
		const token = await this.secrets.get(SECRET_KEY);
		if (!token) {
			throw new Error('Not authenticated. Connect your Cursor account first.');
		}

		return {
			Cookie: `${COOKIE_NAME}=${token}`,
		};
	}

	async connect(): Promise<boolean> {
		log('Authentication started');

		try {
			const token = await vscode.window.showInputBox({
				title: 'Cursor Stats: Connect Account',
				prompt: 'Paste your WorkosCursorSessionToken',
				placeHolder: 'WorkosCursorSessionToken',
				password: true,
				ignoreFocusOut: true,
				validateInput: (value) => {
					if (!value.trim()) {
						return 'Token cannot be empty';
					}
					return undefined;
				},
			});

			if (token === undefined) {
				log('Authentication cancelled');
				return false;
			}

			const trimmed = token.trim();
			await this.secrets.store(SECRET_KEY, trimmed);
			log('Authentication completed');
			return true;
		} catch (error) {
			logError('Authentication failed:', error);
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		await this.secrets.delete(SECRET_KEY);
		log('Account disconnected');
	}
}
