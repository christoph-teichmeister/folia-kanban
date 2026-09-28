import type { PluginSettingTab, Setting } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

const app = vi.hoisted(() => ({ version: "1.13.0" }));
vi.mock("obsidian", () => ({
  requireApiVersion: (v: string) => v.localeCompare(app.version, undefined, { numeric: true }) <= 0,
}));

const { refreshDeclarativeSettingTab, setSettingError } = await import("../src/obsidian/compat");

const fakeTab = () => ({ update: vi.fn(), refreshDomState: vi.fn() });
const asTab = (t: ReturnType<typeof fakeTab>) => t as unknown as PluginSettingTab;

describe("the version gate", () => {
  beforeEach(() => {
    app.version = "1.13.0";
  });

  it("redraws the declarative tab on 1.13, fully or in place", () => {
    const tab = fakeTab();
    expect(refreshDeclarativeSettingTab(asTab(tab), "redraw")).toBe(true);
    expect(refreshDeclarativeSettingTab(asTab(tab), "refresh")).toBe(true);
    expect(tab.update).toHaveBeenCalledTimes(1);
    expect(tab.refreshDomState).toHaveBeenCalledTimes(1);
  });

  it("leaves the redraw to the caller below 1.13, touching neither newer method", () => {
    app.version = "1.11.4";
    const tab = fakeTab();
    expect(refreshDeclarativeSettingTab(asTab(tab), "redraw")).toBe(false);
    expect(refreshDeclarativeSettingTab(asTab(tab), "refresh")).toBe(false);
    expect(tab.update).not.toHaveBeenCalled();
    expect(tab.refreshDomState).not.toHaveBeenCalled();
  });

  it.each([
    ["1.13.0", 1],
    ["1.11.4", 0],
  ])("on %s shows a row's error %i time(s)", (version, calls) => {
    app.version = version;
    const setErrorMessage = vi.fn();
    setSettingError({ setErrorMessage } as unknown as Setting, "Not a port");
    expect(setErrorMessage).toHaveBeenCalledTimes(calls);
  });
});
