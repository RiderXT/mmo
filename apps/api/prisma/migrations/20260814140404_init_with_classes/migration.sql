-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'player',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "replacedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "classId" TEXT,
    "strength" INTEGER NOT NULL DEFAULT 5,
    "vitality" INTEGER NOT NULL DEFAULT 5,
    "dexterity" INTEGER NOT NULL DEFAULT 5,
    "intelligence" INTEGER NOT NULL DEFAULT 5,
    "unspentStatPoints" INTEGER NOT NULL DEFAULT 0,
    "unspentSkillPoints" INTEGER NOT NULL DEFAULT 0,
    "currentZoneId" TEXT,
    "activeExpeditionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Character_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CharacterClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Character_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "primaryStat" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClassSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "scalingStat" TEXT NOT NULL,
    "scalingFactor" REAL NOT NULL DEFAULT 1,
    "maxLevel" INTEGER NOT NULL DEFAULT 10,
    "targetStat" TEXT,
    "effectType" TEXT,
    "cooldownSeconds" INTEGER,
    CONSTRAINT "ClassSkill_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CharacterClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "classSkillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CharacterSkill_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterSkill_classSkillId_fkey" FOREIGN KEY ("classSkillId") REFERENCES "ClassSkill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Monster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "expReward" INTEGER NOT NULL DEFAULT 0,
    "goldReward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ZoneMonster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "monsterId" TEXT NOT NULL,
    "spawnWeight" INTEGER NOT NULL DEFAULT 1,
    "maxCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ZoneMonster_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoneMonster_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL DEFAULT 1,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "maxStack" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL DEFAULT '',
    "baseStats" TEXT NOT NULL DEFAULT '{}',
    "possibleStatRanges" TEXT NOT NULL DEFAULT '[]',
    "potionTrigger" TEXT,
    "potionThresholdPct" REAL,
    "potionIntervalSec" INTEGER,
    "potionEffect" TEXT,
    "potionMagnitudePct" REAL,
    "potionDurationSec" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ItemUpgradeRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "requiredItemId" TEXT NOT NULL,
    "requiredQty" INTEGER NOT NULL,
    CONSTRAINT "ItemUpgradeRequirement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemUpgradeRequirement_requiredItemId_fkey" FOREIGN KEY ("requiredItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonsterDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monsterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dropChance" REAL NOT NULL,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "MonsterDrop_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonsterDrop_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZoneDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dropChance" REAL NOT NULL,
    CONSTRAINT "ZoneDrop_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoneDrop_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rolledStats" TEXT NOT NULL DEFAULT '{}',
    "upgradeLevel" INTEGER NOT NULL DEFAULT 0,
    "equippedSlot" TEXT,
    "activeSlotIndex" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "result" TEXT,
    CONSTRAINT "Expedition_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expedition_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "module" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorCharacterId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_name_key" ON "Character"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Character_activeExpeditionId_key" ON "Character"("activeExpeditionId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_classId_idx" ON "Character"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClass_name_key" ON "CharacterClass"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSkill_classId_name_key" ON "ClassSkill"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSkill_characterId_classSkillId_key" ON "CharacterSkill"("characterId", "classSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE INDEX "Zone_minLevel_maxLevel_idx" ON "Zone"("minLevel", "maxLevel");

-- CreateIndex
CREATE INDEX "Monster_level_idx" ON "Monster"("level");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneMonster_zoneId_monsterId_key" ON "ZoneMonster"("zoneId", "monsterId");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "Item"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ItemUpgradeRequirement_itemId_targetLevel_requiredItemId_key" ON "ItemUpgradeRequirement"("itemId", "targetLevel", "requiredItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MonsterDrop_monsterId_itemId_key" ON "MonsterDrop"("monsterId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneDrop_zoneId_itemId_key" ON "ZoneDrop"("zoneId", "itemId");

-- CreateIndex
CREATE INDEX "InventoryItem_characterId_idx" ON "InventoryItem"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_characterId_slotIndex_key" ON "InventoryItem"("characterId", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_characterId_activeSlotIndex_key" ON "InventoryItem"("characterId", "activeSlotIndex");

-- CreateIndex
CREATE INDEX "Expedition_characterId_status_idx" ON "Expedition"("characterId", "status");

-- CreateIndex
CREATE INDEX "GameLog_module_idx" ON "GameLog"("module");

-- CreateIndex
CREATE INDEX "GameLog_level_idx" ON "GameLog"("level");

-- CreateIndex
CREATE INDEX "GameLog_createdAt_idx" ON "GameLog"("createdAt");

-- CreateIndex
CREATE INDEX "GameLog_actorUserId_idx" ON "GameLog"("actorUserId");
