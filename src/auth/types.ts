/**
 * Pluggable authentication. Swap ManualSessionProvider for Cursor CLI or OAuth later
 * without changing the API client or status bar.
 */
export interface AuthProvider {
	/** Whether a usable session is currently stored. */
	isAuthenticated(): Promise<boolean>;

	/**
	 * Headers required for authenticated Cursor API requests.
	 * Implementations must never log secret values.
	 */
	getAuthHeaders(): Promise<Record<string, string>>;

	/**
	 * Interactive connect flow.
	 * @returns true if authentication succeeded and a session is stored.
	 */
	connect(): Promise<boolean>;

	/** Clear any stored session. */
	disconnect(): Promise<void>;
}
