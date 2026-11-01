# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | Yes |
| < 1.1 | No |

## Reporting a vulnerability

Do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the extension version, browser version, reproduction steps, and impact.

You can expect an initial response within 7 days. Please allow time for a fix
before public disclosure.

## Security model

Chess-See is a local browser extension:

- Stockfish runs from bundled files. There is no remote engine and no network
  analysis.
- No telemetry, analytics, accounts, or external API calls are used.
- Settings are stored in `chrome.storage.sync`.
- Host permissions are limited to Chess.com and Lichess.
- The extension content security policy blocks remote scripts and remote
  connections.
- The page never receives the extension's engine objects. Analysis messages
  travel through extension-owned runtime ports and an offscreen document.

## Scope

In scope:

- Code execution or privilege escalation through page content.
- Bypass of the extension content security policy.
- Leakage of browsing data or settings to a third party.
- Unauthorized access to the local Stockfish engine from a web page.
- Supply-chain issues in bundled third-party code.

Out of scope:

- Chess.com or Lichess changing their DOM and breaking selectors.
- Detection by a chess site, account restrictions, or fair-play policy issues.
- Denial of service caused by intentionally extreme local settings.
- Vulnerabilities in Brave, Chrome, Chess.com, Lichess, or Stockfish itself
  that are not reachable through this extension's code.

## Third-party code

Bundled components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
