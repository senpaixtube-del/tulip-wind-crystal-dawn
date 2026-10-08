import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ACHIEVEMENT_DEFS, xpToNext } from "@/game/constants";

export type ProfileRow = {
  user_id: string;
  username: string;
  level: number;
  xp: number;
  total_matches: number;
  wins: number;
  losses: number;
  eliminations: number;
  deaths: number;
  highest_score: number;
  longest_snake: number;
  total_play_seconds: number;
  global_score: number;
  weekly_score: number;
  monthly_score: number;
  skin: string;
  title: string;
  is_admin: boolean;
  banned: boolean;
};

function slugName(raw: string) {
  const base = raw
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 12) || "Slither";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

async function ensureProfile(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  fallbackName: string,
): Promise<ProfileRow> {
  const existing = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
  if (existing[0]) return existing[0];
  let username = slugName(fallbackName);
  for (let i = 0; i < 6; i++) {
    const clash = await sql<{ c: number }>`select count(*)::int as c from profiles where username = ${username}`;
    if ((clash[0]?.c ?? 0) === 0) break;
    username = slugName(fallbackName + i);
  }
  const admins = await sql<{ c: number }>`select count(*)::int as c from profiles where is_admin = true`;
  const isAdmin = (admins[0]?.c ?? 0) === 0;
  await sql`
    insert into profiles (user_id, username, is_admin)
    values (${userId}, ${username}, ${isAdmin})
  `;
  const created = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
  return created[0]!;
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await ensureProfile(sql, context.userId, "Player");
    const rankRows = await sql<{ rank: number }>`
      select 1 + count(*)::int as rank from profiles
      where global_score > ${profile.global_score} and banned = false
    `;
    const unlocked = await sql<{ achievement_id: string; unlocked_at: string }>`
      select achievement_id, unlocked_at from achievements where user_id = ${context.userId}
    `;
    const history = await sql<{
      match_id: string;
      mode: string;
      score: number;
      eliminations: number;
      rank: number;
      xp_earned: number;
      created_at: string;
    }>`
      select match_id, mode, score, eliminations, rank, xp_earned, created_at
      from match_results where user_id = ${context.userId}
      order by created_at desc limit 12
    `;
    return {
      ...profile,
      global_rank: rankRows[0]?.rank ?? 1,
      achievements: unlocked,
      history,
    };
  });

export const updateUsername = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { username: string }) => {
    const username = v.username.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
    if (username.length < 3) throw new Error("Username must be 3–16 letters");
    return { username };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(sql, context.userId, data.username);
    const clash = await sql<{ c: number }>`
      select count(*)::int as c from profiles
      where username = ${data.username} and user_id <> ${context.userId}
    `;
    if ((clash[0]?.c ?? 0) > 0) throw new Error("Username taken");
    await sql`update profiles set username = ${data.username}, updated_at = now() where user_id = ${context.userId}`;
    return { ok: true, username: data.username };
  });

export const updateLoadout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { skin?: string; title?: string }) => v)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await ensureProfile(sql, context.userId, "Player");
    const skin = data.skin ?? p.skin;
    const title = data.title ?? p.title;
    await sql`update profiles set skin = ${skin}, title = ${title}, updated_at = now() where user_id = ${context.userId}`;
    return { ok: true };
  });

const MATCH_IN = z.object({
  matchId: z.string().min(4).max(64),
  mode: z.enum(["practice", "classic", "team", "survival", "private"]),
  score: z.number().int().min(0).max(500000),
  eliminations: z.number().int().min(0).max(80),
  deaths: z.number().int().min(0).max(20),
  length: z.number().int().min(0).max(260),
  rank: z.number().int().min(1).max(32),
  durationSeconds: z.number().int().min(5).max(1800),
});

