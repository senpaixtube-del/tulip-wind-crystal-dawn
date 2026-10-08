import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminBan,
  adminOverview,
  adminSearch,
  getLeaderboard,
  getMyProfile,
  listFriends,
  reportPlayer,
  sendFriendRequest,
  updateLoadout,
  updateUsername,
} from "@/lib/game-api";
import { useSettings, type Quality } from "@/lib/settings";
import { ACHIEVEMENT_DEFS, SKINS, TITLES } from "@/game/constants";
import { Link } from "@tanstack/react-router";

function Shell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-auto bg-bg/55 p-4 pt-16 backdrop-blur-[2px]">
      <div className="panel-strong mb-8 w-full max-w-2xl rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-widest">{title}</h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [friends, setFriends] = useState<Array<{ username: string; status: string; level: number }>>([]);

  useEffect(() => {
    if (!user) return;
    void getMyProfile()
      .then((p) => {
        setProfile(p);
        setName(p.username);
      })
      .catch(() => setMsg("Could not load profile"));
    void listFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [user]);

  if (isPending) return <Shell title="PROFILE" onClose={onClose}><div className="h-24 animate-pulse rounded-md bg-surface" /></Shell>;
  if (!user) {
    return (
      <Shell title="PROFILE" onClose={onClose}>
        <p className="text-muted">Sign in to save stats, XP, and skins across devices.</p>
        <Link to="/login" className="menu-btn menu-btn-primary mt-4">
          Sign in
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="PROFILE" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-xl">{profile?.username ?? user.displayName}</div>
          <div className="text-sm text-muted">
            Lv {profile?.level ?? 1} · Rank #{profile?.global_rank ?? "—"} · {profile?.title}
          </div>
        </div>
        <UserButton />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        {[
          ["Matches", profile?.total_matches],
          ["Wins", profile?.wins],
          ["Losses", profile?.losses],
          ["Eliminations", profile?.eliminations],
          ["Deaths", profile?.deaths],
          ["Highest", profile?.highest_score],
          ["Longest", profile?.longest_snake],
          ["Play time", `${Math.floor((profile?.total_play_seconds ?? 0) / 60)}m`],
          ["Score", profile?.global_score],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-md border border-border bg-surface px-3 py-2">
            <div className="text-[11px] tracking-widest text-muted uppercase">{k}</div>
            <div className="font-mono text-lg tabular-nums">{v ?? 0}</div>
          </div>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await updateUsername({ data: { username: name } });
            setMsg(`Username set to ${r.username}`);
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3"
        />
        <button type="submit" className="menu-btn w-auto px-4">
          Save
        </button>
      </form>
      <div className="mt-4">
        <div className="text-xs tracking-widest text-muted">SKINS</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={(profile?.level ?? 1) < s.minLevel}
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => void updateLoadout({ data: { skin: s.id } })}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xs tracking-widest text-muted">TITLES</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TITLES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={(profile?.level ?? 1) < t.minLevel}
              className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => void updateLoadout({ data: { title: t.id } })}
            >
              {t.id}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="text-xs tracking-widest text-muted">MATCH HISTORY</div>
        <ul className="mt-2 space-y-1 text-sm">
          {(profile?.history ?? []).map((h) => (
            <li key={h.match_id + h.created_at} className="flex justify-between text-muted">
              <span>
                {h.mode} · #{h.rank}
              </span>
              <span className="font-mono">
                {h.score} · +{h.xp_earned} XP
              </span>
            </li>
          ))}
        </ul>
      </div>
      <FriendBox friends={friends} />
      {msg && <p className="mt-3 text-sm text-cyan">{msg}</p>}
    </Shell>
  );
}

function FriendBox({ friends }: { friends: Array<{ username: string; status: string; level: number }> }) {
  const [name, setName] = useState("");
  const [report, setReport] = useState("");
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="text-xs tracking-widest text-muted">SOCIAL</div>
      <ul className="mt-2 space-y-1 text-sm">
        {friends.map((f) => (
          <li key={f.username} className="flex justify-between">
            <span>
              {f.username} · Lv {f.level}
            </span>
            <span className="text-muted">{f.status}</span>
          </li>
        ))}
        {friends.length === 0 && <li className="text-muted">No friends yet</li>}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await sendFriendRequest({ data: { username: name } });
            setName("");
          } catch {
            /* ignore */
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add friend by username"
          className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
        />
        <button type="submit" className="menu-btn w-auto px-3">
          Add
        </button>
      </form>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const [u, ...rest] = report.split(":");
          if (!u) return;
          await reportPlayer({ data: { username: u.trim(), reason: rest.join(":") || "report" } });
          setReport("");
        }}
      >
        <input
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="Report user:reason"
          className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
        />
        <button type="submit" className="menu-btn w-auto px-3">
          Report
        </button>
      </form>
    </div>
  );
}

