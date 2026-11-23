import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { createDecipheriv, pbkdf2Sync } from 'crypto';

const execFileAsync = promisify(execFile);

export interface CursorCredentials {
	accessToken: string;
	/** Cursor user id from JWT sub, e.g. user_01... */
	userId: string;
}

const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';
const ACCESS_TOKEN_KEY_CANDIDATES = [
	ACCESS_TOKEN_KEY,
	'cursorAuth/access_token',
	'cursorAuth/workosToken',
	'cursorAuth/workosCursorSessionToken',
	'cursorAuth/refreshToken',
	'workosCursorSessionToken',
] as const;
const USER_ID_KEY_CANDIDATES = [
	'cursorAuth/userId',
	'cursorAuth/cachedUserId',
	'cursorAuth/currentUserId',
	'cursorAccountId',
] as const;
const CURSOR_SAFE_STORAGE_PREFIX = 'cursor-safe-storage:';
const CURSOR_SAFE_STORAGE_SERVICE = 'Cursor Safe Storage';
const CURSOR_SAFE_STORAGE_ACCOUNTS = ['Cursor Key', 'Cursor'];

function stateDbPath(): string {
	const home = os.homedir();
	if (process.platform === 'darwin') {
		const supportDir = path.join(home, 'Library', 'Application Support');
		const candidates = [
			path.join(supportDir, 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
			path.join(supportDir, 'Cursor Insiders', 'User', 'globalStorage', 'state.vscdb'),
			path.join(supportDir, 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb'),
		];
		const found = candidates.find((candidate) => fs.existsSync(candidate));
		return found || candidates[0];
	}
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
		const candidates = [
			path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
			path.join(appData, 'Cursor Insiders', 'User', 'globalStorage', 'state.vscdb'),
		];
		const found = candidates.find((candidate) => fs.existsSync(candidate));
		return found || candidates[0];
	}
	const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
	const candidates = [
		path.join(config, 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
		path.join(config, 'Cursor Insiders', 'User', 'globalStorage', 'state.vscdb'),
		path.join(config, 'cursor-nightly', 'User', 'globalStorage', 'state.vscdb'),
	];
	const found = candidates.find((candidate) => fs.existsSync(candidate));
	return found || candidates[0];
}

function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split('.');
	if (parts.length < 2) {
		return {};
	}
	const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
	try {
		return JSON.parse(Buffer.from(pad, 'base64').toString('utf8')) as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

export function isCursorSafeStorageToken(token: string): boolean {
	return token.startsWith(CURSOR_SAFE_STORAGE_PREFIX);
}

export function decryptCursorSafeStorageToken(
	encryptedToken: string,
	password: string
): string | null {
	if (!isCursorSafeStorageToken(encryptedToken)) {
		return encryptedToken;
	}
	const rest = encryptedToken.slice(CURSOR_SAFE_STORAGE_PREFIX.length);
	const separatorIndex = rest.indexOf(':');
	if (separatorIndex < 0 || rest.slice(0, separatorIndex) !== 'v1') {
		return null;
	}
	const blob = Buffer.from(rest.slice(separatorIndex + 1), 'base64');
	if (blob.length < 4 || blob.subarray(0, 3).toString('utf8') !== 'v10') {
		return null;
	}
	try {
		const key = pbkdf2Sync(
			Buffer.from(password.trim(), 'utf8'),
			'saltysalt',
			1003,
			16,
			'sha1'
		);
		const decipher = createDecipheriv(
			'aes-128-cbc',
			key,
			Buffer.alloc(16, 0x20)
		);
		const plaintext = Buffer.concat([
			decipher.update(blob.subarray(3)),
			decipher.final(),
		]).toString('utf8').trim();
		return plaintext || null;
	} catch {
		return null;
	}
}

async function readCursorSafeStoragePassword(): Promise<string | null> {
	if (process.platform !== 'darwin') {
		return null;
	}
	for (const account of CURSOR_SAFE_STORAGE_ACCOUNTS) {
		try {
			const { stdout } = await execFileAsync(
				'security',
				[
					'find-generic-password',
					'-w',
					'-s',
					CURSOR_SAFE_STORAGE_SERVICE,
					'-a',
					account,
				],
				{ timeout: 15_000 }
			);
			const password = stdout.trim();
			if (password) {
				return password;
			}
		} catch {
			// Try the alternate account name used by older Cursor builds.
		}
	}
	return null;
}

function extractUserId(accessToken: string): string {
	const payload = decodeJwtPayload(accessToken);
	const candidates = [payload.sub, payload.user_id, payload.userId, payload.id];
	for (const candidate of candidates) {
		const value = String(candidate || '');
		const pipe = value.includes('|') ? value.split('|').pop() || '' : value;
		if (pipe.startsWith('user_')) {
			return pipe;
		}
		const match = value.match(/user_[A-Za-z0-9]+/);
		if (match) {
			return match[0];
		}
	}
	throw new Error('Could not extract user_ id from accessToken JWT sub');
}

export function credentialsFromAccessToken(
	accessToken: string,
	cachedUserId?: string
): CursorCredentials {
	let trimmed = accessToken.trim();
	if (trimmed.startsWith('WorkosCursorSessionToken=')) {
		trimmed = trimmed.slice('WorkosCursorSessionToken='.length);
	}
	if (trimmed.includes('%3A%3A')) {
		trimmed = trimmed.replace(/%3A%3A/gi, '::');
	}
	if (trimmed.includes('::')) {
		const separatorIndex = trimmed.indexOf('::');
		const possibleUserId = trimmed.slice(0, separatorIndex);
		const possibleToken = trimmed.slice(separatorIndex + 2);
		if (possibleUserId.startsWith('user_') && possibleToken) {
			return {
				accessToken: possibleToken,
				userId: possibleUserId,
			};
		}
	}
	if (
		(trimmed.startsWith('{') && trimmed.endsWith('}')) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === 'string') {
				trimmed = parsed.trim();
			} else if (typeof parsed === 'object' && parsed !== null) {
				const record = parsed as Record<string, unknown>;
				const token = record.accessToken ?? record.access_token ?? record.token;
				if (typeof token === 'string') {
					trimmed = token.trim();
				}
				if (!cachedUserId) {
					for (const key of ['userId', 'user_id', 'sub', 'id']) {
						const value = record[key];
						if (typeof value === 'string') {
							const match = value.match(/user_[A-Za-z0-9]+/);
							if (match) {
								cachedUserId = match[0];
								break;
							}
						}
					}
				}
			}
		} catch {
			// Keep the original value and let validation report it.
		}
	}
	if (!trimmed) {
		throw new Error('cursorAuth/accessToken is empty — is Cursor signed in?');
	}
	const normalizedCachedUserId = cachedUserId?.trim();
	if (normalizedCachedUserId?.startsWith('user_')) {
		try {
			extractUserId(trimmed);
		} catch {
			return {
				accessToken: trimmed,
				userId: normalizedCachedUserId,
			};
		}
	}
	return {
		accessToken: trimmed,
		userId: extractUserId(trimmed),
	};
}

/**
 * Prefer Node's built-in sqlite — works with multi-GB Cursor state DBs.
 * sql.js cannot: Node refuses to readFileSync files > 2 GiB.
 */
function readAccessTokenViaNodeSqlite(dbPath: string): string {
	const { DatabaseSync } = require('node:sqlite') as {
		DatabaseSync: new (
			path: string,
			options?: { readOnly?: boolean }
		) => {
			prepare: (sql: string) => {
				get: (...params: unknown[]) => { value?: unknown } | undefined;
				all: (...params: unknown[]) => Array<{ key?: unknown; value?: unknown }>;
			};
			close: () => void;
		};
	};

	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		for (const key of ACCESS_TOKEN_KEY_CANDIDATES) {
			const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key);
			if (typeof row?.value === 'string' && row.value.trim()) {
				return row.value;
			}
		}
		const authRows = db.prepare(
			"SELECT key, value FROM ItemTable WHERE lower(key) LIKE '%cursorauth%'"
		).all();
		for (const row of authRows) {
			if (
				typeof row.key === 'string' &&
				typeof row.value === 'string' &&
				/(access.?token|workos.?token|session.?token)/i.test(row.key) &&
				row.value.trim()
			) {
				return row.value;
			}
		}
		throw new Error('cursorAuth/accessToken missing — is Cursor signed in?');
	} finally {
		db.close();
	}
}