export const submitMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: unknown) => MATCH_IN.parse(v))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await ensureProfile(sql, context.userId, "Player");
    if (p.banned) throw new Error("Account banned");

    const maxScore = 80 * data.durationSeconds + data.eliminations * 400;
    const score = Math.min(data.score, maxScore);
    const ranked = data.mode === "classic" || data.mode === "team" || data.mode === "private";
    const win = ranked && data.rank === 1;
    const xp = Math.max(
      8,
      Math.floor(score * 0.12 + data.eliminations * 40 + data.durationSeconds * 0.4 + (win ? 180 : 0)),
    );
    const rankingDelta = ranked
      ? Math.round((12 - data.rank) * 14 + data.eliminations * 8 - data.deaths * 6)
      : Math.round(data.eliminations * 4);

    let level = p.level;
    let curXp = p.xp + xp;
    let next = xpToNext(level);
    while (curXp >= next && level < 99) {
      curXp -= next;
      level += 1;
      next = xpToNext(level);
    }

    const weekly = p.weekly_score + (ranked ? score : Math.floor(score * 0.25));
    const monthly = p.monthly_score + (ranked ? score : Math.floor(score * 0.25));
    const global = Math.max(0, p.global_score + rankingDelta + Math.floor(score * 0.05));

    await sql`
      update profiles set
        level = ${level},
        xp = ${curXp},
        total_matches = ${p.total_matches + 1},
        wins = ${p.wins + (win ? 1 : 0)},
        losses = ${p.losses + (!win && ranked ? 1 : 0)},
        eliminations = ${p.eliminations + data.eliminations},
        deaths = ${p.deaths + data.deaths},
        highest_score = ${Math.max(p.highest_score, score)},
        longest_snake = ${Math.max(p.longest_snake, data.length)},
        total_play_seconds = ${p.total_play_seconds + data.durationSeconds},
        global_score = ${global},
        weekly_score = ${weekly},
        monthly_score = ${monthly},
        updated_at = now()
      where user_id = ${context.userId}
    `;

    await sql`
      insert into match_results (
        match_id, user_id, mode, score, eliminations, deaths, length, rank, xp_earned, duration_seconds, ranking_delta
      ) values (
        ${data.matchId}, ${context.userId}, ${data.mode}, ${score}, ${data.eliminations},
        ${data.deaths}, ${data.length}, ${data.rank}, ${xp}, ${data.durationSeconds}, ${rankingDelta}
      )
    `;

    const unlocked: string[] = [];
    const has = async (id: string) => {
      const r = await sql<{ c: number }>`
        select count(*)::int as c from achievements where user_id = ${context.userId} and achievement_id = ${id}
      `;
      return (r[0]?.c ?? 0) > 0;
    };
    const give = async (id: string, ok: boolean) => {
      if (!ok || (await has(id))) return;
      await sql`insert into achievements (user_id, achievement_id) values (${context.userId}, ${id}) on conflict do nothing`;
      unlocked.push(id);
    };

    await give("first_blood", p.eliminations + data.eliminations >= 1);
    await give("survivor", data.durationSeconds >= 180);
    await give("snake_master", data.length >= 80);
    await give("hundred_kills", p.eliminations + data.eliminations >= 100);
    await give("millionaire", score >= 10000);
    await give("untouchable", win && data.deaths === 0);
    await give("longest_snake", data.length >= 120);
    await give("arena_champion", p.wins + (win ? 1 : 0) >= 10);

    const weeklyRank = await sql<{ rank: number }>`
      select 1 + count(*)::int as rank from profiles where weekly_score > ${weekly} and banned = false
    `;
    await give("weekly_champion", (weeklyRank[0]?.rank ?? 99) === 1 && weekly > 0);

    void ACHIEVEMENT_DEFS;
    return { xp, rankingDelta, level, xpInto: curXp, xpNext: xpToNext(level), unlocked, global };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .validator((v: { category?: string } = {}) => ({
    category: v.category ?? "global",
  }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const cat = data.category;
    const order =
      cat === "highest"
        ? "highest_score"
        : cat === "elims"
          ? "eliminations"
          : cat === "length"
            ? "longest_snake"
            : cat === "wins"
              ? "wins"
              : cat === "weekly"
                ? "weekly_score"
                : cat === "monthly"
                  ? "monthly_score"
                  : "global_score";
    const rows = await sql.query<ProfileRow>(
      `select * from profiles where banned = false order by ${order} desc, username asc limit 50`,
    );
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      level: r.level,
      score: cat === "highest" ? r.highest_score : cat === "elims" ? r.eliminations : cat === "length" ? r.longest_snake : cat === "wins" ? r.wins : cat === "weekly" ? r.weekly_score : cat === "monthly" ? r.monthly_score : r.global_score,
      wins: r.wins,
      eliminations: r.eliminations,
      user_id: r.user_id,
    }));
  });

