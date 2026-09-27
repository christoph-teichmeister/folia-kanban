# Waiver: DS-A11Y-* — Automated a11y gate landed; substantially remediated, 4 behavioral items remain

| Field | Value |
| --- | --- |
| **Rule violated** | The **DS-A11Y-\*** Accessibility Baseline family (`spec.md` §5), enforced via the **Accessibility checks** conformance category (`DS-PROCESS-CONFORMANCE-1` #4). The remaining items map to DS-A11Y-MODAL-6 (`aria-modal` without focus trap / inert background), DS-A11Y-DISCOVERABLE-4 (no keyboard path to a pointer-only reveal), and DS-A11Y-TARGET-10 / color-contrast (unmeasurable in jsdom — needs a real-browser audit). |
| **Status** | `active` |
| **Owner** | @stavarengo |
| **Created date** | 2026-06-18 |
| **Expiry date** | 2026-09-30 |
| **Scope** | The automated a11y gate is now installed and enforced; what remains is a small, specific set of **behavioral** interaction gaps in `src/ui/` (focus-trap + `inert`, keyboard access to the card context menu) plus one **measurement** gap (color-contrast, not evaluable in jsdom). Limited to `src/ui/`. |

## Reason

The a11y *contracts* were always real and documented — the per-component / per-pattern Accessibility sections capture the intended behavior, and a genuine baseline exists in code (keyboard DnD, focus management, roles/names, `:focus-visible`), so DoD item 11 was honestly MET. The **enforcement toolchain has now been delivered and the bulk of the documented gaps are closed**, but a handful of behavioral interaction gaps and one measurement gap remain. This waiver stays **active** to track that remaining scope honestly rather than overclaiming completion — an earlier `retired` marking that cited only a color-contrast residual understated the work that is still open.

## Risk

**Reduced, not eliminated.** The baseline is now enforced by an automated gate, so a change that regresses an a11y contract is caught rather than landing silently, and `0 serious/critical` axe violations are confirmed in the unit-test environment. The residual risk is concentrated in the three items below: modal dialogs (`ColumnEditModal`, modal `CardDetail`) declare a modal role without a real focus trap or background `inert`, so focus can escape behind the dialog; the card context menu's new keyboard path (#72) is unconfirmed in the running app; and color-contrast can't be measured here. Each is a targeted, manually-tested interaction fix rather than a systemic gap.

## Resolution

The automated a11y gate is installed and enforced. It is **two-layered**:

- **Static** — `eslint` + `eslint-plugin-jsx-a11y`, exposed as the `lint:a11y` script (which also runs `a11y-exceptions:check`, the fence around the file-scoped exceptions).
- **Runtime** — `vitest-axe` over the UI suite, exposed as the `test:a11y` script.

Both layers run under `ds:check` and `pnpm verify`, which CI runs on every push to `main` and every pull request, so the gate blocks regressions in CI and in a local run of either. The pre-commit hook adds the static layer's `eslint` on the staged files.

**Done:**

- Automated a11y gate installed and **enforced** in `ds:check` / `pnpm verify` — static (`eslint` + `jsx-a11y`, `lint:a11y`) and runtime (`vitest-axe`, `test:a11y`).
- **0 serious/critical** axe violations in the unit-test environment.
- Landmarks added: board `role=region`, toolbar `role=search`.
- Dialog panels use `div role=dialog` (fixing the prior false `aria-modal` / region / `aria-prohibited-attr` / `aria-allowed-role` / banner-landmark findings).
- Column-count badge uses `role=img`.
- Combobox now exposes `aria-activedescendant` + per-option `id`s.
- `ColumnMenu` delete-confirm now uses `role=alertdialog`.
- Dead `jsx-a11y` `eslint-disable` directives removed; the few remaining exceptions are justified (dnd-spread / dialog-keyboard false positives). They no longer live in `eslint-disable` comments — Obsidian's community-directory scan errors on a directive naming a rule its own ESLint config never loaded — but in file-scoped `off` blocks in `eslint.config.mjs`, fenced by `a11y-exceptions:check`, which re-runs those rules on those files and fails on any violation beyond the nine documented ones.
- **`CardContextMenu` arrow-key navigation now reaches every enabled row** (#73): ArrowDown/ArrowUp used to walk only `.folia-menu-item` rows, skipping the card menu's priority radio group and the todo menu's move-to-column group — the resolution's original scope named only the priority group, but the column group had the identical gap. Roving focus now matches on `[role^="menuitem"]`, so any enabled `menuitem`/`menuitemradio` row is reachable regardless of which group it belongs to; disabled rows are still excluded, and tests cover ArrowDown and ArrowUp reaching the priority group in the card menu and the column group in the todo menu.
- **`CardContextMenu` no longer opens in a state that refuses focus** (#73 follow-up): the menu rendered `visibility: hidden` until a layout effect measured and positioned it, and the roving-focus effect that focuses the first row on open ran before that — a hidden element can't take focus in a real browser (jsdom doesn't enforce this, which is how it passed the existing suite). The menu now starts at the origin instead of hidden, so it stays focusable throughout; a test spies on `focus()` to refuse it under `visibility: hidden`, the way Chromium does, and confirms the first row is still focused on open.

**Remaining (why this waiver stays `active`):**

1. **Modal focus-trap + background `inert` not implemented** (`ColumnEditModal`, modal `CardDetail`) — focus can leave the open dialog into the page behind it.
2. **`CardItem` context menu keyboard path awaits a running-app check** — #72 opens it from a focused card with the Menu key or Shift+F10, anchored under the card, and unit tests cover it; close this item once Obsidian confirms the keys reach the board, focus lands in the menu, and Tab out of the menu steps on from the card.
3. **`color-contrast` unmeasurable in jsdom** — axe cannot compute rendered colors in the unit-test environment; this needs a real-browser / Lighthouse audit.

These are careful, manually-tested interaction changes and are tracked under this waiver until each is delivered.

## Exit plan

Close this waiver only when all three remaining items are delivered and verified: (1) a real focus trap + background `inert` on the modal dialogs, (2) a keyboard path to the `CardItem` context menu, and (3) a real-browser / Lighthouse color-contrast audit confirming the palette passes. The per-component and per-pattern **Accessibility contracts** in `docs/design-system/components/` and `docs/design-system/patterns/` are the enforced source of truth, with the two-layer automated a11y gate (`lint:a11y` + `test:a11y`, run under `ds:check` / `pnpm verify`) as the conformance mechanism for `DS-PROCESS-CONFORMANCE-1` #4.
