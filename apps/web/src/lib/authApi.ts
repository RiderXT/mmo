import type { AuthResponse, LoginInput, RegisterInput } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export function registerRequest(input: RegisterInput) {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginRequest(input: LoginInput) {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logoutRequest() {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}
