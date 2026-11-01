# Third-party notices

Chess-See bundles the following third-party components.

## Stockfish.js 17.1

- Project: https://github.com/nmrugg/stockfish.js
- Upstream package: `stockfish@17.1.0`
- Local files: `src/lib/stockfish/stockfish.js`, `src/lib/stockfish/stockfish.wasm`
- Build: lite NNUE, single-threaded WebAssembly, commit `03e3232`
- License: GNU General Public License v3.0
- Source: https://github.com/nmrugg/stockfish.js

Integrity hashes are recorded in `src/lib/stockfish/VERSION.txt`.

Because Chess-See distributes this GPLv3 component, the project as a whole is
licensed under GPLv3. See [LICENSE](LICENSE).

## chess.js

- Project: https://github.com/jhlywa/chess.js
- Local file: `src/lib/chess.min.js`
- License: BSD 3-Clause
- Copyright: Copyright (c) 2020, Jeff Hlywa

The license header is preserved in the bundled file.

## Chromium extension APIs

Chess-See uses the Chrome Extensions Manifest V3 APIs provided by the browser.
No Chromium source code is bundled.
