import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game/GameApp";
import type { GameMode } from "@/game/types";

type Search = { mode?: GameMode; room?: string };

export const Route = createFileRoute("/play")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: typeof s.mode === "string" ? (s.mode as GameMode) : "classic",
    room: typeof s.room === "string" ? s.room : undefined,
  }),
  component: Play,
});

function Play() {
  const { mode, room } = Route.useSearch();
  return <GameApp startMode={mode ?? "classic"} startRoom={room} />;
}