/** Fallback when node:sqlite is unavailable in the extension host. */
async function readAccessTokenViaSqliteCli(dbPath: string): Promise<string> {
	const sqliteCandidates = [
		'sqlite3',
		'/opt/homebrew/bin/sqlite3',
		'/usr/local/bin/sqlite3',
		'/usr/bin/sqlite3',
	];
	let lastError: unknown;

	for (const sqlite of sqliteCandidates) {
		for (const key of ACCESS_TOKEN_KEY_CANDIDATES) {
			const escapedKey = key.replace(/'/g, "''");
			const sql = `SELECT value FROM ItemTable WHERE key='${escapedKey}' LIMIT 1;`;
			try {
				const { stdout } = await execFileAsync(sqlite, [dbPath, sql], {
					maxBuffer: 2 * 1024 * 1024,
					timeout: 15_000,
				});
				const value = stdout.trim();
				if (value && !/^(?:Error|SQL)/i.test(value)) {
					return value;
				}
			} catch (error) {
				lastError = error;
			}
		}
	}

	const message = lastError instanceof Error ? lastError.message : String(lastError || 'sqlite3 unavailable');
	throw new Error(
		`Failed to read Cursor state DB via sqlite3 CLI: ${message}`
	);
}

async function readAccessToken(dbPath: string): Promise<string> {
	try {
		return readAccessTokenViaNodeSqlite(dbPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		try {
			return await readAccessTokenViaSqliteCli(dbPath);
		} catch (cliError) {
			if (message.includes('cursorAuth/accessToken missing')) {
				throw error;
			}
			throw cliError;
		}
	}
}

function readCachedUserIdViaNodeSqlite(dbPath: string): string | undefined {
	const { DatabaseSync } = require('node:sqlite') as {
		DatabaseSync: new (
			path: string,
			options?: { readOnly?: boolean }
		) => {
			prepare: (sql: string) => {
				get: (...params: unknown[]) => { value?: unknown } | undefined;
				all: (...params: unknown[]) => Array<{ key?: unknown; value?: unknown }>;
			};
			close: () => void;
		};
	};

	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		for (const key of USER_ID_KEY_CANDIDATES) {
			const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key);
			if (typeof row?.value === 'string') {
				const match = row.value.match(/user_[A-Za-z0-9]+/);
				if (match) {
					return match[0];
				}
			}
		}
		const rows = db.prepare(
			"SELECT key, value FROM ItemTable WHERE lower(key) LIKE '%auth%' OR lower(key) LIKE '%account%'"
		).all();
		for (const row of rows) {
			if (typeof row.value !== 'string') {
				continue;
			}
			const match = row.value.match(/user_[A-Za-z0-9]+/);
			if (match) {
				return match[0];
			}
		}
		return undefined;
	} finally {
		db.close();
	}
}

/**
 * Read Cursor auth from local state.vscdb. Never logs token values.
 */
export async function loadCursorCredentials(): Promise<CursorCredentials> {
	const dbPath = stateDbPath();
	if (!fs.existsSync(dbPath)) {
		throw new Error(`Cursor state DB not found: ${dbPath}`);
	}

	let accessToken = await readAccessToken(dbPath);
	if (isCursorSafeStorageToken(accessToken)) {
		const password = await readCursorSafeStoragePassword();
		if (!password) {
			throw new Error(
				'Cursor session is encrypted and its macOS Safe Storage key is unavailable'
			);
		}
		const decrypted = decryptCursorSafeStorageToken(accessToken, password);
		if (!decrypted) {
			throw new Error(
				'Cursor session could not be unlocked from macOS Safe Storage'
			);
		}
		accessToken = decrypted;
	}
	let cachedUserId: string | undefined;
	try {
		cachedUserId = readCachedUserIdViaNodeSqlite(dbPath);
	} catch {
		cachedUserId = undefined;
	}
	return credentialsFromAccessToken(accessToken, cachedUserId);
}
