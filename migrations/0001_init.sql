CREATE TABLE guild_config (
  guild_id   TEXT PRIMARY KEY,
  draw_time  TEXT NOT NULL,
  timezone   TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  role_id    TEXT NOT NULL,
  channel_id TEXT NOT NULL
);

-- 当日限りの参加登録
CREATE TABLE daily_entries (
  guild_id   TEXT NOT NULL,
  date       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, date, user_id)
);

-- 解除するまで毎日自動で参加する登録
CREATE TABLE auto_entries (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

-- 自動参加者が特定の日だけ参加を取り消したときの記録
CREATE TABLE daily_exclusions (
  guild_id   TEXT NOT NULL,
  date       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, date, user_id)
);

CREATE TABLE daily_results (
  guild_id  TEXT NOT NULL,
  date      TEXT NOT NULL,
  winner_id TEXT,
  drawn_at  TEXT NOT NULL,
  type      TEXT NOT NULL,
  PRIMARY KEY (guild_id, date)
);
