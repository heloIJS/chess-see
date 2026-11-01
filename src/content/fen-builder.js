/*
 * Chess-See FEN builder.
 * SAN history is the primary source. Board scanning is the fallback.
 * Every FEN that leaves this file has been accepted by chess.js.
 */
(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const CS = root.ChessSee = root.ChessSee || {};
  const FILES = 'abcdefgh';
  const PIECE_TOKEN = /^[wb][pnbrqk]$/;
  const SQUARE_TOKEN = /^square-([1-8])([1-8])$/;
  const ROLE_MAP = Object.freeze({
    pawn: 'p',
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
    king: 'k'
  });
  const FIGURINES = Object.freeze({
    '\u2654': 'K', '\u265A': 'K',
    '\u2655': 'Q', '\u265B': 'Q',
    '\u2656': 'R', '\u265C': 'R',
    '\u2657': 'B', '\u265D': 'B',
    '\u2658': 'N', '\u265E': 'N',
    '\u2659': '',  '\u265F': ''
  });

  function cleanSan(raw) {
    let san = String(raw == null ? '' : raw)
      .replace(/\u00a0/g, ' ')
      .replace(/\u00bd/g, '1/2')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2654-\u265F]/g, (ch) => FIGURINES[ch] || '')
      .replace(/\s+/g, ' ')
      .trim();

    san = san.replace(/^\d+\.(?:\.\.)?\s*/, '');
    san = san.replace(/^\.{2,}\s*/, '');
    san = san.replace(/\s*\$\d+/g, '');
    san = san.replace(/[!?]+$/g, '');
    san = san.replace(/\s+(?:e\.?p\.?|ep)$/i, '');
    san = san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    return san.trim();
  }

  function isResultToken(value) {
    return /^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(String(value || '').trim());
  }

  function replaySan(sanMoves) {
    const game = new Chess();
    const applied = [];

    for (let i = 0; i < sanMoves.length; i += 1) {
      const san = cleanSan(sanMoves[i]);
      if (!san || isResultToken(san)) continue;

      let move = null;
      try {
        move = game.move(san);
      } catch (error) {
        return {
          ok: false,
          error: 'Illegal SAN at ply ' + (i + 1) + ': ' + san,
          fen: game.fen(),
          turn: game.turn(),
          applied: applied
        };
      }

      if (!move) {
        return {
          ok: false,
          error: 'Rejected SAN at ply ' + (i + 1) + ': ' + san,
          fen: game.fen(),
          turn: game.turn(),
          applied: applied
        };
      }

      applied.push({
        san: move.san,
        from: move.from,
        to: move.to,
        color: move.color,
        flags: move.flags,
        piece: move.piece
      });
    }

    return {
      ok: true,
      game: game,
      fen: game.fen(),
      turn: game.turn(),
      applied: applied
    };
  }

  function validateFen(fen) {
    if (typeof fen !== 'string') return false;
    const fields = fen.trim().split(/\s+/);
    if (fields.length !== 6) return false;

    let game;
    try {
      game = new Chess(fen);
    } catch (error) {
      return false;
    }

    let whiteKings = 0;
    let blackKings = 0;
    const board = game.board();
    for (let r = 0; r < 8; r += 1) {
      for (let f = 0; f < 8; f += 1) {
        const piece = board[r][f];
        if (!piece) continue;
        if (piece.type === 'k') {
          if (piece.color === 'w') whiteKings += 1;
          else blackKings += 1;
        }
      }
    }

    return whiteKings === 1 && blackKings === 1;
  }

  function positionFromSan(sanMoves) {
    const replay = replaySan(sanMoves || []);
    if (!replay.ok) {
      return {
        ok: false,
        error: replay.error,
        fen: replay.fen,
        turn: replay.turn,
        applied: replay.applied
      };
    }

    if (!validateFen(replay.fen)) {
      return {
        ok: false,
        error: 'Replayed position failed FEN validation',
        fen: replay.fen,
        turn: replay.turn,
        applied: replay.applied
      };
    }

    return {
      ok: true,
      fen: replay.fen,
      turn: replay.turn,
      applied: replay.applied,
      fullmove: Number(replay.fen.split(' ')[5]) || 1
    };
  }

  function parsePieceClass(element) {
    const classText = element && element.getAttribute
      ? (element.getAttribute('class') || '')
      : '';
    const tokens = classText.split(/\s+/);
    let piece = null;
    let square = null;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!piece && PIECE_TOKEN.test(token)) piece = token;
      if (!square) {
        const squareMatch = token.match(SQUARE_TOKEN);
        if (squareMatch) square = squareMatch;
      }
    }

    if (!piece || !square) return null;
    return {
      color: piece[0],
      type: piece[1],
      file: Number(square[1]),
      rank: Number(square[2])
    };
  }

  function readTranslate(element) {
    let transform = '';
    try {
      transform = window.getComputedStyle(element).transform || '';
    } catch (error) {
      transform = '';
    }
    if (!transform || transform === 'none') transform = element.style.transform || '';

    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (matrix) {
      const parts = matrix[1].split(',').map(Number);
      if (parts.length === 16) return { x: parts[12], y: parts[13] };
      if (parts.length === 6) return { x: parts[4], y: parts[5] };
    }

    const translate = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
    if (translate) return { x: Number(translate[1]), y: Number(translate[2]) };
    return null;
  }

  // Lichess/Chessground pieces use classes like "white knight" and a
  // transform that positions the piece inside the board.
  function parseLichessPiece(element, boardRect, orientation) {
    const cls = element && element.classList;
    if (!cls || cls.contains('ghost') || cls.contains('fading')) return null;

    const color = cls.contains('white') ? 'w' : (cls.contains('black') ? 'b' : null);
    if (!color) return null;

    let type = null;
    const roles = Object.keys(ROLE_MAP);
    for (let i = 0; i < roles.length; i += 1) {
      if (cls.contains(roles[i])) {
        type = ROLE_MAP[roles[i]];
        break;
      }
    }
    if (!type) return null;

    const position = readTranslate(element);
    if (!position || !boardRect || boardRect.width <= 0 || boardRect.height <= 0) return null;

    const col = Math.round(position.x / (boardRect.width / 8));
    const row = Math.round(position.y / (boardRect.height / 8));
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;

    const flipped = orientation === 'b';
    return {
      color: color,
      type: type,
      file: (flipped ? 7 - col : col) + 1,
      rank: flipped ? row + 1 : 8 - row
    };
  }

  function makeEmptyGrid() {
    const grid = [];
    for (let r = 0; r < 8; r += 1) grid.push(new Array(8).fill(null));
    return grid;
  }

  // Chess.com uses square-{file}{rank} classes. Lichess/Chessground uses
  // role classes plus a pixel transform. Grid row 0 is rank 8, column 0 is a.
  function boardToFen(boardElement, turn, orientation) {
    if (!boardElement) return null;
    const pieceElements = boardElement.querySelectorAll('piece, .piece');
    if (!pieceElements.length) return null;

    const grid = makeEmptyGrid();
    const seen = new Set();
    const boardRect = typeof boardElement.getBoundingClientRect === 'function'
      ? boardElement.getBoundingClientRect()
      : null;

    for (let i = 0; i < pieceElements.length; i += 1) {
      const element = pieceElements[i];
      let parsed = parsePieceClass(element);
      if (!parsed) parsed = parseLichessPiece(element, boardRect, orientation);
      if (!parsed) continue;

      const fileIndex = parsed.file - 1;
      const row = 8 - parsed.rank;
      if (fileIndex < 0 || fileIndex > 7 || row < 0 || row > 7) continue;

      const key = fileIndex + ':' + row;
      if (seen.has(key)) continue;
      seen.add(key);
      grid[row][fileIndex] = parsed;
    }

    if (!seen.size) return null;

    let placement = '';
    for (let r = 0; r < 8; r += 1) {
      let empty = 0;
      for (let f = 0; f < 8; f += 1) {
        const piece = grid[r][f];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) {
          placement += String(empty);
          empty = 0;
        }
        const letter = piece.type === 'n' ? 'n' : piece.type;
        placement += piece.color === 'w' ? letter.toUpperCase() : letter;
      }
      if (empty) placement += String(empty);
      if (r < 7) placement += '/';
    }

    function pieceAt(fileIndex, rank) {
      const row = 8 - rank;
      if (fileIndex < 0 || fileIndex > 7 || row < 0 || row > 7) return null;
      return grid[row][fileIndex];
    }

    function has(fileIndex, rank, color, type) {
      const piece = pieceAt(fileIndex, rank);
      return !!piece && piece.color === color && piece.type === type;
    }

    let castling = '';
    if (has(4, 1, 'w', 'k') && has(7, 1, 'w', 'r')) castling += 'K';
    if (has(4, 1, 'w', 'k') && has(0, 1, 'w', 'r')) castling += 'Q';
    if (has(4, 8, 'b', 'k') && has(7, 8, 'b', 'r')) castling += 'k';
    if (has(4, 8, 'b', 'k') && has(0, 8, 'b', 'r')) castling += 'q';

    const side = turn === 'b' ? 'b' : 'w';
    const fen = placement + ' ' + side + ' ' + (castling || '-') + ' - 0 1';

    if (!validateFen(fen)) return null;
    return {
      fen: fen,
      turn: side,
      castling: castling || '-',
      enPassant: '-',
      applied: [],
      source: 'board'
    };
  }

  function squareToCoords(square) {
    if (typeof square !== 'string' || square.length < 2) return null;
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    if (file < 0 || rank < 1 || rank > 8) return null;
    return { file: file, rank: rank };
  }

  CS.FenBuilder = {
    cleanSan: cleanSan,
    isResultToken: isResultToken,
    replaySan: replaySan,
    validateFen: validateFen,
    positionFromSan: positionFromSan,
    boardToFen: boardToFen,
    squareToCoords: squareToCoords
  };
})();
