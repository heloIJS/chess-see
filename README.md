# Chess-See

A small Chrome MV3 extension that adds a **fully local Stockfish HUD** to
chess.com and lichess.org:

- best-move arrow
- optional 2nd / 3rd alternatives
- pulsing destination ring
- live eval chip
- humanizer mode with configurable miss / mistake / blunder chances
- hotkey-only controls

Everything runs **100% on-device**. There is no network analysis, no external engine,
no site API usage, and no telemetry.

---

## Install in Chrome

1. Open `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder (`chess-see/`).
5. Open any chess.com or lichess.org game / analysis page.

If Chrome refuses to load the extension the first time, make sure you are selecting the
folder **that contains `manifest.json`**, not its parent.

---

## Install on Android

Chrome for Android does not allow extensions. Use a Chromium-based Android browser
that supports unpacked extensions, for example **Mises**, **Quetta**, or **Kiwi**.

1. Install Mises / Quetta / Kiwi from its official site.
2. Open the browser's extension page (usually `chrome://extensions/` or
   browser menu → **Extensions**).
3. Turn on **Developer mode**.
4. Use **Load unpacked** and select the `chess-see/` folder.
5. Open chess.com or lichess.org in that same browser.

On phones, a small **⚙ button** appears at the bottom-right. Use it to open the
Chess-See panel without a keyboard. The panel becomes a bottom sheet and the
eval chip shrinks to fit small screens.

Firefox for Android is not supported yet because this build uses Chrome's
offscreen API for the local Stockfish engine.

---

## What you get

| Element | Purpose |
|---|---|
| Green arrow | Stockfish best move |
| Cyan arrow & `!!` badge | Brilliant (Brillante) move with pulsing cyan ring |
| Purple arrow & `📖` badge | Opening book repertoire move with opening title chip |
| Blue dashed arrow | 2nd-best move |
| Amber dashed arrow | 3rd-best move |
| Pulsing circle | Destination square of the best move |
| Small chip near the board | Live evaluation |
| Panel at top-right | Optional debug/settings |
| Popup icon | Quick controls |
| On-screen ⚙ button | Open settings on touch devices |
| Options page | Full settings |

The board analysis works because the extension reads the current game position from
the page (FEN input on analysis pages, then SAN move list, then board scan) and feeds
it to a bundled Stockfish build.

---

## Hotkeys

| Shortcut | Action |
|---|---|
| `Alt+Shift+A` | Toggle master HUD on / off |
| `Alt+Shift+F` | Fade mode: auto → always → hidden |
| `Alt+Shift+N` | Cycle arrows: 1 → 2 → 3 → 1 |
| `Alt+Shift+D` | Depth cycle: 12 → 18 → 24 → 12 |
| `Alt+Shift+L` | Engine strength: Full → 2800 → 2400 → 2000 → 1600 → 1200 → Full |
| `Alt+Shift+E` | Toggle eval chip |
| `Alt+Shift+S` | Open the on-board settings panel overlay |
| `Alt+Shift+B` | Cycle brilliant target: Auto → Best → Sacrifice → 2nd Alt → 3rd Alt |
| `Alt+Shift+O` | Toggle opening book repertoire on / off |

The HUD is deliberately **hotkey-only** so it never intercepts normal chess input.

---

## Analysis pipeline

1. **Stage 1** — instant depth `6`, MultiPV equal to the arrow count, runs immediately.
2. **Stage 2** — configured depth (default `18`), same MultiPV, movetime capped by depth.
3. When a miss is planned, MultiPV is raised to `3`; a mistake raises it to `5`; a brilliant sacrifice or auto search raises it to `4`.
4. The search is cancelled if FEN changes or the page is hidden.
5. Position sourcing:
   - first from a **FEN input** on analysis pages (Lichess)
   - then from the **SAN move list**
   - fallback from **board scanning**
6. Board visibility is tracked with a debounced `MutationObserver`.

Both sites are supported:

| Site | Board | Turn source | Position source |
|---|---|---|---|
| chess.com | `wc-chess-board` | clock classes | SAN move list, board scan |
| lichess.org | `cg-board` | `.rclock.running` | FEN input, `<z7yx>` / `<san>` moves, board scan |

Stockfish is bundled locally in:

```
src/lib/stockfish/stockfish.js
src/lib/stockfish/stockfish.wasm
```

No runtime engine download happens.

---

## Engine strength (custom ELO)

You can dial the engine down so its advice feels *human* instead of superhuman:

| Setting | Meaning |
|---|---|
| `Full` | Stockfish runs unbounded (max strength) |
| `~2800` … `~1320` | Uses Stockfish's built-in `UCI_LimitStrength` / `UCI_Elo` |

Stockfish's `UCI_Elo` floor is `1320`. Values below that are clamped by the
engine, so use the miss / mistake / blunder chances when you want weaker play.

Control it via:

- the popup's **Engine strength** select,
- the options page (**Engine → Engine strength**),
- the on-board HUD panel,
- or the hotkey `Alt+Shift+L`.

### Miss, mistake, and blunder chances

Three optional sliders make the HUD deliberately imperfect while Humanizer mode is on:

| Setting | Range | Effect |
|---|---|---|
| **Miss chance** | 0–100% | Shows the 2nd or 3rd best engine line instead of the best move |
| **Mistake chance** | 0–100% | Shows the 4th or 5th best engine line instead of the best move |
| **Blunder chance** | 0–100% | Shows a random legal move from the current position |

All default to `0%`. The roll happens once per position, so the suggestion
stays stable across the instant and deep search stages. Blunder is checked
first, then mistake, then miss. A forced move is never treated as a blunder,
and a blunder replacement is chosen only once per position. When Humanizer
mode is off, all chances are ignored and the HUD always shows the best move.

