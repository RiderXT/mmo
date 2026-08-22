import { apiFetch } from "./apiClient";

export interface ChangelogEntryPublicDto {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export const listChangelogEntries = () => apiFetch<ChangelogEntryPublicDto[]>("/api/changelog");
