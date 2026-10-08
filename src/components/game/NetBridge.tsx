import { useEffect, type MutableRefObject } from "react";
import { useP2PRoom } from "@/lib/multiplayer";
import type { GameEngine } from "@/game/engine";

export function NetBridge({
  room,
  name,
  engineRef,
}: {
  room: string;
  name: string;
  engineRef: MutableRefObject<GameEngine | null>;
}) {
  const p2p = useP2PRoom({ room, name, enabled: true });

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.cfgPatch(p2p.broadcast, p2p.send);
    const unsub = p2p.onMessage((from, data) => eng.onNet(from, data));
    eng.setPeers(p2p.peers.filter((p) => p.connectionState === "connected").map((p) => p.id));
    if (p2p.joined) eng.hello();
    return unsub;
  }, [engineRef, p2p, p2p.peers, p2p.joined, p2p.onMessage, p2p.broadcast, p2p.send]);

  return null;
}
