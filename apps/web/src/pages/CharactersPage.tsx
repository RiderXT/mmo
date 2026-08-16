import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CreateCharacterSchema } from "@mmo/shared";
import { AppShell } from "../components/AppShell";
import { inputClass } from "../components/admin/Field";
import { ApiError } from "../lib/apiClient";
import { listCharacters, createCharacter } from "../lib/charactersApi";
import { listPlayerClasses } from "../lib/classesApi";

export function CharactersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const classesQuery = useQuery({ queryKey: ["player-classes"], queryFn: listPlayerClasses });
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createCharacter,
    onSuccess: (character) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      setName("");
      setError(null);
      navigate(`/game/${character.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się utworzyć postaci"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateCharacterSchema.safeParse({ name, classId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  const classes = classesQuery.data ?? [];

  return (
    <AppShell>
      <h1 className="text-lg font-semibold text-parchment">Twoje postacie</h1>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {charactersQuery.data?.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/game/${c.id}`)}
            className="panel p-4 text-left transition hover:border-gold"
          >
            <p className="font-medium text-parchment">{c.name}</p>
            <p className="mt-1 text-sm text-parchment-dim">
              Poziom {c.level} · {c.exp} exp · {c.gold} złota
            </p>
          </button>
        ))}
      </div>

      {charactersQuery.data?.length === 0 && (
        <p className="mt-4 text-sm text-parchment-faint">Nie masz jeszcze żadnej postaci.</p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-md space-y-3 panel p-4"
      >
        <h2 className="font-medium text-parchment">Nowa postać</h2>
        <input
          className={inputClass}
          placeholder="Nazwa postaci"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div>
          <p className="mb-2 text-xs font-medium text-parchment-dim">Klasa</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => setClassId(cls.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  classId === cls.id
                    ? "border-gold bg-gold/10"
                    : "border-line hover:border-line-soft"
                }`}
              >
                <p className="font-medium text-parchment">{cls.name}</p>
                <p className="text-xs text-parchment-faint">główny staty: {cls.primaryStat}</p>
                {cls.description && <p className="mt-1 text-xs text-parchment-dim">{cls.description}</p>}
              </button>
            ))}
            {classes.length === 0 && (
              <p className="text-sm text-parchment-faint">Brak dostępnych klas — poproś admina o dodanie.</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
        >
          Utwórz postać
        </button>
      </form>
    </AppShell>
  );
}