Set them in the options page, the on-board HUD panel, or the popup.

### Brilliant (Brillante) move chance and move selection

You can configure the HUD to show brilliant moves (`!!`) with iconic cyan/teal arrows, `!!` badges, and pulsing cyan destination rings:

| Setting | Range | Effect |
|---|---|---|
| **Brilliant chance** | 0–100% | Percentage chance per position to designate and display a move as brilliant (default `0%`). Works across both instant and deep search stages. |
| **Choose brilliant move** | `Auto`, `Best (#1)`, `Piece sacrifice`, `2nd best (#2)`, `3rd best (#3)` | Chooses which move is marked as brilliant. |

- **`Auto`**: Searches candidate lines for a genuine piece sacrifice; if found, promotes and marks it brilliant; otherwise selects the best engine move.
- **`Piece sacrifice`**: Identifies tactical sacrifices (Queen, Rook, Bishop, Knight, or exchange sacrifices) that maintain an advantageous position.
- **`Best (#1)`**: Always designates Stockfish's top engine move as brilliant.
- **`2nd best (#2)` / `3rd best (#3)`**: Designates and promotes the 2nd or 3rd engine line as brilliant.
- **On-board HUD selection**: Open the settings panel (`Alt+Shift+S`) to click quick buttons (`[Auto]`, `[#1 Best]`, `[Sacrifice]`, `[#2 Alt]`, `[#3 Alt]`) or pick any active candidate move with the `[Make !!]` button.
- **Hotkey cycle**: Press `Alt+Shift+B` to cycle through the brilliant move targets on the fly.

### Opening Repertoires & PGN Upload

Learn and follow your favorite chess repertoires with zero-delay opening book guidance:

| Feature | Details |
|---|---|
| **Starter Repertoires** | Pre-bundled with popular openings: **Italian Game** (White), **Sicilian Defense** (Black), and **Queen's Gambit** (White). |
| **Custom PGN Upload & Paste** | Upload any `.pgn` file or paste PGN moves directly in the **Options page**. Supports multi-game PGNs, variations, side-lines, and transpositions. |
| **Instant Book Priority** | Displays book moves instantly (0 ms) upon position change with purple/indigo (`#8b5cf6`) arrows, a `📖` badge, and the opening title chip (e.g. `📖 Italian Game`). Seamlessly hands off to Stockfish once out of book. |
| **Multi-Move Branches** | Shows all candidate moves studied in your repertoire for the current position. |
| **Color Filtering** | Repertoires can be designated for White, Black, or Both, automatically matching your side of the board. |
| **Toggle Control** | Enable/disable easily from the Options page, Popup toggle, on-board HUD (`Alt+Shift+S`), or with hotkey `Alt+Shift+O`. |

### Humanizer style and think delay

| Setting | Effect |
|---|---|
| **Style** | `Balanced` picks any alternative; `Defensive` prefers the safest alternative; `Aggressive` and `Tricky` prefer the riskiest alternative. Style also weights blunder moves toward captures, checks, or promotions. |
| **Think delay** | 0–2000 ms delay before the HUD shows a suggestion. Makes the HUD feel less instant. |

Both are ignored when Humanizer mode is off.

### Speed

Stage 2 uses a **movetime-capped search** instead of a depth-only search:

| Depth | Max search time |
|---|---|
| 12 | ~600 ms |
| 18 | ~1100 ms |
| 24 | ~1800 ms |

Lower depth ⇒ faster arrows. Pondering is disabled and stage 1 stays depth-6 so the
first arrow appears almost instantly.

---

## Fragile selector patch point

Chess.com and Lichess change their DOM occasionally. Everything that depends on their
markup lives in:

```
src/content/board-adapter.js
```

Specifically the selector table:

```js
const SELECTORS = Object.freeze({
  board: [...],
  moveList: [...],
  moveNodes: [...],
  sanText: [...],
  activeClock: [...],
  bottomClock: [...],
  clock: [...],
  bottomPlayer: [...]
});
```

If chess.com or Lichess renames a class, update the relevant array here. Nothing else
should need patching.

---

## Files

```
manifest.json
src/
  content/
    board-adapter.js
    fen-builder.js
    hud.js
    hotkeys.js
    main.js
    opening-book.js
    overlay.js
    shadow.css
  engine/
    offscreen.html
    offscreen.js
    uci-parser.js
    worker-bridge.js
  lib/
    chess.min.js
    stockfish/
      stockfish.js
      stockfish.wasm
  popup/
    popup.html
    popup.css
    popup.js
  options/
    options.html
    options.css
    options.js
```

---

## Notes on visual style

The HUD is intentionally subtle. The arrows use:

| Line | Width | Style |
|---|---|---|
| Best | 10 | solid + soft glow |
| 2nd | 6 | dashed `6 4`, alpha `.6` |
| 3rd | 4 | dashed `4 5`, alpha `.45` |

The eval chip uses mono type and low alpha so it blends into the board.

---

## Local development

There are no install scripts. Just edit the files and reload the unpacked extension in
Chrome.

For a clean reload:

1. Open `chrome://extensions/`.
2. Click the circular reload icon on the Chess-See card.
3. Refresh chess.com or lichess.org.

The extension never calls the network for chess analysis.

---

## Security

- No telemetry, analytics, accounts, or remote engine calls.
- Stockfish runs from bundled files only.
- Host permissions are limited to Chess.com and Lichess.
- The extension CSP blocks remote scripts and remote connections.
- Page content never receives extension engine objects.

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

---

## License

Chess-See is licensed under the **GNU General Public License v3.0**. This is
required because the bundled Stockfish build is GPLv3.

Copyright (C) 2026 helolJS.

- [LICENSE](LICENSE)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

