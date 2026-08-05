import { log, logError } from '../logger';
import { loadCursorCredentials } from './credentials';
import type { AuthProvider } from './types';

/**
 * Cookie name expected by cursor.com dashboard APIs.
 * Value is synthesized from the local IDE access token — never pasted or stored by us.
 */
const DASHBOARD_SESSION_COOKIE = 'WorkosCursorSessionToken';

/**
 * Auth via Cursor's local login (state.vscdb accessToken).
 */
export class LocalCursorAuthProvider implements AuthProvider {
	private lastAuthError: string | undefined;

	async isAuthenticated(): Promise<boolean> {
		try {
			const credentials = await loadCursorCredentials();
			if (this.lastAuthError) {
				log(`Cursor login available (user=${credentials.userId})`);
				this.lastAuthError = undefined;
			}
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message !== this.lastAuthError) {
				logError('Cursor login unavailable:', message);
				this.lastAuthError = message;
			}
			return false;
		}
	}

	async getAuthHeaders(): Promise<Record<string, string>> {
		const { userId, accessToken } = await loadCursorCredentials();
		// Same cookie shape the browser sets: userId%3A%3AaccessToken (%3A%3A = "::")
		const sessionValue = `${userId}%3A%3A${accessToken}`;
		return {
			Cookie: `${DASHBOARD_SESSION_COOKIE}=${sessionValue}`,
		};
	}
}
