import { useState } from "react";
import type { Character } from "@mmo/shared";
import { LobbyBrowserModal } from "./LobbyBrowserModal";

/** Compact "Lobby" trigger shown alongside solo "Ruszaj" (MonsterAttackPanel) when a character
 * stands in an eligible combat zone — opens LobbyBrowserModal's popup instead of showing the list
 * inline. LiveLobbyCombatCard's own "Członkowie" popup takes over once character.activeLobbyId is
 * set (mirrors how activeExpeditionId already takes over the tab for solo combat). */
export function LobbyEntryPanel({ character, zoneId }: { character: Character; zoneId: string }) {
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="mt-3 border-t border-line-soft/40 pt-3">
      <button
        onClick={() => setBrowsing(true)}
        className="w-full rounded-md border border-line-soft px-3 py-2 text-xs font-medium text-parchment-dim transition hover:border-gold/60 hover:text-gold-bright"
      >
        Wspólna walka (lobby, do 3 postaci)
      </button>

      {browsing && (
        <LobbyBrowserModal
          character={character}
          zoneId={zoneId}
          onClose={() => setBrowsing(false)}
          onJoined={() => setBrowsing(false)}
        />
      )}
    </div>
  );
}
