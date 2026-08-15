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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 panel p-6 shadow-xl"
      >
        <h1 className="text-xl font-semibold text-parchment">Rejestracja</h1>

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
            className="w-full  border border-line-soft bg-panel-raised px-3 py-2 text-parchment outline-none focus:border-gold"
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
            className="w-full  border border-line-soft bg-panel-raised px-3 py-2 text-parchment outline-none focus:border-gold"
            required
          />
          <p className="text-xs text-parchment-faint">
            Min. 10 znaków, wielka i mała litera oraz cyfra.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full  bg-gold py-2 font-medium text-ink transition hover:bg-gold-bright disabled:opacity-50"
        >
          {submitting ? "Tworzenie konta…" : "Utwórz konto"}
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
