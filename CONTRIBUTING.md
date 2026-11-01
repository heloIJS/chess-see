# Contributing to Chess-See

Thanks for helping improve Chess-See.

## Development setup

1. Clone the repository.
2. Open `chrome://extensions/` or `brave://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the folder that contains `manifest.json`.
5. Open Chess.com or Lichess and reload the page after each code change.

No build step is required. The extension runs directly from the source tree.

## Before opening a pull request

- Test on both Chess.com and Lichess.
- Test a live game and an analysis page.
- Keep changes focused. Do not mix refactors with behavior changes.
- Update `README.md` when a user-facing setting or shortcut changes.
- Run syntax checks:

```powershell
node --check src/content/main.js
node --check src/content/board-adapter.js
node --check src/content/overlay.js
node --check src/content/hud.js
node --check src/content/fen-builder.js
node --check src/content/hotkeys.js
node --check src/engine/worker-bridge.js
node --check src/engine/offscreen.js
node --check src/engine/uci-parser.js
node --check src/background/service-worker.js
node --check src/options/options.js
node --check src/popup/popup.js
```

- Validate `manifest.json` as JSON.
- Do not add remote scripts, remote fonts, analytics, or network analysis.
- Do not add new permissions without a clear reason in the pull request.

## Commit style

Use Conventional Commits:

```text
feat: add mistake chance setting
fix: keep engine alive when offscreen document reconnects
docs: document local-only security model
```

## Selector changes

Chess.com and Lichess DOM changes should be handled in
`src/content/board-adapter.js`. Keep selectors in the `SELECTORS` table.

## Security

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Do not open a
public issue for a security problem.

## License

By contributing, you agree that your contribution is licensed under the
GNU General Public License v3.0. See [LICENSE](LICENSE).
