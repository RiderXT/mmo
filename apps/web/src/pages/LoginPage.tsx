import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoginSchema } from "@mmo/shared";
import { loginRequest } from "../lib/authApi";
import { ApiError } from "../lib/apiClient";
import { useAuthStore } from "../store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane");
      return;
    }

    setSubmitting(true);
    try {
      const { user, accessToken } = await loginRequest(parsed.data);
      setSession(user, accessToken);
      navigate("/characters");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nie udało się zalogować");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h1 className="text-xl font-semibold text-slate-100">Logowanie</h1>

        <div className="space-y-1">
          <label className="text-sm text-slate-400" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-400" htmlFor="password">
            Hasło
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Logowanie…" : "Zaloguj się"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Nie masz konta?{" "}
          <Link to="/register" className="text-indigo-400 hover:underline">
            Zarejestruj się
          </Link>
        </p>
      </form>
    </div>
  );
}
