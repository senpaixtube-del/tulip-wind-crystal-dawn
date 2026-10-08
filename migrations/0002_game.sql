-- WAR OF SNAKE persistent game data

create table if not exists profiles (
  user_id text primary key,
  username text unique not null,
  level int not null default 1,
  xp int not null default 0,
  total_matches int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  eliminations int not null default 0,
  deaths int not null default 0,
  highest_score int not null default 0,
  longest_snake int not null default 0,
  total_play_seconds int not null default 0,
  global_score int not null default 0,
  weekly_score int not null default 0,
  monthly_score int not null default 0,
  skin text not null default 'neon-violet',
  title text not null default 'Rookie',
  is_admin boolean not null default false,
  banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_global_score_idx on profiles (global_score desc);
create index if not exists profiles_username_idx on profiles (username);

create table if not exists match_results (
  id serial primary key,
  match_id text not null,
  user_id text not null,
  mode text not null,
  score int not null,
  eliminations int not null,
  deaths int not null,
  length int not null,
  rank int not null,
  xp_earned int not null,
  duration_seconds int not null,
  ranking_delta int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists match_results_user_idx on match_results (user_id, created_at desc);
create index if not exists match_results_created_idx on match_results (created_at desc);

create table if not exists achievements (
  user_id text not null,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists friendships (
  id serial primary key,
  user_id text not null,
  other_id text not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (user_id, other_id)
);

create index if not exists friendships_user_idx on friendships (user_id, status);

create table if not exists reports (
  id serial primary key,
  reporter_id text not null,
  target_id text not null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  code text primary key,
  host_id text not null,
  mode text not null,
  status text not null default 'open',
  max_players int not null default 8,
  created_at timestamptz not null default now()
);

create table if not exists matchmaking (
  user_id text primary key,
  mode text not null,
  room_code text,
  status text not null default 'queued',
  updated_at timestamptz not null default now()
);

create table if not exists game_settings (
  key text primary key,
  value text not null
);

insert into game_settings (key, value)
  values ('max_match_players', '8')
  on conflict (key) do nothing;
