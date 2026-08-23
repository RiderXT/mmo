import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CreateCharacterSchema, type CoreStatKey } from "@mmo/shared";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ProgressBar } from "../components/common/ProgressBar";
import { ApiError } from "../lib/apiClient";
import { listCharacters, createCharacter } from "../lib/charactersApi";
import { listPlayerClasses } from "../lib/classesApi";
import { useCharacterStore } from "../store/characterStore";

const STAT_LABELS: Record<CoreStatKey, string> = {
  strength: "Siła",
  vitality: "Witalność",
  dexterity: "Zręczność",
  intelligence: "Inteligencja",
};
const CORE_STATS = Object.keys(STAT_LABELS) as CoreStatKey[];

/** Decorative "no artwork yet" backdrop for the portrait area — same honest-placeholder spirit
 * as ItemTypeIcon/SkillSygil (plain, not a fake image) using the existing panel tokens so it
 * sits comfortably next to real panels instead of looking like a broken image. */
function PortraitBackdrop({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{
        backgroundColor: "oklch(23% 0.006 45)",
        backgroundImage:
          "repeating-linear-gradient(125deg, oklch(23% 0.006 45) 0px, oklch(23% 0.006 45) 16px, oklch(28% 0.007 45) 16px, oklch(28% 0.007 45) 32px)",
      }}
    />
  );
}

