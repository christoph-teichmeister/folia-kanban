import { requireApiVersion, type PluginSettingTab, type Setting } from "obsidian";

// Every call to an Obsidian API newer than `minAppVersion` lives here, each behind its own literal
// `requireApiVersion(...)`: `obsidianmd/no-unsupported-api` only recognises that exact shape as a
// guard, and `eslint.config.mjs` bans `requireApiVersion` everywhere else.

/**
 * Tell Obsidian's declarative settings tab that a setting changed: `"redraw"` when rows appear,
 * vanish or draw themselves from a `render` callback, `"refresh"` for the cheap in-place re-check of
 * every row's `disabled` predicate.
 *
 * @returns false below 1.13, where the tab is the imperative one and the caller redraws it itself.
 */
export function refreshDeclarativeSettingTab(
  tab: PluginSettingTab,
  how: "redraw" | "refresh",
): boolean {
  if (requireApiVersion("1.13.0")) {
    if (how === "redraw") tab.update();
    else tab.refreshDomState();
    return true;
  }
  return false;
}

/** Show `message` under the row, or clear it with null. Below 1.13 a row has nowhere to put one. */
export function setSettingError(setting: Setting, message: string | null): void {
  if (requireApiVersion("1.13.0")) setting.setErrorMessage(message);
}
