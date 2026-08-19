import type { Character } from "@mmo/shared";
import { DailyLoginPanel } from "../../components/dailyLogin/DailyLoginPanel";

export function DailyLoginTab({ character }: { character: Character }) {
  return <DailyLoginPanel characterId={character.id} />;
}
