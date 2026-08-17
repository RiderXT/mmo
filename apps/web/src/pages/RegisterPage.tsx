import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RegisterSchema } from "@mmo/shared";
import { registerRequest } from "../lib/authApi";
import { ApiError } from "../lib/apiClient";
import { useAuthStore } from "../store/authStore";

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = RegisterSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }

    setSubmitting(true);
    try {
      const { user, accessToken } = await registerRequest(parsed.data);
      setSession(user, accessToken);
      navigate("/characters");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nie udało się utworzyć konta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        backgroundImage:
          "repeating-linear-gradient(115deg, oklch(17% 0.025 45) 0px, oklch(17% 0.025 45) 2px, oklch(15% 0.02 45) 2px, oklch(15% 0.02 45) 26px)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, oklch(30% 0.06 60 / 0.35), transparent 60%)" }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-gold/25 bg-gradient-to-b from-panel-raised to-panel p-9 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="mb-2 text-center">
          <h1 className="font-display text-3xl font-bold tracking-[0.08em] text-gold">FIGHT CLUB</h1>
          <p className="mt-2 text-xs tracking-[0.05em] text-parchment-faint">ZAŁÓŻ KONTO</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-parchment-dim" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line-soft bg-ink px-3 py-2.5 text-parchment outline-none focus:border-gold"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-parchment-dim" htmlFor="password">
            Hasło
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line-soft bg-ink px-3 py-2.5 text-parchment outline-none focus:border-gold"
            required
          />
          <p className="text-xs text-parchment-faint">Min. 10 znaków, wielka i mała litera oraz cyfra.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold py-3 font-bold tracking-[0.03em] text-ink shadow-[0_3px_14px_rgba(0,0,0,0.3)] transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? "TWORZENIE KONTA…" : "UTWÓRZ KONTO"}
        </button>

        <p className="text-center text-sm text-parchment-dim">
          Masz już konto?{" "}
          <Link to="/login" className="text-gold-bright hover:underline">
            Zaloguj się
          </Link>
        </p>
      </form>
    </div>
  );
}
