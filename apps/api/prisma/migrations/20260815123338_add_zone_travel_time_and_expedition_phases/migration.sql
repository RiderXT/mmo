/*
  Warnings:

  - Added the required column `arrivedAt` to the `Expedition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fightEndsAt` to the `Expedition` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expedition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" DATETIME NOT NULL,
    "fightEndsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "result" TEXT,
    "eventLog" TEXT,
    CONSTRAINT "Expedition_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expedition_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Expedition" ("characterId", "endsAt", "eventLog", "id", "result", "startedAt", "status", "zoneId") SELECT "characterId", "endsAt", "eventLog", "id", "result", "startedAt", "status", "zoneId" FROM "Expedition";
DROP TABLE "Expedition";
ALTER TABLE "new_Expedition" RENAME TO "Expedition";
CREATE INDEX "Expedition_characterId_status_idx" ON "Expedition"("characterId", "status");
CREATE TABLE "new_Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "travelTimeSeconds" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Zone" ("createdAt", "description", "id", "maxLevel", "minLevel", "name", "updatedAt") SELECT "createdAt", "description", "id", "maxLevel", "minLevel", "name", "updatedAt" FROM "Zone";
DROP TABLE "Zone";
ALTER TABLE "new_Zone" RENAME TO "Zone";
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");
CREATE INDEX "Zone_minLevel_maxLevel_idx" ON "Zone"("minLevel", "maxLevel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
