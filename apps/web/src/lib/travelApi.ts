import { apiFetch } from "./apiClient";

export interface TravelStartResultDto {
  travelDestinationZoneId: string | null;
  travelArrivesAt: string;
}

export const startTravel = (characterId: string, destinationZoneId: string | null) =>
  apiFetch<TravelStartResultDto>("/api/travel/start", {
    method: "POST",
    body: JSON.stringify({ characterId, destinationZoneId }),
  });
