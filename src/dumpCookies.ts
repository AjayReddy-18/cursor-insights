import { log, logError } from './logger';

interface ElectronCookie {
	name: string;
	domain?: string;
}

interface ElectronModule {
	session: {
		defaultSession: {
			cookies: {
				get(filter: Record<string, never>): Promise<ElectronCookie[]>;
			};
		};
	};
}

/**
 * Temporary diagnostic: list Electron session cookie names/domains only.
 * Never logs cookie values.
 */
export async function dumpCookies(): Promise<void> {
	log('Dump cookies: started');

	let electron: ElectronModule;
	try {
		// Electron is provided by the host runtime; it is not a package dependency.
		electron = require('electron') as ElectronModule;
	} catch (error) {
		logError('Failed to import electron:', error);
		return;
	}

	try {
		const cookies = await electron.session.defaultSession.cookies.get({});
		log(`Dump cookies: found ${cookies.length} cookie(s)`);

		for (const cookie of cookies) {
			log(`name=${cookie.name}; domain=${cookie.domain ?? '(none)'}`);
		}

		log('Dump cookies: finished');
	} catch (error) {
		logError('Failed to read Electron cookies:', error);
	}
}
