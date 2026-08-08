'use strict';

/**
 * Minimal vscode stub so Conversation Insights unit tests can run under mocha
 * without downloading a full VS Code test electron.
 */
const Module = require('module');
const originalLoad = Module._load;

const configStore = new Map();

const vscode = {
	window: {
		createOutputChannel() {
			return {
				appendLine() {},
				show() {},
				dispose() {},
			};
		},
		showWarningMessage: async () => undefined,
		showInformationMessage: async () => undefined,
	},
	workspace: {
		getConfiguration(section) {
			return {
				get(key, defaultValue) {
					const fullKey = section ? `${section}.${key}` : key;
					return configStore.has(fullKey)
						? configStore.get(fullKey)
						: defaultValue;
				},
				async update(key, value) {
					const fullKey = section ? `${section}.${key}` : key;
					configStore.set(fullKey, value);
				},
			};
		},
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3,
	},
	Disposable: class {
		constructor(callOnDispose) {
			this._callOnDispose = callOnDispose;
		}
		dispose() {
			if (this._callOnDispose) {
				this._callOnDispose();
			}
		}
	},
	Uri: {
		parse(value) {
			return { toString: () => value };
		},
	},
	env: {
		openExternal: async () => true,
	},
	commands: {
		executeCommand: async () => undefined,
		registerCommand: () => ({ dispose() {} }),
	},
};

Module._load = function (request, parent, isMain) {
	if (request === 'vscode') {
		return vscode;
	}
	return originalLoad(request, parent, isMain);
};

module.exports = vscode;
