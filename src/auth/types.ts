/**
 * Pluggable authentication for Cursor API requests.
 */
export interface AuthProvider {
	/** Whether a usable Cursor login is available on this machine. */
	isAuthenticated(): Promise<boolean>;

	/**
	 * Headers required for authenticated Cursor API requests.
	 * Implementations must never log secret values.
	 */
	getAuthHeaders(): Promise<Record<string, string>>;
}