export function LeaderboardPanel({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState("global");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getLeaderboard>>>([]);
  const { user } = useCurrentUserState();
  const cats = [
    ["global", "Global"],
    ["highest", "Highest"],
    ["elims", "Eliminations"],
    ["length", "Longest"],
    ["wins", "Wins"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
  ];
  useEffect(() => {
    void getLeaderboard({ data: { category: cat } }).then(setRows).catch(() => setRows([]));
  }, [cat]);
  return (
    <Shell title="LEADERBOARD" onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {cats.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${cat === id ? "border-primary text-primary" : "border-border"}`}
            onClick={() => setCat(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ol className="mt-4 space-y-1">
        {rows.map((r) => (
          <li
            key={r.user_id}
            className={`flex items-center justify-between rounded-md px-2 py-1 text-sm ${user && r.user_id === user.id ? "bg-primary/15 text-gold" : ""}`}
          >
            <span className="flex gap-3">
              <span className="w-6 font-mono text-muted">{r.rank}</span>
              <span>
                {r.username} <span className="text-muted">Lv {r.level}</span>
              </span>
            </span>
            <span className="font-mono">
              {r.score} · {r.wins}W · {r.eliminations}E
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted">No ranked hunters yet. Be first.</li>}
      </ol>
    </Shell>
  );
}

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useCurrentUserState();
  const [got, setGot] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    void getMyProfile()
      .then((p) => setGot(new Set(p.achievements.map((a) => a.achievement_id))))
      .catch(() => {});
  }, [user]);
  return (
    <Shell title="ACHIEVEMENTS" onClose={onClose}>
      <div className="grid gap-2">
        {ACHIEVEMENT_DEFS.map((a) => (
          <div
            key={a.id}
            className={`rounded-md border px-3 py-2 ${got.has(a.id) ? "border-gold/50 bg-gold/10" : "border-border opacity-70"}`}
          >
            <div className="font-display tracking-widest">{a.name}</div>
            <div className="text-sm text-muted">{a.desc}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <Shell title="SETTINGS" onClose={onClose}>
      <label className="block text-sm">
        Graphics
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3"
          value={s.quality}
          onChange={(e) => s.set({ quality: e.target.value as Quality })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {[
        ["Sound", "master", s.master],
        ["Music", "music", s.music],
        ["Effects", "sfx", s.sfx],
      ].map(([label, key, val]) => (
        <label key={key} className="mt-3 block text-sm">
          {label}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={val as number}
            className="mt-1 w-full"
            onChange={(e) => s.set({ [key]: Number(e.target.value) } as never)}
          />
        </label>
      ))}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.showFps}
          onChange={(e) => s.set({ showFps: e.target.checked })}
        />
        Show FPS
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.showPing}
          onChange={(e) => s.set({ showPing: e.target.checked })}
        />
        Show Ping
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.shake}
          onChange={(e) => s.set({ shake: e.target.checked })}
        />
        Screen shake
      </label>
      <button
        type="button"
        className="menu-btn mt-4"
        onClick={() => {
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
          else void document.exitFullscreen();
        }}
      >
        Toggle Fullscreen
      </button>
      <p className="mt-4 text-xs text-muted">
        Mouse aim · A/D turn · Space boost · Q shield · E magnet
      </p>
    </Shell>
  );
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Awaited<ReturnType<typeof adminSearch>>>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    void adminOverview()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Forbidden"));
  }, []);
  return (
    <Shell title="ADMIN" onClose={onClose}>
      {err && <p className="text-danger">{err}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border p-3">
              Players {data.players}
            </div>
            <div className="rounded-md border border-border p-3">
              Matches {data.matches}
            </div>
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setFound(await adminSearch({ data: { q } }));
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3"
              placeholder="Search player"
            />
            <button type="submit" className="menu-btn w-auto px-3">
              Search
            </button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {(found.length ? found : data.recent).map((p) => (
              <li key={p.username} className="flex items-center justify-between">
                <span>
                  {p.username} · Lv {p.level} {p.banned ? "(banned)" : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-danger"
                  onClick={() =>
                    void adminBan({ data: { username: p.username, banned: !p.banned } }).then(() =>
                      adminOverview().then(setData),
                    )
                  }
                >
                  {p.banned ? "Unban" : "Ban"}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 text-xs tracking-widest text-muted">REPORTS</div>
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {data.reports.map((r) => (
              <li key={r.id}>
                #{r.id} {r.reason} · {r.status}
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  );
}
