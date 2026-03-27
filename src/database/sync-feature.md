-- Tracks the last successful sync for each user-platform combination
CREATE TABLE sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  username TEXT NOT NULL,              -- User identifier (e.g., 'hikaru')
  platform TEXT NOT NULL,              -- 'chesscom' or 'lichess'
  
  last_synced_timestamp INTEGER,       -- Unix ms when last sync completed (NULL if never synced)
  last_synced_month TEXT,              -- 'YYYY-MM' format, most recent month synced (NULL if never synced)
  
  sync_status TEXT DEFAULT 'idle',     -- 'idle', 'in_progress', 'paused', 'completed'
  
  created_at INTEGER NOT NULL,         -- When this record was created
  updated_at INTEGER NOT NULL,         -- When this record was last updated
  
  UNIQUE(username, platform)           -- Only one metadata row per user-platform pair
);

-- Manages the queue of months to be synced
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  username TEXT NOT NULL,              -- User identifier
  platform TEXT NOT NULL,              -- 'chesscom' or 'lichess'
  month TEXT NOT NULL,                 -- 'YYYY-MM' format, the month to sync
  
  priority INTEGER NOT NULL,           -- Lower = higher priority (1 = current month, 2 = last month, etc.)
  status TEXT DEFAULT 'pending',       -- 'pending', 'in_progress', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,          -- Number of sync attempts (max 3 before marking failed)
  
  archive_url TEXT,                    -- Chess.com only: full API URL for this month (NULL for Lichess)
  
  last_attempt_at INTEGER,             -- Unix ms of last sync attempt (NULL if never attempted)
  completed_at INTEGER,                -- Unix ms when sync succeeded (NULL unless completed)
  error_message TEXT,                  -- Error message from last failed attempt (NULL if no errors)
  
  created_at INTEGER NOT NULL,         -- When this queue item was added
  
  UNIQUE(username, platform, month)    -- Only one queue item per month per user-platform
);

-- Index for efficient sync worker queries: "get next pending item by priority"
CREATE INDEX idx_sync_queue_status 
  ON sync_queue(username, platform, status, priority);