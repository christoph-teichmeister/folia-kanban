import { requireApiVersion, type PluginSettingTab, type Setting } from "obsidian";

// Every call to an Obsidian API newer than `minAppVersion` lives here, each behind its own literal
// `requireApiVersion(...)`: `obsidianmd/no-unsupported-api` only recognises that exact shape as a
// guard, and `eslint.config.mjs` bans `requireApiVersion` everywhere else.

/**
 * Tell Obsidian's declarative settings tab that a setting changed: `structural` when rows appear,
 * vanish or redraw themselves from a `render` callback, otherwise the cheap in-place refresh of
 * every row's `disabled` predicate.
 *
 * @returns false below 1.13, where the tab is the imperative one and the caller redraws it itself.
 */
export function refreshDeclarativeSettingTab(tab: PluginSettingTab, structural: boolean): boolean {
  if (requireApiVersion("1.13.0")) {
    if (structural) tab.update();
    else tab.refreshDomState();
    return true;
  }
  return false;
}

/** Show `message` under the row, or clear it with null. Below 1.13 a row has nowhere to put one. */
export function setSettingError(setting: Setting, message: string | null): void {
  if (requireApiVersion("1.13.0")) setting.setErrorMessage(message);
}