export const joinQueue = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { mode: string }) => ({ mode: v.mode }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await ensureProfile(sql, context.userId, "Player");
    if (p.banned) throw new Error("Account banned");
    const mode = data.mode;
    const open = await sql<{ code: string }>`
      select code from rooms where mode = ${mode} and status = 'open' order by created_at desc limit 1
    `;
    let code = open[0]?.code;
    if (!code) {
      code = `${mode}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 24);
      await sql`
        insert into rooms (code, host_id, mode, status) values (${code}, ${context.userId}, ${mode}, 'open')
      `;
    }
    await sql`
      insert into matchmaking (user_id, mode, room_code, status, updated_at)
      values (${context.userId}, ${mode}, ${code}, 'queued', now())
      on conflict (user_id) do update set mode = ${mode}, room_code = ${code}, status = 'queued', updated_at = now()
    `;
    const peers = await sql<{ c: number }>`
      select count(*)::int as c from matchmaking where room_code = ${code} and updated_at > now() - interval '20 seconds'
    `;
    return { room: code, players: peers[0]?.c ?? 1, target: 8 };
  });

export const createPrivateRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { mode?: string } = {}) => ({ mode: v.mode ?? "classic" }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(sql, context.userId, "Player");
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await sql`
      insert into rooms (code, host_id, mode, status) values (${code}, ${context.userId}, ${data.mode}, 'open')
    `;
    return { code };
  });

export const lookupRoom = createServerFn({ method: "GET" })
  .validator((v: { code: string }) => ({ code: v.code.trim().toUpperCase() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ code: string; mode: string; status: string }>`
      select code, mode, status from rooms where code = ${data.code} limit 1
    `;
    return rows[0] ?? null;
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { username: string }) => ({ username: v.username.trim() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const other = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username} limit 1`;
    if (!other[0]) throw new Error("Player not found");
    if (other[0].user_id === context.userId) throw new Error("That's you");
    await sql`
      insert into friendships (user_id, other_id, status)
      values (${context.userId}, ${other[0].user_id}, 'pending')
      on conflict (user_id, other_id) do nothing
    `;
    return { ok: true };
  });

export const listFriends = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ username: string; status: string; level: number }>`
      select p.username, f.status, p.level
      from friendships f
      join profiles p on p.user_id = f.other_id
      where f.user_id = ${context.userId}
      order by f.created_at desc
      limit 40
    `;
  });

export const reportPlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { username: string; reason: string }) => ({
    username: v.username.trim().slice(0, 24),
    reason: v.reason.trim().slice(0, 280),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const other = await sql<{ user_id: string }>`select user_id from profiles where username = ${data.username} limit 1`;
    if (!other[0]) throw new Error("Player not found");
    await sql`
      insert into reports (reporter_id, target_id, reason)
      values (${context.userId}, ${other[0].user_id}, ${data.reason})
    `;
    return { ok: true };
  });

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ is_admin: boolean }>`select is_admin from profiles where user_id = ${userId} limit 1`;
  if (!rows[0]?.is_admin) throw new Error("Forbidden");
  return sql;
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await requireAdmin(context.userId);
    const players = await sql<{ c: number }>`select count(*)::int as c from profiles`;
    const matches = await sql<{ c: number }>`select count(*)::int as c from match_results`;
    const reports = await sql<{
      id: number;
      reason: string;
      status: string;
      created_at: string;
    }>`select id, reason, status, created_at from reports order by created_at desc limit 20`;
    const recent = await sql<{ username: string; level: number; global_score: number; banned: boolean }>`
      select username, level, global_score, banned from profiles order by updated_at desc limit 20
    `;
    const rooms = await sql<{ code: string; mode: string; status: string }>`
      select code, mode, status from rooms order by created_at desc limit 12
    `;
    return {
      players: players[0]?.c ?? 0,
      matches: matches[0]?.c ?? 0,
      reports,
      recent,
      rooms,
    };
  });

export const adminBan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((v: { username: string; banned: boolean; reason?: string }) => v)
  .handler(async ({ context, data }) => {
    const sql = await requireAdmin(context.userId);
    await sql`
      update profiles set banned = ${data.banned}, ban_reason = ${data.reason ?? null}
      where username = ${data.username}
    `;
    return { ok: true };
  });

export const adminSearch = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((v: { q: string }) => ({ q: v.q.trim() }))
  .handler(async ({ context, data }) => {
    const sql = await requireAdmin(context.userId);
    const q = `%${data.q}%`;
    return sql<ProfileRow>`
      select * from profiles where username ilike ${q} order by global_score desc limit 20
    `;
  });
