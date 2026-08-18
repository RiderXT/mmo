import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CharacterState {
  activeCharacterId: string | null;
  setActiveCharacterId: (id: string | null) => void;
}

/** Persisted so the active character survives a page reload now that /game routes no longer
 * carry the characterId in the URL (it lived in the path before this store existed). */
export const useCharacterStore = create<CharacterState>()(
  persist(
    (set) => ({
      activeCharacterId: null,
      setActiveCharacterId: (id) => set({ activeCharacterId: id }),
    }),
    { name: "mmo-active-character" },
  ),
);
