# Security audit

Date: 2026-11-01
Target: Chess-See 1.1.0 (Manifest V3 extension)
Scope: source tree, manifest, bundled third-party files, extension runtime in Brave

## Summary

No critical or high-severity issues were found in the extension's own code.

The extension is local-only:

- no remote scripts or remote analysis,
- no telemetry or analytics,
- no accounts or external API calls,
- Stockfish runs from bundled files in an offscreen document,
- page content never receives extension engine objects.

One hardening change was applied during the audit: the unused iframe engine
host was removed and `web_accessible_resources` was narrowed to
`src/content/shadow.css` only.

## Checks performed

| Area | Result |
|---|---|
| Manifest V3 | Pass |
| Permissions | Pass: `storage`, `offscreen` only |
| Host permissions | Pass: Chess.com and Lichess only |
| `<all_urls>` | Not used |
| Extension CSP | Pass: `script-src 'self'`, `object-src 'self'`, `connect-src 'self'` |
| Remote script tags | None |
| Remote stylesheets | None |
| `eval()` / `new Function()` | None in extension code |
| `document.write()` | None |
| `innerHTML` | Two static markup assignments only; no page data inserted as HTML |
| Dynamic DOM data | Uses `textContent` and `setAttribute` |
| Network calls | None in extension code; no `fetch()` or `XMLHttpRequest` |
| Web-accessible resources | Only `src/content/shadow.css` |
| Stockfish integrity | Both SHA-256 hashes match `VERSION.txt` |
| Legacy iframe host | Removed |
| Third-party licenses | Documented in `THIRD_PARTY_NOTICES.md` |

## Findings

### Low: content script runs in all frames

`all_frames: true` lets the content script run inside Chess.com and Lichess
iframes. This is intentional because some board views are embedded. The script
is limited to the declared hosts and does not use page-supplied HTML.

### Low: GPLv3 engine increases the audit surface

The bundled Stockfish build is third-party GPLv3 code. Its hashes are pinned in
`src/lib/stockfish/VERSION.txt` and must be re-checked when the engine is
updated. The project is licensed under GPLv3 to match.

### Informational: `wasm-unsafe-eval`

The extension CSP allows `wasm-unsafe-eval` because the Stockfish WebAssembly
build requires it. This does not allow JavaScript `eval()` or remote code.

### Informational: site DOM changes

Chess.com and Lichess can change their markup at any time. A selector failure
can hide the HUD, but it does not create a code-execution path.

## Residual risks

- A compromised Chess.com or Lichess page can feed malformed board data to the
  content script. The script parses strings and renders SVG attributes, not
  HTML, which limits impact to incorrect analysis or HUD behavior.
- A malicious local user profile can modify extension settings. Settings are
  not security boundaries.
- Third-party engine vulnerabilities must be handled by updating the bundled
  Stockfish build and its recorded hashes.

## Reproduction

Run the automated checks:

```bash
npm test
```

Or directly:

```bash
node scripts/check-syntax.js
node scripts/security-check.js
```

Runtime smoke test:

1. Load the unpacked extension in Brave or Chrome.
2. Open a Chess.com analysis page.
3. Confirm the engine reaches `ready`, an eval chip appears, and arrows render.
4. Confirm no remote analysis request is made in DevTools Network.

## Disclosure

Report vulnerabilities privately through GitHub Security Advisories. See
[SECURITY.md](SECURITY.md).
