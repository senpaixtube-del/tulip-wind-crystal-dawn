import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game/GameApp";

export const Route = createFileRoute("/room/$code")({ component: Room });

function Room() {
  const { code } = Route.useParams();
  return <GameApp startMode="private" startRoom={code} />;
}
