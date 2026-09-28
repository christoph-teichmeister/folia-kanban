import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
const GATE = "src/obsidian/compat.ts";
const OTHER = "src/obsidian/vaultRepo.ts";

const unguarded =
  'import type { ButtonComponent } from "obsidian";\n' +
  "export const red = (b: ButtonComponent): void => {\n  b.setDestructive();\n};\n";
const guarded =
  'import { requireApiVersion, type ButtonComponent } from "obsidian";\n' +
  "export const red = (b: ButtonComponent): void => {\n" +
  '  if (requireApiVersion("1.13.0")) b.setDestructive();\n  else b.setWarning();\n};\n';

async function ruleIds(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath });
  expect(result?.fatalErrorCount).toBe(0);
  return result?.messages.map((m) => m.ruleId) ?? [];
}

// The first lint builds the type-checked program the rule needs, which takes seconds.
describe("newer Obsidian APIs go through the one version gate", { timeout: 30_000 }, () => {
  it.each([GATE, OTHER])("rejects an unguarded 1.13 call in %s", async (file) => {
    expect(await ruleIds(unguarded, file)).toContain("obsidianmd/no-unsupported-api");
  });

  it("rejects a guard written outside the gate file", async () => {
    const ids = await ruleIds(guarded, OTHER);
    expect(ids).toContain("no-restricted-syntax");
    expect(ids).not.toContain("obsidianmd/no-unsupported-api");
  });

  it("accepts the guarded call in the gate file", async () => {
    const ids = await ruleIds(guarded, GATE);
    expect(ids).not.toContain("no-restricted-syntax");
    expect(ids).not.toContain("obsidianmd/no-unsupported-api");
  });
});