export function CharactersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveCharacterId = useCharacterStore((s) => s.setActiveCharacterId);
  const charactersQuery = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const classesQuery = useQuery({ queryKey: ["player-classes"], queryFn: listPlayerClasses });

  const characters = charactersQuery.data ?? [];
  const classes = classesQuery.data ?? [];

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // First load: jump straight into character showcase if one exists, otherwise straight into
  // creation — there's nothing useful to show on an empty "select a character" screen.
  useEffect(() => {
    if (charactersQuery.isLoading || selectedCharacterId || isCreating) return;
    if (characters.length > 0) setSelectedCharacterId(characters[0].id);
    else setIsCreating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charactersQuery.isLoading]);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? null;
  const selectedCharacterClass = selectedCharacter
    ? classes.find((cl) => cl.id === selectedCharacter.classId)
    : undefined;
  const selectedClass = classes.find((cl) => cl.id === selectedClassId) ?? classes[0];

  const createMutation = useMutation({
    mutationFn: createCharacter,
    onSuccess: (character) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      setName("");
      setError(null);
      setIsCreating(false);
      setSelectedCharacterId(character.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się utworzyć postaci"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateCharacterSchema.safeParse({ name, classId: selectedClassId ?? "" });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  function enterWorld() {
    if (!selectedCharacter) return;
    setActiveCharacterId(selectedCharacter.id);
    navigate("/game/character");
  }

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-[300px_1fr] md:items-start">
        {/* SIDEBAR — character roster */}
        <div className="flex flex-col gap-2">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            Wybierz postać
          </p>
          {characters.map((c) => {
            const cls = classes.find((cl) => cl.id === c.classId);
            const active = c.id === selectedCharacterId && !isCreating;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCharacterId(c.id);
                  setIsCreating(false);
                }}
                className={`flex items-center gap-3 border p-3 text-left transition ${
                  active ? "border-gold bg-gold/10" : "border-line hover:border-line-soft"
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
                  <span className="font-display text-lg text-parchment-faint">{c.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm text-parchment">{c.name}</p>
                  <p className="text-xs text-parchment-faint">
                    Poz. {c.level} {cls ? `· ${cls.name}` : ""}
                  </p>
                </div>
              </button>
            );
          })}

          {characters.length === 0 && !charactersQuery.isLoading && (
            <p className="text-sm text-parchment-faint">Nie masz jeszcze żadnej postaci.</p>
          )}

          {isCreating ? (
            <div className="flex items-center justify-between border border-gold/40 bg-gold/5 p-3">
              <span className="font-display text-xs uppercase tracking-widest text-gold-bright">Tworzenie postaci</span>
              {characters.length > 0 && (
                <button
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-parchment-dim hover:text-parchment"
                >
                  Anuluj
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="border border-dashed border-line-soft p-3 text-center font-display text-xs uppercase tracking-widest text-parchment-faint transition hover:border-gold hover:text-gold"
            >
              + Stwórz nową postać
            </button>
          )}
        </div>

        {/* MAIN — showcase or creation */}
        {isCreating ? (
          <div className="flex flex-col gap-3">
            {classes.length === 0 ? (
              <p className="text-sm text-parchment-faint">Brak dostępnych klas — poproś admina o dodanie.</p>
            ) : (
              <>
                <div className="flex gap-1 overflow-x-auto border-b border-line pb-px">
                  {classes.map((cls) => (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`shrink-0 border-b-2 px-4 py-2.5 text-left transition ${
                        cls.id === selectedClassId ? "border-gold opacity-100" : "border-transparent opacity-55 hover:opacity-80"
                      }`}
                    >
                      <p className="font-display text-sm text-parchment">{cls.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-parchment-faint">
                        {STAT_LABELS[cls.primaryStat]}
                      </p>
                    </button>
                  ))}
                </div>

                {selectedClass && (
                  <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                    <div className="relative aspect-[4/5] border border-line-soft">
                      <PortraitBackdrop />
                      <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-display text-xs uppercase tracking-widest text-parchment-faint">
                        {selectedClass.name}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <h2 className="font-display text-2xl font-semibold text-parchment">{selectedClass.name}</h2>
                        <p className="mt-0.5 text-xs uppercase tracking-widest text-gold">
                          Główny atrybut: {STAT_LABELS[selectedClass.primaryStat]}
                        </p>
                      </div>
                      {selectedClass.description && (
                        <p className="text-sm leading-relaxed text-parchment-dim">{selectedClass.description}</p>
                      )}

                      <div className="flex flex-col gap-1.5">
                        {selectedClass.skills.map((skill) => (
                          <div key={skill.id} className="border border-line-soft bg-panel p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-display text-xs text-parchment">{skill.name}</p>
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-parchment-faint">
                                {skill.kind === "active" ? "Aktywna" : "Pasywna"}
                              </span>
                            </div>
                            {skill.description && (
                              <p className="mt-1 text-xs leading-relaxed text-parchment-faint">{skill.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 border border-line bg-panel p-4">
                  <input
                    className="min-w-[200px] flex-1 border border-line-soft bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
                    placeholder="Nazwa postaci"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="bg-gold px-6 py-2 font-display text-xs font-semibold uppercase tracking-widest text-ink transition hover:bg-gold-bright disabled:opacity-50"
                  >
                    Utwórz postać
                  </button>
                </form>
                {error && (
                  <p role="alert" className="text-sm text-red-400">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        ) : selectedCharacter ? (
          <div className="relative flex min-h-[460px] flex-col justify-end overflow-hidden border border-line-soft">
            <PortraitBackdrop />

            {/* Positioning lives on this wrapper, not on PanelFrame itself — PanelFrame's root
                div already hardcodes "relative" (for its own corner-ornament children), and
                Tailwind's fixed utility ordering makes that "relative" win over an "absolute"
                passed in via className on the SAME element regardless of source order, silently
                dropping the panel back into normal flow (and then clipped by this card's
                overflow-hidden) instead of pinning it to the corner. */}
            <div className="absolute right-4 top-4 hidden w-56 sm:block">
              <PanelFrame title="Statystyki" emphasis="secondary">
                <div className="flex flex-col gap-2.5">
                  {(() => {
                    // Stats grow without an upper bound, and players allocate every point
                    // themselves — a fixed scale either pins a heavily-specialized veteran's
                    // stats near 100% (making everything else invisible) or leaves a fresh
                    // level-1 character's bars as barely-visible slivers. Scaling each bar
                    // against this character's OWN total across all four stats keeps the bars
                    // an honest picture of their build's shape at any stage of progression.
                    const total = CORE_STATS.reduce((sum, stat) => sum + selectedCharacter[stat], 0) || 1;
                    return CORE_STATS.map((stat) => {
                      const value = selectedCharacter[stat];
                      return (
                        <div key={stat}>
                          <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-parchment-faint">
                            <span>{STAT_LABELS[stat]}</span>
                            <span className="tabular-nums text-parchment-dim">{value}</span>
                          </div>
                          <ProgressBar
                            pct={(value / total) * 100}
                            barClassName="bg-gradient-to-r from-gold/70 to-gold-bright"
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              </PanelFrame>
            </div>

            <div className="relative flex flex-wrap items-end justify-between gap-4 bg-gradient-to-t from-ink via-ink/80 to-transparent p-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gold">
                  {selectedCharacterClass ? `${selectedCharacterClass.name} · ` : ""}
                  Poz. {selectedCharacter.level}
                </p>
                <h2 className="font-display text-4xl font-semibold text-parchment">{selectedCharacter.name}</h2>
                <p className="mt-1 text-sm text-parchment-dim">
                  {selectedCharacter.exp} exp · {selectedCharacter.gold} złota
                </p>
              </div>
              <button
                onClick={enterWorld}
                className="bg-gold px-8 py-3 font-display text-sm font-semibold uppercase tracking-widest text-ink transition hover:bg-gold-bright"
              >
                Wejdź do gry
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-parchment-faint">Wybierz postać z listy.</p>
        )}
      </div>
    </AppShell>
  );
}
