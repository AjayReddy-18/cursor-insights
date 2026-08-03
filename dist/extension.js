"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));

// src/statusBar.ts
var vscode = __toESM(require("vscode"));
var REFRESH_COMMAND = "cursor-stats.refresh";
var LOADING_TEXT = "\u26A1 Cursor Usage: Loading...";
var REFRESHING_TEXT = "$(sync~spin) Refreshing...";
var CursorStatsStatusBar = class {
  statusBarItem;
  refreshTimeout;
  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.text = LOADING_TEXT;
    this.statusBarItem.tooltip = "Refresh Cursor usage";
    this.statusBarItem.command = REFRESH_COMMAND;
    this.statusBarItem.show();
  }
  async refresh() {
    this.clearRefreshTimeout();
    this.statusBarItem.text = REFRESHING_TEXT;
    await new Promise((resolve) => {
      this.refreshTimeout = setTimeout(() => {
        this.refreshTimeout = void 0;
        resolve();
      }, 1e3);
    });
    this.statusBarItem.text = LOADING_TEXT;
  }
  dispose() {
    this.clearRefreshTimeout();
    this.statusBarItem.dispose();
  }
  clearRefreshTimeout() {
    if (this.refreshTimeout !== void 0) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = void 0;
    }
  }
};

// src/extension.ts
function activate(context) {
  const statusBar = new CursorStatsStatusBar();
  const refreshCommand = vscode2.commands.registerCommand(
    REFRESH_COMMAND,
    () => statusBar.refresh()
  );
  context.subscriptions.push(statusBar, refreshCommand);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
