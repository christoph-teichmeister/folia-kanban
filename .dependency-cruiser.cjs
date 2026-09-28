/** @type {import('dependency-cruiser').IConfiguration} */
// Architecture boundaries, adapted to this Obsidian plugin's
// three layers:
//   model    — pure domain + the CardRepository port; depends on nothing app-specific
//   obsidian — the Vault adapter that implements the port (the only data/transport layer)
//   ui       — React board; depends on model + the port, never the adapter
//   mcp      — the MCP tool surface; same rule as ui (model + the port, never the adapter)
// The plugin shell (main.ts, view.tsx) wires the adapter into Obsidian.
// The "only the adapter/shell may import the 'obsidian' package" rule is enforced
// in eslint.config.mjs via no-restricted-imports (precise specifier match), which sees
// direct imports only; ui-never-reaches-obsidian below covers the transitive ones for src/ui.
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make modules impossible to load or reason about in isolation.",
      from: {},
      to: { circular: true },
    },
    {
      name: "model-is-pure-domain",
      severity: "error",
      comment:
        "src/model is the domain core + ports. It must not depend on the UI, the Obsidian adapter, or the plugin shell.",
      from: { path: "^src/model/" },
      to: { path: "^src/ui/|^src/obsidian/|^src/(main|view|settings)\\.(ts|tsx)$" },
    },
    {
      name: "ui-through-port-not-adapter",
      severity: "error",
      comment:
        "src/ui depends on the model and the CardRepository port (in src/model). It must never import the Obsidian adapter (src/obsidian) directly.",
      from: { path: "^src/ui/" },
      to: { path: "^src/obsidian/" },
    },
    {
      name: "ui-never-reaches-obsidian",
      severity: "error",
      comment:
        "No chain of imports from src/ui may end at the obsidian package, type-only ones included. ESLint's import ban sees only direct imports; this sees the whole path.",
      from: { path: "^src/ui/" },
      to: { path: "^obsidian$", reachable: true },
    },
    {
      name: "mcp-is-a-port-consumer",
      severity: "error",
      comment:
        "src/mcp is the agent-facing tool surface. Like src/ui it reaches the vault only through the CardRepository port in src/model, never the Obsidian adapter or the plugin shell. The adapter that implements its BoardHost lives in src/obsidian and imports it, not the other way round.",
      from: { path: "^src/mcp/" },
      to: { path: "^src/ui/|^src/obsidian/|^src/(main|view|settings)\\.(ts|tsx)$" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Files imported by nothing (except the plugin entry) are usually dead code — confirm with knip.",
      from: { orphan: true, pathNot: ["^src/main\\.ts$", "\\.d\\.ts$"] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    // The obsidian package is let in so the reachability rule above has an end to find.
    includeOnly: ["^src/", "^obsidian$"],
  },
};
