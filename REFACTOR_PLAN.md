## Events:

`app:started`

Emitted by: the app starting process.

### Handlers:

#### Sync Coordinator

Run initial sync.
---

`game:synced`

Emitted by: sync worker after successful sync.
Payload: { gameId, playedAt, platform }

### Handlers:

#### Game Analysis Scheduler

if game_analysis row exists for gameId → bail
if playedAt < autoAnalyzeThreshold → bail
INSERT OR IGNORE game_analysis (gameId, priority = 3)

emit game:queue:updated
---

`game:queue:updated`

Emitted by: Game Analysis Scheduler, Priority Manager.
Payload: { reason: 'new_items' | 'priority_changed' }

### Handlers:

#### Game Analysis Orchestrator

if idle:
  fetch head of game_analysis
    (ORDER BY priority DESC, queued_at ASC)
  if item exists → spawn game machine → transition to analyzing

if analyzing:
  fetch head of game_analysis
  if head priority > current game priority:
    send STOP to current game machine
    await game machine idle
    spawn game machine for head item
  else:
    continue
---

`position:queue:updated`

Emitted by: Priority Manager, Position Queue Manager
Payload: { reason: 'new_items' | 'priority_changed' }

### Handlers:

#### Game Analysis Orchestrator
forward to active game machine via sendTo(activeGameMachineRef)

Game Analysis Machine internal handler:
fetch head of positions for current game
  JOIN game_positions WHERE game_id = current
  ORDER BY priority DESC, queued_at ASC
if head priority > current position priority:
  send STOP to active position machine
  await position machine idle
  spawn position machine for head item
else:
  continue
---

`pgn:mutated`

Emitted by: pgn:mutate IPC handler
Payload: { gameId, pgn, currentFen }

### Handlers:

#### Position Queue Manager

parse PGN into tree
walk tree, collect all FENs
INSERT OR IGNORE game_positions (gameId, fen)
INSERT OR IGNORE positions (fen, config_hash, priority = 3)
UPDATE positions SET priority = 1 WHERE fen = currentFen
emit position:queue:updated { reason: 'new_items' }
---

`game:analysis:complete`

Emitted by: Game Analysis Machine when all positions done and the game level analysis is done
Payload: { gameId }

### Handlers:

#### Position Indexer
parse PGN into tree
load position results via game_positions join
walk nodes with full context:
  → determine positions to index
bulk INSERT position_embeddings (gameId, fen, embedding)
UPDATE positions SET vector_indexed = 1 for indexed fens
emit game:positions:indexed { gameId }

Note: the game level analysis is done incrementally as the positions resolve.
---


## APIS

`game:prioritize`

Called by: UI when navigating to a game.
Payload: { gameId, currentFen }

### Service:

UPDATE game_analysis SET priority = 1 WHERE game_id = ?
UPDATE positions SET priority = 2
  WHERE fen IN (game fens) AND priority < 2
UPDATE positions SET priority = 1 WHERE fen = currentFen
emit game:queue:updated { reason: 'priority_changed' }
emit position:queue:updated { reason: 'priority_changed' }
---

`position:prioritize`

Called by: UI when changing the position in a game.
Payload: { fen }

### Service:

UPDATE positions SET priority = 1 WHERE fen = ?
emit position:queue:updated { reason: 'priority_changed' }
---

`pgn:mutate`

Called by: UI after any tree mutation (variation, comment, NAG).
Payload: { gameId, pgn, currentFen }

### Service:

UPDATE games SET pgn = ? WHERE id = ?
emit pgn:mutated { gameId, pgn, currentFen }

_Note: UI does not wait for confirmation — mutates in-memory tree immediately, fire and forget on IPC._
---

## Notes:

#### Event Bus:
Introducing a new event bus to the backend to orchestrate services.

#### Games source of truth:
PGN in the games table will now be the source of truth for games. Any comments like NAGs, user generated comments, clock times, etc. will be stored in the PGN. When a game tree is needed, it will be parsed from the PGN, any changes to that tree should be serialized back to PGN and stored back in the games table.

#### Analysis machines hierarchy:
Game Analysis Orchestrator (singleton)
  → owns game_analysis
  → reacts to game:queue:updated
  → forwards position:queue:updated to active game machine
  → spawns/stops Game Analysis Machines
  → one game at a time

Game Analysis Machine (spawned per game)
  → parses PGN, walks tree
  → bulk INSERT OR IGNORE positions + game_positions on spawn
  → drains position queue for its game
  → computes eval curve incrementally
  → spawns/stops Position Analysis Machines
  → on completion: triggers NAG pass, emits game:analysis:complete
  → one position at a time

Position Analysis Machine (spawned per position)
  → checks positions cache first (status = complete, strength sufficient)
  → if cache hit: done signal immediately
  → if miss: runs Stockfish Classic + Stockfish + Maia engines
  → run the NAG classification that can be done purely by FEN
  → writes result to positions table
  → done signal back to Game Analysis Machine
  → tears down on complete or STOP


## New Tables:
Important: These are not the data models I want exactly. They are simply ideas to start with. They should be re-written to fit the real constraints of this system.

game_analysis (
  id                  INTEGER PRIMARY KEY,
  game_id             INTEGER NOT NULL REFERENCES games(id),
  priority            INTEGER DEFAULT 3,
  status              TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'complete'
  -- Aggregate results, computed once and persisted
  accuracy_white      REAL,
  accuracy_black      REAL,
  phase_accuracy_white_opening     REAL,
  phase_accuracy_white_middlegame  REAL,
  phase_accuracy_white_endgame     REAL,
  phase_accuracy_black_opening     REAL,
  phase_accuracy_black_middlegame  REAL,
  phase_accuracy_black_endgame     REAL,
  opening_eco         TEXT,
  opening_name        TEXT,
  analyzed_at         INTEGER,
  queued_at           INTEGER NOT NULL,
  UNIQUE (game_id)
);
Is the queue + the data results that stores what games should be analyzed and processed by the game analyzer

position_analysis (
  id           INTEGER PRIMARY KEY,
  fen          TEXT NOT NULL,
  config_hash  TEXT NOT NULL,
  priority     INTEGER DEFAULT 3,
  status       TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'complete'
  strength     INTEGER,
  result_json  TEXT,                   -- full engine output
  is_critical  INTEGER DEFAULT 0,
  vector_indexed INTEGER DEFAULT 0,
  analyzed_at  INTEGER,
  queued_at    INTEGER NOT NULL,
  UNIQUE (fen, config_hash)
);
Is the queue + the data results that stores what positions should be analyzed and processed by the position analyzer

game_positions (
  game_id            INTEGER NOT NULL REFERENCES games(id),
  position_analysis_id INTEGER NOT NULL REFERENCES position_analysis(id),
  fen                TEXT NOT NULL,   -- denormalized for query convenience
  PRIMARY KEY (game_id, position_analysis_id)
);
Join table connecting games to positions. Enables querying which games contain a position and hydrating a game's full position results in one query.

embeddings tables:
1. for bitboard representation of the position
2. positional features of the positions. reference the position_vector_table plan.

ui_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
Ephemeral UI preferences. can key on game id to cache things like current fen, etc.
