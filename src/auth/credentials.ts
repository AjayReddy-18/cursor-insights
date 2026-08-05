import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CursorCredentials {
	accessToken: string;
	/** Cursor user id from JWT sub, e.g. user_01... */
	userId: string;
}

const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';

function stateDbPath(): string {
	const home = os.homedir();
	if (process.platform === 'darwin') {
		return path.join(
			home,
			'Library',
			'Application Support',
			'Cursor',
			'User',
			'globalStorage',
			'state.vscdb'
		);
	}
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
		return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
	}
	const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
	return path.join(config, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
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

function extractUserId(accessToken: string): string {
	const payload = decodeJwtPayload(accessToken);
	const sub = String(payload.sub || '');
	const pipe = sub.includes('|') ? sub.split('|').pop() || '' : sub;
	if (pipe.startsWith('user_')) {
		return pipe;
	}
	const match = sub.match(/user_[A-Za-z0-9]+/);
	if (match) {
		return match[0];
	}
	throw new Error('Could not extract user_ id from accessToken JWT sub');
}

function credentialsFromAccessToken(accessToken: string): CursorCredentials {
	const trimmed = accessToken.trim();
	if (!trimmed) {
		throw new Error('cursorAuth/accessToken is empty — is Cursor signed in?');
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
				get: (...params: unknown[]) => { value?: string } | undefined;
			};
			close: () => void;
		};
	};

	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(ACCESS_TOKEN_KEY);
		const value = row?.value;
		if (typeof value !== 'string' || !value) {
			throw new Error('cursorAuth/accessToken missing — is Cursor signed in?');
		}
		return value;
	} finally {
		db.close();
	}
}

/** Fallback when node:sqlite is unavailable in the extension host. */
async function readAccessTokenViaSqliteCli(dbPath: string): Promise<string> {
	const sql = `SELECT value FROM ItemTable WHERE key='${ACCESS_TOKEN_KEY}';`;
	try {
		const { stdout } = await execFileAsync('sqlite3', [dbPath, sql], {
			maxBuffer: 2 * 1024 * 1024,
			timeout: 15_000,
		});
		const value = stdout.trim();
		if (!value) {
			throw new Error('cursorAuth/accessToken missing — is Cursor signed in?');
		}
		return value;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('cursorAuth/accessToken missing')) {
			throw error;
		}
		throw new Error(
			`Failed to read Cursor state DB via sqlite3 CLI: ${message}`
		);
	}
}

async function readAccessToken(dbPath: string): Promise<string> {
	try {
		return readAccessTokenViaNodeSqlite(dbPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// Missing token is definitive — don't fall through to CLI.
		if (message.includes('cursorAuth/accessToken missing')) {
			throw error;
		}
		// node:sqlite missing / unsupported → CLI fallback.
		return readAccessTokenViaSqliteCli(dbPath);
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

	const accessToken = await readAccessToken(dbPath);
	return credentialsFromAccessToken(accessToken);
}
