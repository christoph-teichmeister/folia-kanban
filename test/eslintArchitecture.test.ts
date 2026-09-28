import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint();
const importObsidian = (filePath: string) =>
  eslint.lintText(
    'import { normalizePath } from "obsidian";\nexport const path = normalizePath;\n',
    {
      filePath,
    },
  );
const readActiveGlobals = (filePath: string) =>
  eslint.lintText(
    "export const all = [activeDocument.body, activeWindow.innerWidth, window.activeDocument, globalThis.activeWindow, self.activeDocument];\n",
    { filePath },
  );

// The first lint builds the TypeScript program the type-aware rules need, which under a loaded
// full run can take longer than one case is allowed. Paid once here, each case times only itself.
beforeAll(() => eslint.lintText("", { filePath: "src/model/card.ts" }), 60_000);

describe("obsidian import fence", () => {
  it.each(["src/model/card.ts", "src/ui/App.tsx", "src/mcp/tools.ts", "src/settings.ts"])(
    "rejects the obsidian package in %s",
    async (file) => {
      const [result] = await importObsidian(file);
      expect(result?.messages.map((m) => m.ruleId)).toContain("no-restricted-imports");
    },
  );

  it.each(["src/obsidian/vaultRepo.ts", "src/main.ts", "src/view.tsx"])(
    "leaves %s free to import it",
    async (file) => {
      const [result] = await importObsidian(file);
      expect(result?.fatalErrorCount).toBe(0);
      expect(result?.messages.map((m) => m.ruleId)).not.toContain("no-restricted-imports");
    },
  );
});

describe("obsidian active-window globals fence", () => {
  const fenceRules = ["no-restricted-globals", "no-restricted-properties"];

  it.each(["src/model/card.ts", "src/ui/context.ts", "src/mcp/tools.ts", "src/settings.ts"])(
    "rejects activeDocument and activeWindow in %s",
    async (file) => {
      const [result] = await readActiveGlobals(file);
      const banned = result?.messages.filter((m) => fenceRules.includes(m.ruleId ?? ""));
      expect(banned?.map((m) => [m.ruleId, m.severity])).toEqual([
        ["no-restricted-globals", 2],
        ["no-restricted-globals", 2],
        ["no-restricted-properties", 2],
        ["no-restricted-properties", 2],
        ["no-restricted-properties", 2],
      ]);
    },
  );

  it.each(["src/obsidian/vaultRepo.ts", "src/main.ts", "src/view.tsx"])(
    "leaves %s free to use them",
    async (file) => {
      const [result] = await readActiveGlobals(file);
      expect(result?.fatalErrorCount).toBe(0);
      expect(result?.messages.filter((m) => fenceRules.includes(m.ruleId ?? ""))).toEqual([]);
    },
  );
});
