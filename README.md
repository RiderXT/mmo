# MMO

Przeglądarkowe MMO (mobile-first, docelowo też jako appka) w stylu Metin2, z automatycznym
expieniem/zbieraniem itemów: gracz wysyła postać do krainy, postać walczy automatycznie przez
skonfigurowany czas i wraca z expem, złotem i itemami. Cała treść gry (krainy, potwory, itemy,
dropy) jest tworzona przez panele administracyjne.

Pełny opis architektury: [docs/architecture.md](docs/architecture.md).

## Struktura repo

```
apps/api      – backend (Fastify + TypeScript + Prisma)
apps/web      – frontend (React + Vite + Tailwind)
packages/shared – wspólne schematy walidacji (Zod) i typy TS
```

## Wymagania

- Node.js 20+
- pnpm (`npm install -g pnpm`)

Baza danych: lokalnie SQLite (zero instalacji, plik `apps/api/prisma/dev.db`), bez potrzeby
Dockera/Postgresa/Redisa na tym etapie — patrz [docs/architecture.md](docs/architecture.md#lokalne-środowisko-obecny-stan).

## Pierwsze uruchomienie

```bash
pnpm install
pnpm --filter @mmo/api prisma:migrate   # tworzy dev.db i tabele
pnpm --filter @mmo/api seed              # tworzy konto admina
```

Konto admina po seedzie: `admin@mmo.local` / `ChangeMe123!` — **zmień hasło / usuń przed
wdrożeniem produkcyjnym**.

## Uruchamianie w dwóch terminalach

```bash
pnpm dev:api   # http://localhost:4000
pnpm dev:web   # http://localhost:5173
```

Frontend automatycznie łączy się z API pod adresem z `apps/web/.env` (`VITE_API_URL`).

## Przydatne komendy

```bash
pnpm typecheck          # tsc --noEmit we wszystkich pakietach
pnpm --filter @mmo/api prisma:studio   # przeglądarka danych Prisma
```

## Stan prac

**Etap 1 (fundament)**: monorepo, auth (rejestracja/logowanie/refresh/wylogowanie, JWT +
httpOnly refresh cookie, argon2id), RBAC (player/moderator/admin), filtrowalny dziennik
zdarzeń (`GameLog`) z panelem admina, szkielet frontendu z routingiem i ochroną tras po roli.

**Etap 2 (panele treści)**: pełny CRUD krain, potworów i itemów (`/admin/zones`,
`/admin/monsters`, `/admin/items`) — z edycją zagnieżdżonych list (potwory+dropy krainy,
staty/umiejętności/dropy potwora, losowe staty i wymagania ulepszenia itemu) oraz walidacją
integralności referencyjnej przy usuwaniu.

**Etap 3 (postać i ekwipunek)**: tworzenie i lista postaci, ekwipunek z przeciąganiem
(`dnd-kit`) między slotami i do slotów zakładania sprzętu, zdejmowanie, ulepszanie itemów
(konsumpcja materiałów wg zdefiniowanych w Etapie 2 wymagań).

**Etap 4 (ekspedycje)**: wysyłanie postaci do krainy z blokadą poziomu, automatyczna
symulacja walk po stronie serwera (co minutę jeden pokonany potwór wg puli krainy), żywy
licznik czasu w UI, odbiór expa/złota/lootu (z ochroną przed podwójnym odbiorem i awansem
poziomu), konfigurowalny w `/admin/settings` domyślny czas trwania ekspedycji.

**Etap 5 (klasy postaci i umiejętności)**: 4 klasy (siła/witalność/zręczność/inteligencja)
tworzone przez panel admina (`/admin/classes`), po 6 umiejętności każda (pasywne mnożniki +
aktywne zdolności z cooldownem), 4 punkty statystyk i 1 punkt umiejętności na poziom
(`StatsPanel`/`SkillsPanel` na `/game/:characterId`). Ekwipunek przebudowany na 7 slotów
(broń/zbroja/hełm/buty/naszyjnik/kolczyki/pierścień) plus osobny 6-slotowy panel aktywnych
itemów (potiony many/życia/prędkości, konfigurowalne w `/admin/items`, zużywane automatycznie
w trakcie ekspedycji wg progu %/interwału). Silnik ekspedycji (`combat.ts`) liczy teraz
rzeczywiste staty postaci (base + ekwipunek + umiejętności pasywne) i realnie rozstrzyga
starcia HP-owo — build postaci decyduje o wyniku, nie tylko losowość.

Kolejne etapy (patrz plan): misje, dungeony, PvP, sklep globalny, sklepy NPC.
