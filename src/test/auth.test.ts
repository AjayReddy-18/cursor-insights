import * as assert from 'assert';
import { createCipheriv, pbkdf2Sync } from 'crypto';
import {
	credentialsFromAccessToken,
	decryptCursorSafeStorageToken,
	isCursorSafeStorageToken,
} from '../auth/credentials';

function jwtWithSubject(sub: string): string {
	const encode = (value: object): string =>
		Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${encode({ alg: 'none' })}.${encode({ sub })}.signature`;
}

suite('Cursor credential parsing', () => {
	test('extracts user id from auth0-style JWT subject', () => {
		const credentials = credentialsFromAccessToken(
			jwtWithSubject('auth0|user_01ABC')
		);
		assert.strictEqual(credentials.userId, 'user_01ABC');
		assert.ok(credentials.accessToken.length > 0);
	});

	test('extracts credentials from a stored WorkOS session value', () => {
		const credentials = credentialsFromAccessToken(
			'user_01ABC::eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdXRoMHx1c2VyXzAxQUJDIn0.signature'
		);
		assert.strictEqual(credentials.userId, 'user_01ABC');
		assert.strictEqual(
			credentials.accessToken,
			'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdXRoMHx1c2VyXzAxQUJDIn0.signature'
		);
	});

	test('extracts an access token from a JSON storage value', () => {
		const token = jwtWithSubject('auth0|user_01JSON');
		const credentials = credentialsFromAccessToken(
			JSON.stringify({ accessToken: token })
		);
		assert.strictEqual(credentials.userId, 'user_01JSON');
		assert.strictEqual(credentials.accessToken, token);
	});

	test('uses a cached user id for opaque access tokens', () => {
		const credentials = credentialsFromAccessToken(
			'an-opaque-access-token',
			'user_01OPAQUE'
		);
		assert.strictEqual(credentials.userId, 'user_01OPAQUE');
		assert.strictEqual(credentials.accessToken, 'an-opaque-access-token');
	});

	test('decrypts Cursor 3.27 Safe Storage sessions', () => {
		const token = jwtWithSubject('auth0|user_01SAFE');
		const password = 'test-safe-storage-password';
		const key = pbkdf2Sync(
			Buffer.from(password, 'utf8'),
			'saltysalt',
			1003,
			16,
			'sha1'
		);
		const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
		const encrypted = Buffer.concat([
			Buffer.from('v10'),
			cipher.update(token, 'utf8'),
			cipher.final(),
		]);
		const stored = `cursor-safe-storage:v1:${encrypted.toString('base64')}`;

		assert.strictEqual(isCursorSafeStorageToken(stored), true);
		assert.strictEqual(decryptCursorSafeStorageToken(stored, password), token);
		assert.strictEqual(
			credentialsFromAccessToken(decryptCursorSafeStorageToken(stored, password) || '').userId,
			'user_01SAFE'
		);
	});
});
