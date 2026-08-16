import type { Character } from "@mmo/shared";
import { ExpeditionPanel } from "../../components/expedition/ExpeditionPanel";

export function ExpeditionsTab({ character, onClaimed }: { character: Character; onClaimed: () => void }) {
  return <ExpeditionPanel character={character} onClaimed={onClaimed} />;
}
