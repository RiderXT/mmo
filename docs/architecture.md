# Architektura MMO

Ten dokument opisuje architekturę docelową i to, co faktycznie zaimplementowano do tej pory.
Zaktualizuj go przy każdej istotnej decyzji architektonicznej.

## Rdzeń rozgrywki

Gracz wysyła postać do "krainy" na X czasu (konfigurowalne). Postać automatycznie walczy z
potworami z puli danej krainy, zdobywa exp/złoto/itemy trafiające do ekwipunku (drag&drop,
equip, upgrade). Cała treść gry (krainy, potwory, itemy, dropy, **klasy postaci i ich
umiejętności**) jest tworzona przez panele administracyjne, nie hardkodowana.

Postać należy do jednej z klas (4 zasoby bazowe: siła/witalność/zręczność/inteligencja, po
6 umiejętności na klasę — pasywne mnożniki i aktywne zdolności z cooldownem). Punkty statystyk
(4/poziom) i umiejętności (1/poziom) gracz przydziela sam. Ekwipunek ma 7 slotów (broń, zbroja,
hełm, buty, naszyjnik, kolczyki, pierścień) plus osobny 6-slotowy panel aktywnych itemów
(potiony many/życia/prędkości), zużywanych automatycznie w trakcie ekspedycji wg reguł
skonfigurowanych na itemie (próg %, interwał). Build postaci (staty, ekwipunek, umiejętności)
realnie wpływa na wynik symulacji walki — patrz `apps/api/src/modules/expeditions/combat.ts`.

## Zasady dalszego rozwoju

Gra jest w ciągłym rozwoju — kolejne Etapy będą regularnie dokładać nowe mechaniki, bonusy i
treść. **Zmiany schematu Prisma mają być addytywne** (pola `nullable` albo z `@default`) i nie
wymagać resetu `apps/api/prisma/dev.db` ani utraty kont/postaci graczy, chyba że naprawdę nie
da się inaczej — wtedy zgłosić to wprost jako świadomy wyjątek przed wykonaniem, tak jak przy
Etapach 5-6 (nowe kolumny `NOT NULL` bez sensownego backfillu). Etap 7 (`Item.classId`,
`Item.maxUpgradeStats`) i Etap 8 pokazują wzorzec docelowy: nowe pola zawsze z defaultem,
`prisma db push` bez utraty danych.

## Stack technologiczny

- **Monorepo**: pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`)
- **Backend**: Node.js + TypeScript, Fastify (plugin per moduł domenowy)
- **ORM/DB**: Prisma + **SQLite lokalnie** (docelowo PostgreSQL — patrz niżej)
- **Auth**: JWT access token (15 min) + refresh token (httpOnly, secure w prod, sameSite=strict,
  rotacja w DB), hasła przez argon2id
- **Walidacja**: Zod, schematy współdzielone przez `packages/shared` (jedno źródło prawdy dla
  API i frontendu)
- **Frontend**: React + Vite + TS, TanStack Query, Zustand, Tailwind CSS (mobile-first)
- **Mobile**: PWA (manifest już podpięty) → docelowo Capacitor (ten sam kod React)
- **Logowanie**: Pino (konsola, strukturalne JSON) + tabela `GameLog` w bazie (moduł, poziom,
  akcja, actor, payload, requestId) — filtrowalne w panelu `/admin/logs`

## Lokalne środowisko (obecny stan)

Na maszynie deweloperskiej nie było zainstalowanego Dockera ani PostgreSQL/Redis. Żeby nie
blokować startu prac na instalacji oprogramowania systemowego, przyjęto pragmatyczne
uproszczenia:

- **SQLite zamiast PostgreSQL** — Prisma `datasource` w `apps/api/prisma/schema.prisma` ma
  `provider = "sqlite"`. SQLite w Prisma **nie wspiera** natywnych enumów ani typu `Json`,
  dlatego pola takie jak `role`, `level`, `status` są `String` (walidowane w kodzie przez enumy
  Zod z `@mmo/shared`), a pola JSON-owe (`baseStats`, `stats`, `payload`, itd.) są `String`
  serializowanym ręcznie (`JSON.stringify`/`JSON.parse`) w warstwie serwisowej.
  **Migracja do Postgresa**: zmienić `provider` na `postgresql`, ustawić `DATABASE_URL`, i (opcjonalnie,
  nie wymagane) zamienić `String`-owe pola JSON na natywny typ `Json` oraz `String`-owe enumy na
  prawdziwe `enum` w schemacie — obecny kod aplikacji (JSON.parse/stringify, Zod-owe enumy) będzie
  działać bez zmian nawet bez tej dodatkowej migracji typów.
- **Bez Redis / BullMQ / Socket.io na razie** — ekspedycje (Etap 4 planu) będą rozstrzygane
  deterministycznie po stronie serwera synchronicznie (przy starcie lub przy odbiorze nagród),
  bez potrzeby trzymania kolejki zadań czy live tick-loopa. Redis/BullMQ/Socket.io wracają do
  planu, gdy pojawią się funkcje faktycznie wymagające push-notyfikacji w czasie rzeczywistym
  między wieloma graczami (czat, PvP, obecność graczy w krainie).

Gdy projekt będzie gotowy do wdrożenia: zainstalować Docker (lub użyć hostowanego Postgresa) i
przełączyć `DATABASE_URL` — reszta kodu (Prisma Client, serwisy) nie wymaga zmian.

## Bezpieczeństwo

- Hasła: argon2id
- JWT access + refresh token rotation (refresh token jako losowy token haszowany SHA-256 w DB,
  nie JWT — umożliwia natychmiastową rewokację)
- Rate limiting globalny (`@fastify/rate-limit`) + dodatkowe limity na `/register` i `/login`
- Walidacja wejścia przez Zod na granicy API (`RegisterSchema`, `LoginSchema`, ...)
- RBAC: `player` / `moderator` / `admin` (guard `requireRole` w `apps/api/src/lib/authGuard.ts`)
- Bezpieczne nagłówki (`@fastify/helmet`), ścisły CORS z listy `CORS_ORIGIN`
- Sekrety w `.env` (poza repo, `.gitignore`); `.env.example` jako szablon
- Redagowanie wrażliwych pól w logach (`authorization`, `cookie`, `password*`)

## Model danych (Prisma) — patrz `apps/api/prisma/schema.prisma`

`User`, `RefreshToken`, `Character`, `Zone`, `Monster`, `ZoneMonster`, `MonsterDrop`, `ZoneDrop`,
`Item`, `ItemUpgradeRequirement`, `InventoryItem`, `Expedition`, `GameLog`, `Settings`.

## Moduły backendu (zaimplementowane)

- `modules/auth` — rejestracja, logowanie, refresh, wylogowanie, `/me`
- `modules/logs` — `GET /api/admin/logs` (filtrowanie: moduł, poziom, actor, tekst, zakres dat,
  paginacja) + `GET /api/admin/logs/modules`, obie chronione `requireRole("admin","moderator")`
- `modules/admin/zones`, `modules/admin/monsters`, `modules/admin/items` — pełny CRUD treści gry.
  Odczyt (`GET`) dostępny dla `admin`/`moderator`, zapis (`POST`/`PUT`/`DELETE`) tylko dla `admin`.
  Każda mutacja loguje się do `GameLog` (moduł `admin:zones` / `admin:monsters` / `admin:items`).
  Walidacja integralności referencyjnej: nie można usunąć potwora użytego w krainie, itemu
  użytego w dropie/ekwipunku/jako materiał ulepszenia, ani krainy, w której aktualnie przebywa
  postać. Relacje zagnieżdżone (potwory+dropy krainy, dropy potwora, wymagania ulepszenia itemu)
  są zastępowane w całości przy `PUT` (delete+recreate w transakcji) — proste i wystarczające przy
  niskiej częstotliwości edycji treści przez admina.

- `modules/characters` — tworzenie postaci (unikalna nazwa, limit 5 postaci/użytkownika),
  lista i szczegóły własnych postaci (`requireAuth`, scoped po `userId`)
- `modules/inventory` — `GET /:characterId` (lista), `POST /:characterId/move` (zamiana
  slotIndex, w tym swap gdy slot docelowy zajęty), `/equip` (walidacja zgodności typu
  itemu ze slotem, automatyczne zdjęcie poprzedniego itemu z tego slotu), `/unequip`,
  `/upgrade` (odczytuje `ItemUpgradeRequirement` dla `targetLevel = upgradeLevel+1`,
  konsumuje materiały z wielu stosów w transakcji, podnosi `upgradeLevel`). Każda operacja
  weryfikuje, że postać należy do wywołującego użytkownika.

- `modules/expeditions` — `POST /start` (walidacja poziomu postaci wobec zakresu krainy,
  odrzucenie krainy bez potworów, odrzucenie gdy postać już jest na ekspedycji, deterministyczna
  symulacja liczona **od razu przy starcie** i zapisana w `Expedition.result` — wynik nie jest
  zwracany w odpowiedzi startu, ujawniany dopiero przy odbiorze), `GET /:characterId/active`,
  `POST /:id/claim` (blokada odbioru przed czasem, `updateMany` z warunkiem `status:
  "in_progress"` jako strażnik przed podwójnym odbiorem, przyznanie expa/złota/lootu w jednej
  transakcji, prosty wzór poziomowania `level = floor(totalExp/100)+1` — świadome uproszczenie
  do przyszłego zbalansowania)
- `modules/settings` — magazyn klucz-wartość (`Settings`) pod domyślny czas ekspedycji;
  `GET /api/settings/expedition-duration` publiczny (gracz musi wiedzieć ile poczeka),
  `PUT /api/admin/settings/expedition-duration` tylko dla admina
- `modules/zones`, `modules/items` — tylko-do-odczytu odpowiedniki panów admina (`GET /`,
  `GET /:id`, `requireAuth` bez wymogu roli), potrzebne graczowi do wyboru krainy i pokazania
  nazw itemów w podsumowaniu łupu; logika CRUD wciąż żyje wyłącznie w `modules/admin/*`
- Rozszerzenie `modules/inventory`: `addLootToInventory(tx, characterId, itemId, quantity)` —
  dokłada łup do stosu jeśli item jest stackowalny i jest miejsce, inaczej tworzy nowe sloty;
  dla itemów niestackowalnych losuje staty przez ważone próbkowanie bez zwracania z
  `possibleStatRanges` (do 3 statów na sztukę). Przyjmuje `Prisma.TransactionClient`, żeby
  przyznanie lootu i aktualizacja postaci działy się w jednej transakcji z `claimExpedition`.

- `modules/admin/classes` + `modules/classes` — CRUD klas postaci i ich umiejętności (wzorowany
  na `modules/admin/zones`), z odczytem publicznym do wyboru klasy przy tworzeniu postaci.
  Aktualizacja klasy **upsertuje** umiejętności po `(classId, name)` zamiast usuwać-i-tworzyć od
  nowa — usuwanie umiejętności, w które gracze już zainwestowali punkty (`CharacterSkill.level >
  0`), jest blokowane (409), żeby edycja balansu nie kasowała progresu graczy.
- `modules/expeditions/combat.ts` — silnik walki używany przez `startExpedition`:
  `computeDerivedStats(core, equipmentStats[], passiveSkills[])` liczy staty pochodne (maxHp,
  maxMana, attack, defense, attackSpeed, critChance/Damage, evasion, damageReduction) z bazowych
  statów + sumy statów ekwipunku + bonusów pasywnych umiejętności (`scalingFactor × staty ×
  poziom`); `simulateExpedition(...)` symuluje jedno starcie na minutę metodą "ile rund do
  zabicia potwora vs ile rund przetrwa postać" (bez pełnej pętli turowej), z HP/maną
  **persystującymi przez całą ekspedycję**, aktywnymi umiejętnościami na cooldownie (koszt many
  `10+5×poziom`) i automatycznym zużyciem potionów z aktywnych slotów wg progu %/interwału
  (z 5-sekundowym cooldownem odtworzenia dla triggerów progowych, żeby nie "wypić" całego stosu
  w jedną sekundę). Zużyte potiony są odejmowane z ekwipunku **w tej samej transakcji co start
  ekspedycji** (spójne z zasadą "wynik liczony raz na starcie").
- `claimExpedition` dolicza punkty za awans: `levelsGained × 4` do `unspentStatPoints`,
  `levelsGained × 1` do `unspentSkillPoints` (obsługuje też wielopoziomowe skoki z jednej
  ekspedycji).
- `modules/characters`: `POST /:id/allocate-stat` i `/allocate-skill` (walidacja przynależności
  umiejętności do klasy postaci, limit `maxLevel` per umiejętność, blokada gdy brak niewydanych
  punktów), `GET /:id/skills` (stan inwestycji gracza, osobno od definicji klasy).
- `modules/inventory`: `set-active-slot`/`clear-active-slot` — drugi, równoległy do
  `equippedSlot` "slot" na `InventoryItem` (`activeSlotIndex`, unikalny per postać), tylko dla
  `type === "consumable"`.

**Breaking change w Etapie 5** (świadomie zaakceptowany, dane lokalne dev): `EquipSlot` i
`ItemType` przebudowane — `gloves`/`accessory1`/`accessory2` zastąpione przez
`necklace`/`earrings`/`ring` (typ itemu mapuje się teraz 1:1 na slot). `dev.db` skasowany i
zmigrowany od nowa; `seed.ts` rozszerzony o 4 klasy × 6 umiejętności, potiony i przykładową
zawartość świata.

**Znaleziony i naprawiony błąd**: `createMonster` (`modules/admin/monsters/service.ts`) nie
zapisywał `goldReward` (pole istniało w `updateMonster`, ale zostało pominięte przy tworzeniu —
`replace_all` podczas wcześniejszej edycji trafił tylko jedno z dwóch miejsc o różnej
indentacji). Wykryte przez test porównawczy dwóch buildów tej samej postaci.

## Moduły backendu (planowane)

Później: `modules/quests`, `modules/dungeons`, `modules/pvp`, `modules/shop`, `modules/npc-shops`.

## Frontend (zaimplementowane)

`/login`, `/register`, `/characters` (stub), `/game` (stub), `/admin/logs` (w pełni działający
podgląd i filtrowanie dziennika zdarzeń), `/admin/zones`, `/admin/monsters`, `/admin/items`
(pełny CRUD z formularzami dla zagnieżdżonych list: potwory+dropy krainy, staty+umiejętności+dropy
potwora, staty losowe+wymagania ulepszenia itemu — wszystkie chronione `ProtectedRoute` z
`allowedRoles={["admin"]}`, link w nawigacji widoczny tylko dla roli admin).
`ProtectedRoute` z opcjonalnym ograniczeniem po roli. Access token trzymany tylko w pamięci
(Zustand, bez persist) — refresh token w httpOnly cookie; przy starcie aplikacji (`App.tsx`)
następuje próba cichego odświeżenia sesji.

`/admin/settings` — edycja domyślnego czasu ekspedycji (jedyne ustawienie na razie, ale
struktura klucz-wartość jest gotowa na kolejne).

`/characters` (tworzenie i lista postaci) → `/game/:characterId` (ekwipunek + ekspedycja): grid itemów
(`dnd-kit`, `@dnd-kit/core`) z przeciąganiem między slotami i do slotów zakładania sprzętu,
panel szczegółów wybranego itemu (klik) ze statami i przyciskiem ulepszenia. **Ważne przy pracy
z `dnd-kit`**: `PointerSensor` bez `activationConstraint` przechwytuje zwykłe kliknięcia (element
ma jednocześnie `onClick` i `useDraggable` listeners), przez co `onClick` nie odpala się wcale —
naprawione przez `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })`
w `GamePage.tsx`, żeby drag startował dopiero po realnym przeciągnięciu, a zwykły klik dalej
działał jako wybór itemu.

`ExpeditionPanel` (na `/game/:characterId`, nad ekwipunkiem) ma trzy stany: wybór krainy
(przyciski zon wyszarzone gdy poziom postaci poza zakresem), licznik czasu w trakcie (tick co
sekundę przez `setInterval` dopóki `now < endsAt`, potem przycisk "Odbierz nagrody"), oraz
podsumowanie po odbiorze (exp/złoto/pokonane potwory/lista lootu z nazwami rozwiązanymi przez
`/api/items`, informacja o awansie). Po zamknięciu podsumowania panel wraca do wyboru krainy.

`/admin/classes` — CRUD klas i ich 6 umiejętności (wzorowany na `MonstersAdminPage.tsx`),
formularz umiejętności ma warunkowe pola: `targetStat` dla pasywnych, `effectType`+
`cooldownSeconds` dla aktywnych. `CharactersPage.tsx` — wybór klasy (karty z opisem) wymagany
przy tworzeniu postaci. `GamePage.tsx` — `StatsPanel`/`SkillsPanel` (przydzielanie niewydanych
punktów, przyciski `+` wyłączone przy 0 punktach lub max. poziomie umiejętności), 7 slotów
ekwipunku (broń/zbroja/hełm/buty/naszyjnik/kolczyki/pierścień) i osobny `ActiveItemSlotBox` ×6
na potiony — `handleDragEnd` rozróżnia trzy typy drop-targetu (`grid`/`equip`/`active`).
`ItemsAdminPage.tsx` ma warunkową sekcję konfiguracji potionu widoczną tylko dla
`type === "consumable"`.

## Kondycja (HP/MP) i zakładki ekwipunku (post-Etap 5)

Dwie niezależne zmiany UI, zrobione razem bo obie dotykają `GamePage.tsx`:

**Kondycja.** `computeDerivedStats` (`combat.ts`) był dotąd wołany tylko wewnątrz symulacji
ekspedycji — HP/mana nie miały żadnego API do odczytu poza kontekstem walki. Wydzielono wspólną
funkcję `gatherCombatBuild` (`expeditions/service.ts`, budowa core stats + staty ekwipunku +
pasywne umiejętności) używaną teraz zarówno przez `buildAndSimulate`, jak i nowy
`getCharacterCombatStats`, wystawiony jako `GET /api/characters/:id/combat-stats`. Front
(`VitalsPanel.tsx`) pokazuje `maxHp`/`maxMana` jako paski — **to są maksima z aktualnego builda,
nie żywy licznik obrażeń** (HP/mana i tak resetują się do maksimum na starcie każdej ekspedycji,
patrz `combat.ts`), więc pasek zawsze pokazuje 100% wypełnienia; wartość ma sens jako odczyt "jak
silny jest mój build", nie jako pasek życia w czasie rzeczywistym. Zapytanie `combat-stats` jest
unieważniane przy każdej zmianie builda (`allocate-stat`, `allocate-skill`, `equip`, `unequip`).

**4 zakładki ekwipunku.** Backend nigdy nie ograniczał `slotIndex` do zakresu 0-23 — front po
prostu renderował tylko tyle slotów. Zakładki to więc czysto frontendowa zmiana: siatka nadal ma
24 widocznych slotów, ale `GamePage.tsx` przesuwa okno o `activeTab * 24`, więc realna pojemność
rośnie do 96 slotów (4 × 24) bez żadnej migracji ani zmiany w `moveItem`/`addLootToInventory`.
Drag&drop działa identycznie — `GridSlot` dostaje już absolutny `slotIndex`, więc przeciąganie
między zakładkami wymaga tylko przełączenia zakładki między akcjami (nie ma jednego widoku "ze
wszystkimi zakładkami naraz").

Zweryfikowane: curl (`combat-stats` zwraca `maxHp: 250, maxMana: 50` zgodne z buildem: witalność
20 → 50+200, inteligencja 6 → 20+30); przeglądarka (paski HP/MP w `/game/:id`, przełączanie
zakładek I-IV z licznikiem przedmiotów na przycisku, przedmiot widoczny tylko w swojej
zakładce).

## Dziennik walki na żywo (post-Etap 5)

Gracz widzi w panelu "Ekspedycja w toku" szczegółowy, na żywo odsłaniany zapis starć (atak vs
obrona z liczbami, bonus z umiejętności, krytyk, unik, zdobyty łup, zużyte potiony) zamiast
gołego licznika czasu — plus bieżące sumy (pokonani/exp/złoto), aktualizowane w miarę
odsłaniania.

**Mechanizm**: `simulateExpedition` (`apps/api/src/modules/expeditions/combat.ts`) już liczy
całą ekspedycję deterministycznie na starcie — rozszerzony teraz o emitowanie `CombatEvent[]`
(dyskryminowana unia w `packages/shared/src/schemas/combatEvent.ts`) w tych samych punktach,
gdzie i tak liczy liczby do wyniku zbiorczego (żadna nowa logika walki, tylko dodatkowe
`events.push(...)`). Każde zdarzenie ma znacznik `t` (sekundy od startu ekspedycji). Cały log
jest zapisywany w `Expedition.eventLog` przy starcie (`startExpedition`) i zwracany w całości
przez `GET /api/expeditions/:characterId/active` — **celowo bez ukrywania**, w przeciwieństwie
do `result`, bo tu ryzyko to tylko spoiler w UI, nie anti-cheat (wynik i tak jest już
przesądzony).

Front (`ExpeditionPanel.tsx` + `CombatLog.tsx`) pobiera log **raz**, po czym co sekundę (ten
sam `setInterval`, który już napędza licznik) filtruje `events.filter(e => e.t <=
elapsedSeconds)` i pokazuje tylko to, co "już się wydarzyło" — **bez dodatkowego pollingu ani
WebSocketów**. Wygląda jak walka na żywo, choć serwer nic nie liczy w tle. To ten sam wzorzec
"policz raz na starcie, odsłaniaj stopniowo", którego już używa `result`/`ExpeditionResult` —
tylko zastosowany do granularnych zdarzeń zamiast jednej zbiorczej sumy.

Zweryfikowane: curl (kształt eventów z realnymi liczbami — atak/obrona/bonus umiejętności/
krytyk/unik), przeglądarka (log odsłania się dokładnie w momencie przekroczenia znacznika `t`
przez licznik, nie wcześniej; bieżące sumy Pokonano/Exp/Złoto rosną wraz z odsłanianiem).

## Opuszczenie ekspedycji przed czasem (post-Etap 5)

Gracz może zakończyć ekspedycję w dowolnym momencie i odebrać nagrody tylko za starcia, które
faktycznie już się odbyły — zamiast czekać do `endsAt` albo tracić cały postęp.

**Mechanizm**: żadnej nowej symulacji. `leaveExpedition`
(`apps/api/src/modules/expeditions/service.ts`) liczy `elapsedSeconds = now - startedAt`,
filtruje ten sam zapisany `eventLog` (patrz sekcja wyżej) do `events.filter(e => e.t <=
elapsedSeconds)` i sumuje `encounter_result`/`loot` z tej przyciętej listy
(`deriveResultFromEvents`) — dokładnie te starcia, które gracz już widział w dzienniku walki na
żywo. Reszta zdarzeń (tych z `t` > `elapsedSeconds`) po prostu przepada. `claimExpedition` i
`leaveExpedition` dzielą teraz wspólną funkcję `applyExpeditionReward` (zapis exp/gold/loot/
punktów, czyszczenie `activeExpeditionId`/`currentZoneId`, log akcji z polem `action: "claim" |
"leave_early"` do rozróżnienia w `GameLog`).

Ochrona przed podwójnym odebraniem jest identyczna jak przy `claim`: atomowy
`updateMany({ where: { status: "in_progress" } })` + sprawdzenie `count === 1` — `leave` i
`claim` na tej samej (już zakończonej) ekspedycji wzajemnie się blokują (409), niezależnie od
kolejności wywołań.

Front: przycisk "Opuść ekspedycję (odbierz zdobyte)" widoczny w panelu "Ekspedycja w toku"
dopóki licznik nie dojdzie do zera, z natywnym `confirm()` ostrzegającym że reszta czasu
przepadnie. Używa tego samego `handleRewardSuccess` co odbiór po czasie (ten sam komponent
podsumowania, ten sam refetch aktywnej ekspedycji/postaci/ekwipunku).

Zweryfikowane: curl — rozpoczęcie ekspedycji, cofnięcie `startedAt` o 70s (symulacja upływu
czasu bez czekania), `leave` zwrócił dokładnie nagrodę pierwszego starcia (t=60: 25 exp/5
złota/1 potwór/2× łup), NIE pełną sumę trzech starć (75/15/3/3×łup); ponowny `claim` na tej
samej ekspedycji odrzucony (409 "już odebrane"); `currentZoneId`/`activeExpeditionId`
poprawnie wyczyszczone. Przeglądarka: kliknięcie przycisku w trakcie odliczania pokazało
natywny dialog potwierdzenia z poprawnym tekstem ostrzeżenia, po potwierdzeniu panel przeszedł
w "Ekspedycja zakończona" z poprawnym (zerowym, bo opuszczono przed pierwszym starciem o t=60s)
podsumowaniem nagród.

## Identyfikacja wizualna — dark fantasy (post-Etap 5)

Zastąpiono generyczny dashboard (slate-900 + indigo-600) motywem dopasowanym do gry: żelazo,
pergamin, złoto. Wdrożone na podstawie koncepcji zaakceptowanej wcześniej jako osobny artifact.

**Mechanizm**: `tailwind.config.js` dostał nowe tokeny kolorów (`ink`/`panel`/`panel-raised`/
`line`/`line-soft`/`gold`/`parchment`/`hp`/`mp`/`rarity-*`) i `fontFamily.display` (systemowy stos
szeryfowy). `index.css` definiuje `@layer components .panel` — klasę z narożnikowymi "okuciami"
(pseudo-elementy `::before`/`::after` w złocie), którą dostał każdy dotychczasowy
`rounded-xl border border-slate-800 bg-slate-900` panel w całej aplikacji. Promienie zaokrągleń
(`rounded-*`) usunięto globalnie — ostre, "kute" krawędzie zamiast zaokrąglonych kart SaaS.
Kolory rzadkości (`rarity-common/uncommon/rare/epic`) użyte w `ItemBox.tsx` do kolorowania ramek
slotów wg typu przedmiotu (biżuteria = złoto, broń = czerwień, zbroja/hełm/buty = stal, konsumpcyjne
= zieleń, materiały = szarość, questowe = fiolet) — przy okazji naprawiono tam nieaktualną mapę
typów (`gloves`/`accessory` nie istnieją już w `ItemTypeSchema` od Etapu 5, brakowało
`necklace`/`earrings`/`ring`). Semantyczne kolory statusu (poziomy logów w adminie, typy zdarzeń
w dzienniku walki: krytyk/unik/przegrana) celowo **nie** zostały wciągnięte w paletę motywu —
zostały jako odrębne, funkcjonalne kolory (zasada: kolor semantyczny ≠ kolor akcentu marki).

**Pułapka po drodze**: `theme("colors.panel.DEFAULT")` w customowym CSS zwracało `undefined` i
całą deklarację CSS wyciszało po cichu, bo `panel`/`line`/`ink` to płaskie stringi w configu
(nie obiekty z kluczem `DEFAULT` jak `gold`) — poprawny odczyt to `theme("colors.panel")`. Objawiało
się to jako przezroczyste tło i szara (Tailwind default) ramka paneli mimo braku błędu w konsoli
przeglądarki (błąd był tylko w logu Vite/PostCSS).

Zweryfikowane: `pnpm typecheck` czysty; przeglądarka z odczytem `getComputedStyle` — tło strony
`rgb(14,12,10)` (`#0e0c0a`), pasek HP `rgb(139,38,53)`, pasek MP `rgb(46,111,128)`, ramka itemu
materiałowego `rgba(138,132,119,…)` (rarity-common), złote narożniki `.panel::before` —
wszystkie zgodne co do piksela z tokenami w `tailwind.config.js`.

## Czas podróży do krain (Etap 6)

Ekspedycja to teraz podróż w trzech fazach zamiast jednego bloku czasu: **wioska → (podróż) →
kraina → (walka) → kraina → (podróż) → wioska**. Wynikało to z planowania balansu setów pod
krainy 1-99 — użytkownik chciał, żeby ekwipunek (nowy stat `movementSpeed`, wyłącznie z gearu,
bez bazowego wkładu ze statów rdzenia) skracał czas dotarcia do krainy i powrotu.

**Model**: `Zone.travelTimeSeconds` (bazowy czas jednej strony, admin-konfigurowalny w
`/admin/zones`) + trzy nowe znaczniki czasu na `Expedition` obok istniejącego `startedAt`:
`arrivedAt` (koniec podróży tam, start walki), `fightEndsAt` (koniec symulacji, start podróży
powrotnej), `endsAt` (koniec podróży powrotnej — moment odbioru nagród; guard w
`claimExpedition` się nie zmienił, bo semantyka "wszystko gotowe" pozostała ta sama, tylko
teraz obejmuje więcej). Wszystkie cztery liczone raz przy starcie
(`travelSeconds = round(zone.travelTimeSeconds × (1 − movementSpeedPct))`, ten sam wynik
użyty dla obu odcinków podróży) — zgodnie z istniejącym wzorcem "policz raz, odsłaniaj w
czasie".

**Opuszczenie ekspedycji w nowym modelu**: `leaveExpedition` liczy upłynięty czas walki
względem `arrivedAt` zamiast `startedAt` — jedna zmiana w kodzie, trzy naturalnie poprawne
zachowania z tego samego filtra `events.filter(e => e.t <= elapsedSeconds)`: opuszczenie w
trakcie podróży tam daje zerową nagrodę (elapsed ujemny), w trakcie walki nagrodę cząstkową
(jak dotychczas), a po zakończeniu walki — pełną nagrodę natychmiast, bez czekania na koniec
podróży powrotnej. To spójne z pierwotnym celem funkcji "opuść w dowolnym momencie".

Zweryfikowane: curl — postać z butami niosącymi `movementSpeed: 0.3` miała podróż 21s
(30s × 0.7) w obie strony vs 30s dla postaci bez ekwipunku; `leave` przed przybyciem → 0
nagrody, w trakcie walki → nagroda za dokładnie 1 starcie, po zakończeniu walki → pełna
nagroda (30 starć, awans z poziomu 1 na 8) natychmiast. Przeglądarka: etykieta fazy "W drodze
do krainy…" nad licznikiem, lista krain pokazuje "~30s podróży (tam i z powrotem)" przed
wysłaniem, opuszczenie w trakcie podróży pokazuje odrębny komunikat potwierdzenia i daje
zerowe podsumowanie nagród.

## Generator treści balansowej dla krain 1-99 (post-Etap 6)

`apps/api/prisma/seed-zones.ts` — osobny, bezpiecznie powtarzalny skrypt (pomija krainy, które
już istnieją po nazwie) generujący 5 nowych krain ponad już zasianym "Wilcze Uroczysko" (1-10):
Zapomniane Mokradła (11-25), Krwawy Wąwóz (26-40), Popielne Pustkowia (41-55), Czarna Twierdza
(56-75), Otchłań Cieni (76-99) — każda z potworem i pełnym 7-slotowym setem (broń/zbroja/hełm/
buty/naszyjnik/kolczyki/pierścień), rosnącym czasem podróży (30s→300s) i butami niosącymi
`movementSpeed` rosnący z tierem (5%→35%). Uruchomić: `npx tsx prisma/seed-zones.ts` z
`apps/api`.

**Metoda** (per framework ustalony z użytkownikiem, m.in. na podstawie realnych danych ze
Metin2 wiki dla butów/kolczyków — płaski wzrost + jeden nowy stat na tier): "referencyjny build"
(50% punktów staty w primary / 30% witalność / 10%+10% pozostałe — uniwersalne przybliżenie,
bo ekwipunek nie jest ograniczony klasą) daje "gołe" staty na dany poziom przez te same wzory co
`computeDerivedStats`. Budżet ekwipunku per tier = (staty w pełnym secie na `maxLevel` tieru) −
(gołe staty), rozłożony po 7 slotach wagami (broń najwięcej ataku, zbroja/hełm najwięcej obrony/
hp, biżuteria po trochu + drugorzędne staty: kolczyki→krytyk, pierścień→unik, buty→ruch).

**Pułapka znaleziona przy weryfikacji**: pierwsza wersja liczyła trudność potwora z prostego
stosunku `roundsToKill:roundsSurvivable` (cel 1:1.7) per pojedyncze starcie — w testowej
ekspedycji (postać poziom 26 w pełnym secie Krwawego Wąwozu) dało to 8 wygranych na 19 starć w
30 minut z seriami przegranych. Przyczyna: HP **nie resetuje się między starciami** i regeneruje
tylko poniżej 0 (2%/min) — nawet "korzystny" stosunek dla jednego starcia kumuluje się boleśnie
po kilkunastu starciach z rzędu, bo każda wygrana i tak kosztuje `roundsToKill-1` rund obrażeń
bez odnowienia. Naprawione przeliczeniem ataku potwora względem `maxHp/12` (tyle pełnych starć
powinna wytrzymać postać z rzędu) zamiast surowego stosunku rund — po zmianie ten sam test dał
30/30 wygranych. Test z gołą postacią (bez ekwipunku) na tym samym poziomie wciąż przegrywa
większość starć (rachunek: ~82% hp na starcie), więc zdobycie setu z danej krainy pozostaje
realną motywacją, a nie formalnością.

To pierwszy przebieg — dane celowo nazwane "bazą do dostosowania" (cytat użytkownika), nie
finalnym balansem; kolejne poprawki po realnym playtestingu.

## Ulepszenia +0..+9, itemy per klasa, gęstsza treść 1-99 (Etap 7)

Po pierwszym przebiegu balansu krain 1-99 (Etap 6) użytkownik chciał gęstszą, bardziej
autentyczną treść opartą na realnych danych z Metin2 wiki (tabela bonusów, lista potworów per
przedział poziomowy, strony broni/zbroi/hełmów per klasa) — więcej krain (węższe przedziały),
więcej potworów per krainę o zróżnicowanych poziomach, ulepszanie +0..+9 faktycznie
wpływające na staty (dotąd `InventoryItem.upgradeLevel` był zapisywany, ale nigdy nieczytany
przez silnik walki), oraz sety ograniczone do konkretnej klasy postaci.

**Model danych**: `Item` dostał `classId` (nullable FK do `CharacterClass` — null = uniwersalny,
stosowane tylko do `weapon`/`armor`/`helmet`) i `maxUpgradeStats` (JSON `StatBlock`, staty przy
+9 — `baseStats` teraz reprezentuje +0). Oba pola mają defaulty, więc `prisma db push` przeszedł
bez utraty danych (bez resetu `dev.db`, w przeciwieństwie do Etapów 5-6).

**Interpolacja ulepszenia**: `interpolateUpgrade(base, max, level)` w `combat.ts` — liniowa
interpolacja między +0 a +9 per stat, brak wpisu w `maxUpgradeStats` = stat nie rośnie z
ulepszeniem. Użyta w `gatherCombatBuild` (`expeditions/service.ts`) do liczenia realnych statów
ekwipunku (zamiast płaskiego `item.baseStats`), oraz zduplikowana we froncie
(`apps/web/src/lib/statMath.ts`) do pokazywania graczowi realnej, przeliczonej wartości w
panelu przedmiotu i tooltipie `ItemBox`. **Pułapka znaleziona przy weryfikacji**: pierwsza
wersja robiła `Math.round()` na każdym stacie — dla dużych statów (attack/defense/hp) to
poprawne, ale dla ułamkowych (`movementSpeed`, `critChance`, ...) zaokrąglało np. 0.1 w dół do
0, cichym zerowaniem stou. Naprawione przez usunięcie zaokrąglania z `interpolateUpgrade` —
`computeDerivedStats` i tak zaokrągla finalne, zsumowane staty tam gdzie to ma sens.

**Ograniczenie klasą**: `equipItem` (`inventory/service.ts`) odrzuca (400) próbę założenia
itemu z ustawionym `classId` przez postać innej klasy — jedna sprawdzana linijka, bo
`assertCharacterOwnership` już zwracała postać. `deleteCharacterClass` dodatkowo blokuje
usunięcie klasy, do której przypisane są itemy (analogicznie do istniejącego blokowania przy
przypisanych postaciach).

**Druga pułapka, niezwiązana z tym etapem wprost, ale odkryta przy testowaniu bogatszej puli
losowych bonusów**: `rollItemStats` (`inventory/service.ts`, dropowanie itemów) od zawsze
zaokrąglał `min`/`max` zakresu do liczb całkowitych PRZED losowaniem — dla zakresów w rodzaju
`critChance: 0.01-0.03` dawało to `randomInt(0, 0)`, czyli **zawsze 0**. Bug był niewidoczny
wcześniej, bo dotąd prawie nikt nie definiował ułamkowych `possibleStatRanges`. Naprawione
nowym `randomInRange` — zakresy węższe niż 2 (ułamkowe/procentowe staty) losowane bez
zaokrąglania pośredniego (wynik zaokrąglony do 4 miejsc), szersze (staty całkowitoliczbowe)
zachowują się jak dawniej.

**Generator treści** (`apps/api/prisma/seed-zones.ts`, pełna przebudowa): 10 węższych krain
(1-10, 11-20, ..., 91-99, zamiast dawnych 6 szerszych) zamiast dawnych 5 nowych + ręcznie
zasianej pierwszej — teraz **wszystkie 10, łącznie z Wilczym Uroczyskiem, generowane tym samym
kodem** (stary, ręcznie zasiany potwór/itemy Wilcze Uroczysko usuwane jednorazowo przez
`clearLegacySeedContent`). Per krainę: **5 potworów** rozłożonych równomiernie po poziomach w
przedziale (nie tylko końce), każdy z osobno policzonym hp/atakiem/exp/dropem (funkcja
`monsterStatsForLevel`, ewaluowana per-poziom zamiast raz na `zone.minLevel` jak w Etapie 6);
**16 itemów** — broń+zbroja+hełm dla każdej z 4 klas (nazwy w dopełniaczu, np. "Miecz
Mokradeł", "Hełm Wojownika Mokradeł" — dopełniacz celowo omija polską zgodność
przymiotnik-rzeczownik rodzajowo, bo działa identycznie po rzeczowniku męskim i żeńskim) +
uniwersalne buty/naszyjnik/kolczyki/pierścień; **jeden uniwersalny kamień wzmocnienia na
krainę** + pętla `ItemUpgradeRequirement` dla poziomów 1-9 na wszystkich 16 itemach (rosnąca
ilość, `qty = poziom × 2`) zamiast ręcznych wpisów. Skrypt pozostaje bezpieczny do
wielokrotnego uruchomienia (usuń-po-nazwie-i-odtwórz), bo użytkownik będzie dalej stroił
liczby.

**Świadomie poza zakresem** (nowe mechaniki silnika, nie tylko treść): odporności na typy
przeciwników, szansa na podwójny drop/yang, szanse na debuff przy trafieniu, bonusowe punkty
statystyk z itemu — bonusy losowe ograniczone do istniejących `StatKey`.

Zweryfikowane: curl — item z `classId` ustawionym na Wojownika odrzucony (400) przy próbie
equip przez Maga, przechodzi na Wojowniku; `combat-stats` rośnie dokładnie liniowo z
`upgradeLevel` (test: attack 28 przy +0, 68 przy +4, 118 przy +9, dla `baseStats.attack=10` →
`maxUpgradeStats.attack=100`); pełna ekspedycja w środkowej krainie (Krwawy Wąwóz, postać
poziom 30 w kompletnym secie Wojownika tej krainy) — 30/30 wygranych na wszystkich 5 wariantach
potwora, potwierdzając że wzór trudności z Etapu 6 skaluje się poprawnie przy nowej, gęstszej
strukturze. Przeglądarka: formularz admina pokazuje select klasy i oba edytory statów
(bazowe/+9) dla itemu typu weapon z poprawnie wypełnionymi wartościami.

## Nawigacja w sidebar, panel testowy admina, statystyki balansu (Etap 8)

Po zweryfikowaniu Etapu 7 użytkownik chciał: (1) trwałą zasadę rozwoju — nowe mechaniki mają
dawać się dopisywać bez resetu `dev.db`/postaci (opisane w sekcji "Zasady dalszego rozwoju"
powyżej), (2) pionowe menu po lewej zamiast poziomego paska, z panelami `Klasy`/`Krainy`/
`Potwory`/`Itemy`/`Ustawienia` skonsolidowanymi w jedną zakładkę, (3) narzędzie admina do
dodawania postaci exp/złota/itemów bez przechodzenia przez ekspedycje (dotąd robione ręcznie
skryptami Prisma przy każdej weryfikacji), (4) statystyki balansu z rzeczywistych ekspedycji —
ile razy i z jakim skutkiem walczono z danym potworem, ile obrażeń zabierał, jakie itemy
realnie wypadały, exp/h i złoto/h per kraina.

**Nawigacja**: `AppShell.tsx` przebudowany z poziomego paska na `<aside>` (`w-56`, stałe na
desktopie) + `<main className="flex-1">`. Poniżej `md:` sidebar chowany, zastąpiony wąskim
paskiem z przyciskiem-hamburgerem otwierającym nakładkę (`fixed inset-0`, półprzezroczyste tło,
lokalny `useState` na `open` — bez globalnego store). Menu: `Postacie` (zawsze), `Ustawienia`
(jedna pozycja, tylko admin, → `/admin/settings`), `Logi` (admin/moderator), email+wyloguj na
dole. `ClassesAdminPage`/`ZonesAdminPage`/`MonstersAdminPage`/`ItemsAdminPage`/
`SettingsAdminPage` straciły własny `<AppShell>` (zostały gołą treścią) — teraz owija je raz
`AdminSettingsPage.tsx`, nowy tab-container na `useSearchParams` (`?tab=classes` itd., więc
każda zakładka ma własny, odświeżalny adres URL). Siedem zakładek: `Ogólne`, `Klasy`, `Krainy`,
`Potwory`, `Itemy`, oraz dwie nowe: `Testowanie`, `Statystyki balansu`. `App.tsx`: pięć
osobnych tras `/admin/classes|zones|monsters|items|settings` skolapsowane do jednej
`/admin/settings`.

**Panel testowy** (`Testowanie`): nowy moduł backendu `modules/admin/characters`
(`GET /api/admin/characters` — lista wszystkich postaci wszystkich graczy z emailem
właściciela; `POST /:id/grant` — body `{exp?, gold?, items?: [{itemId, quantity}]}`).
`grantToCharacter` liczy `newLevel` przez już istniejące (wyeksportowane) `computeLevel`
(`expeditions/service.ts`), przyznaje `4×levelsGained` punktów statystyk i `1×levelsGained`
punktów umiejętności — te same mnożniki co przy `claimExpedition` — i dla każdego itemu woła
już istniejące (wyeksportowane) `addLootToInventory` (`inventory/service.ts`), dokładnie ten
sam kod co przy realnym dropie (losowanie statów, stackowanie) — zero zduplikowanej logiki
lootu. Całość w jednej transakcji Prisma, więc udany zapis postaci jest dowodem że item też
wylądował w ekwipunku. Frontend `GrantAdminPage.tsx`: wyszukiwarka postaci (filtr tekstowy po
stronie klienta), formularz exp/złoto + edytor listy itemów (wzorzec identyczny jak istniejący
edytor `upgradeRequirements` w `ItemsAdminPage.tsx`).

**Statystyki balansu** (`Statystyki balansu`): kluczowa decyzja — dane już istnieją w
`Expedition.eventLog` (pełny `CombatEvent[]` zapisywany raz przy starcie, patrz "Dziennik walki
na żywo" wyżej), więc nie trzeba nowej infrastruktury logowania, tylko agregacji po fakcie.
Nowy moduł `modules/admin/balance` (`GET /api/admin/balance-stats`, tylko admin): pobiera
wszystkie `Expedition` ze statusem `claimed`, dzieli `eventLog` na starcia po granicach
`encounter_start` (`splitIntoEncounters`), agreguje **per potwór** (starcia, wygrane/przegrane,
% wygranych, średnie obrażenia otrzymane, średnia liczba rund, średnie zużycie potionów — wprost
odpowiada na "ile hp zabiera potwór" i "czy gracz musi pić potiony"), **per item** (zdarzenia
`loot` w całym logu — łączna liczba dropów, dropy na ekspedycję, liczone z rzeczywistych
przebiegów, nie tylko skonfigurowanego `dropChance`), **per krainę** (exp/h i złoto/h liczone
dwojako: z pełnego cyklu `endsAt - startedAt` i z samej walki `fightEndsAt - arrivedAt` — różnica
między nimi pokazuje wprost koszt podróży do dalekich krain). Świadomie prosty pierwszy przebieg
(pełny skan `Expedition` w Node) — wystarczający przy obecnej skali danych; materializowana
tabela to problem do rozwiązania dopiero gdyby skan realnie spowolniał. Frontend
`BalanceStatsPage.tsx`: trzy tabele w stylu istniejących tabel admina.

Zweryfikowane: `pnpm typecheck` czysty (`shared`/`api`/`web`); curl —
`GET /api/admin/characters` zwraca postacie z emailem właściciela, `POST .../grant` z exp=500
podniosło poziom testowej postaci o 5 (poz. 8→13) i przyznało punkty statów/umiejętności
identycznie jak `claimExpedition`; `GET /api/admin/balance-stats` na rzeczywistej,
rozstrzygniętej ekspedycji zwrócił poprawne, niepuste agregaty per potwór (5 wariantów "Wilka",
w tym 100% wygranych dla najsłabszego wariantu i 0% dla silniejszych — spójne z jedną,
częściowo przegraną ekspedycją), per item (1 drop hełma) i per krainę (exp/h i złoto/h liczone
oboma metodami, bez dzielenia przez zero). Przeglądarka: sidebar poprawnie zwężony na desktopie,
na mobile (375×812) chowa się za hamburgerem i otwiera jako nakładka z tymi samymi pozycjami
menu; `/admin/settings?tab=...` przełącza zakładki i aktualizuje URL (przetestowano głębokie
linkowanie przez pełne przeładowanie strony); wszystkie 5 przeniesionych paneli (Ogólne, Klasy,
Krainy, Potwory, Itemy) działają bez regresji; zakładka Testowanie faktycznie podniosła poziom i
złoto wskazanej postaci widoczne od razu w odpowiedzi API; zakładka Statystyki balansu pokazuje
te same dane co curl.

## Podróż jako osobny krok, podróż kraina-kraina, wybór potworów (Etap 9)

Zgłoszony problem balansu: gracz poziomu 1 wysłany do krainy 1-10 (potwory poziomów 1,3,6,8,10)
mógł dostać losowo najsilniejszego potwora krainy i przegrać — silnik walki losował
przeciwnika z całej puli krainy bez względu na poziom gracza. Dodatkowo dotychczasowy model
ekspedycji wymuszał jeden ciągły cykl podróż-tam→walka→podróż-powrotna liczony z góry w jednym
kliknięciu. Ustalono z użytkownikiem: pełna podróż kraina-kraina od razu (nie tylko
wioska↔kraina), wybór potworów przez popup z kafelkami (nazwa/HP/exp/poziom, klik
zaznacza/odznacza, można zaznaczyć pojedyncze albo wszystkie naraz), "bycie w krainie" jako
nowy, osobny stan postaci — dopiero świadome "rozpocznij walkę" tworzy `Expedition`.

**Model danych** (addytywne, bez resetu `dev.db`): `Character` dostał `travelDestinationZoneId
String?` (null = cel to wioska) i `travelArrivesAt DateTime?` (null = postać nie jest w drodze —
jej obecność jest jedynym źródłem prawdy o tym, że trwa podróż, niezależnie od
`currentZoneId`). `currentZoneId` (już istniejące) zostaje źródłem prawdy o tym, gdzie postać
FIZYCZNIE stoi — nie zmienia się w trakcie podróży, tylko w momencie rozstrzygnięcia przybycia.
Ponieważ `Character` ma teraz dwie relacje do `Zone`, obie wymagały jawnych nazw
(`@relation("CharacterCurrentZone" | "CharacterTravelDestination", ...)`) — czysto typowa
zmiana, nie generuje SQL-a dla istniejącej kolumny `currentZoneId`. `Expedition` dostał
`selectedMonsterIds String @default("[]")` (pusta tablica = cała pula krainy, kompatybilne
wstecznie).

**Rozstrzyganie przybycia** (`apps/api/src/lib/travelResolution.ts`, `resolveTravelArrival`):
wzorzec compare-and-swap na dokładnie odczytanej wartości `travelArrivesAt` (analogiczny do
`claimExpedition`/`leaveExpedition`) — **nie** `updateMany({where:{lte: now}})`, bo Prisma nie
potrafi ustawić `currentZoneId = travelDestinationZoneId` (kolumna = wartość innej kolumny tego
samego wiersza) bez surowego SQL, więc docelową wartość trzeba najpierw odczytać, a dopiero
potem użyć jej w `WHERE` obok `data`, żeby zapis pozostał bezpieczny przy wyścigu. Funkcja
świadomie mieszka w `lib/`, nie w `modules/travel/`, żeby uniknąć cyklu importów: wołają ją
`modules/characters/service.ts`, `modules/expeditions/service.ts` i `modules/travel/service.ts`
nawzajem.

**Nowy moduł `modules/travel`**: `POST /api/travel/start {characterId, destinationZoneId}`.
Czas podróży: obie strony to krainy → suma obu `travelTimeSeconds` (uproszczony zamiennik
macierzy NxN krain — "dalsze krainy = dłużej", bez treści administrowanej per para krain);
jedna strona to wioska → tylko `travelTimeSeconds` tej krainy (zachowuje dokładnie zachowanie
sprzed Etapu 9). Redukcja przez `movementSpeedPct` postaci jak dotąd. Żadnej walidacji poziomu
postaci względem krainy docelowej przy starcie podróży — ta walidacja zostaje tam gdzie była,
czyli przy starcie walki, żeby gracz mógł świadomie dojść do trudniejszej krainy i wybrać tam
tylko najsłabszego potwora. Brak osobnego endpointu statusu podróży — `GET
/api/characters/:id` (już odpytywany przez frontend) w zupełności wystarcza jako źródło stanu
po rozszerzeniu `CharacterSchema`.

**`startExpedition`** (`modules/expeditions/service.ts`) wymaga teraz `currentZoneId ===
zoneId && travelArrivesAt === null` (409 inaczej — "postać musi najpierw dotrzeć do tej
krainy") zamiast dotychczasowego "zawsze można wysłać z dowolnego miejsca". Filtruje
`simZone.monsters` do `selectedMonsterIds` przed symulacją (pusta tablica = cała pula, jak
dawniej); pusta pula po filtrze (np. nieprawidłowe ID) → 400 zamiast cichej symulacji z zerową
pulą. Skoro podróż jest już osobnym krokiem PRZED wejściem do ekspedycji, `arrivedAt =
startedAt` i `fightEndsAt = endsAt` zawsze odtąd (kolumny zostają w schemacie, nie usunięte —
ekspedycje już w toku w momencie wdrożenia działają bez zmian aż do naturalnego zakończenia,
zero specjalnej logiki migracyjnej potrzebne, bo logika faz na froncie nie została ruszona —
patrz niżej). `applyExpeditionReward` przestał czyścić `currentZoneId` — postać zostaje w
krainie po zakończeniu/opuszczeniu walki, dopóki gracz nie zainicjuje nowej podróży. Przy okazji
naprawiony pre-existing brak atomowej ochrony przed podwójnym startem ekspedycji (dwa
równoległe żądania mogły oba utworzyć `Expedition` i nadpisać `activeExpeditionId`) —
`updateMany` z pełnym zestawem warunków wewnątrz tej samej transakcji co `expedition.create`,
rzut wyjątku = automatyczny rollback.

**Frontend** (`ExpeditionPanel.tsx`) — przebudowany na maszynę stanów zależną od pól postaci
(`currentZoneId`/`travelDestinationZoneId`/`travelArrivesAt`/`activeExpeditionId`,
`GamePage.tsx` przekazuje cały obiekt `character`): w wiosce (lista krain, "Wyrusz do krainy"),
w podróży (licznik "W drodze do X, dotrzesz za Ys"), w krainie bez walki (nazwa krainy + trzy
akcje: Walcz/Idź do innej krainy/Wróć do wioski), walka w toku, gotowe do odbioru. Logika faz
`traveling_there/fighting/traveling_back/ready` (liczona z `arrivedAtMs`/`fightEndsAtMs`/
`endsAtMs`) **celowo pozostawiona bez zmian** — dla nowych ekspedycji `arrivedAt===startedAt`
sprawia, że faza podróży ma zerową szerokość i naturalnie znika bez żadnej specjalnej logiki.
Nowy `MonsterPickerModal.tsx`: kafelki potworów krainy (nazwa/poziom/HP/exp z rozszerzonego
`zoneInclude.monsters.monster.select` w `admin/zones/service.ts`), klik = toggle, "zaznacz/
odznacz wszystkie".

Zweryfikowane: curl — podróż wioska→kraina (stan pośredni: `currentZoneId` wciąż `null`,
`travelArrivesAt` w przyszłości; po "upłynięciu czasu" — rozstrzygnięcie poprawne), 409 przy
drugiej podróży w trakcie pierwszej, podróż kraina→kraina bezpośrednio (czas = suma obu
`travelTimeSeconds`, zweryfikowany na Wilcze Uroczysko→Zapomniane Mokradła: 30+55=85s), 409 przy
starcie walki gdy `currentZoneId !== zoneId`, `selectedMonsterIds` z jednym ID → `eventLog`
zawiera wyłącznie tego potwora we wszystkich `encounter_start`, `currentZoneId` **zostaje**
krainą po `claim` (nie wraca do `null`), 409 przy próbie usunięcia krainy z postacią w drodze do
niej. Przeglądarka: pełny cykl wioska → wybór krainy → licznik podróży → w krainie (3 akcje) →
popup wyboru potworów (zaznaczono tylko najsłabszego) → walka ("WALCZY W KRAINIE…", faza
podróży poprawnie zerowej szerokości) → odbiór nagród (loot faktycznie trafił do ekwipunku) →
**postać zostaje w krainie** (nie wraca do wioski) → "Idź do innej krainy" (próba wejścia do
krainy poza zakresem poziomu poprawnie zablokowana dopiero przy starcie walki, nie przy samym
dojściu) → powrót do właściwej krainy → ponowna walka → "Wróć do wioski" → z powrotem stan
wioski z listą krain.

## Walka rundowa do śmierci, panel potwora, tooltipy, filtry admina, skrzynie (Etap 10)

Sześć powiązanych żądań: (1) walka trwa aż do śmierci postaci zamiast z góry ustalony czas,
gracz może ją przerwać w dowolnym momencie (`leaveExpedition` już to umożliwiał — bez zmian);
(2) info o walce rozbite na "rundy" z realnymi deltami HP po każdej rundzie/potionie; (3) panel
z info o aktualnie zwalczanym potworze nad dziennikiem walki, z placeholderem grafiki; (4)
przedmioty dostają placeholder-ikony; (5) pełny tooltip przedmiotu (klasa/poziom/staty) z
liczbami całkowitymi/procentami i jednolitym polskim językiem, zamiast np. `defense: 0.146`;
(6) filtry po typie/klasie w panelu Itemy i w Testowaniu (dziś płaski `<select>` z ~160
opcjami); (7) nowy typ przedmiotu "Skrzynia" z częściowo losową zawartością, otwierana prawym
klikiem. Użytkownik potwierdził (`AskUserQuestion`) zachowanie maksymalnego czasu walki jako
zabezpieczenia technicznego (nie gwarantowanego czasu) — bez tego silnie przeważająca postać
mogłaby generować nieograniczenie długi `eventLog`.

**Silnik walki — rundy w ramach jednego starcia, do śmierci** (`combat.ts`,
`simulateExpedition`, pełna przebudowa): "runda" = jedna wymiana ciosów (gracz atakuje, jeśli
potwór przeżył — odbija), tyka co `ROUND_SECONDS=3s`. Krytyk i unik losowane NA NOWO co rundę
(dawniej raz na całe zagregowane starcie) — świadoma zmiana wariancji balansu, bo inaczej pasek
HP potwora skakałby od razu z pełna do zera bez sensu "ścierania się". Twardy bezpiecznik
`MAX_ROUNDS=3000` (~2.5h symulowanej walki) niezależny od ustawienia administratora — chroni
przed nieograniczonym `eventLog`, gdyby admin kiedyś podniósł limit minut. `hp<=0` → natychmiastowy
koniec CAŁEJ symulacji (`character_died`, terminalny) — usunięta pasywna regeneracja między
starciami (`PASSIVE_REGEN_PER_MINUTE`), w nowym modelu 0 HP to realna śmierć, nie stan
odwracalny. Osiągnięcie limitu bez śmierci → `fight_time_limit_reached` (postać przeżyła).
`startExpedition` (`expeditions/service.ts`) liczy `endsAt` dynamicznie z ostatniego zdarzenia
symulacji (`outcome.events.at(-1)?.t`), nie z pełnego skonfigurowanego limitu — "Odbierz
nagrody" pojawia się dokładnie w momencie zgonu/limitu, nie dopiero po wyczerpaniu maksimum.

**Kształt `CombatEvent`** (`combatEvent.ts`, breaking change — bezpieczne, bo to JSON w
`String?`, stare zakończone ekspedycje nie są już czytane poza `computeBalanceStats`): nowy typ
`round{playerDamage, playerCrit, monsterHpAfter, monsterDamage, monsterEvaded, playerHpAfter}`
zastępuje skumulowane `player_attack`+`monster_attack`; `encounter_result` stracił pole `won`
(zawsze oznacza wygraną — przegrana to teraz `character_died`, nie osobne starcie); nowe
terminalne `character_died`/`fight_time_limit_reached`; `potion_used` dostał `amount` (ile
HP/many faktycznie przywrócono, albo wielkość buffu w % — wcześniej backend to liczył, ale
nigdzie nie emitował). `computeBalanceStats` (Etap 8) zaktualizowany pod `round` (obrażenia
brane wprost z `event.monsterDamage`), z heurystyką pomijania starych ekspedycji
(`start.monsterId === undefined`) — mix starego/nowego kształtu w tych samych uśrednieniach
dawałby ciche, mylące dane. `wins`/`losses` per potwór odzyskały sens dzięki nowym zdarzeniom
terminalnym: `wins` = starcie z `encounter_result` (potwór pokonany), `losses` = starcie z
`character_died` w tym samym fragmencie (postać zginęła walcząc z tym potworem) — bardziej
użyteczne niż stary model, bo bezpośrednio wskazuje który potwór realnie zabija graczy.

**Frontend combat UI**: nowy `MonsterEncounterPanel.tsx` nad `CombatLog.tsx` — nazwa+poziom
aktualnego potwora (z ostatniego widocznego `encounter_start`), żywy pasek HP (z ostatniego
`round.monsterHpAfter`), jeden uniwersalny placeholder-glif (SVG, nie per-potwór — realna
grafika to przyszły etap). `CombatLog.tsx` przepisany pod `round` — każda linia pokazuje wprost
"-X obrażeń" graczowi/potworowi z pól zdarzenia, bez przeliczania różnic po stronie frontu.

**Tooltip przedmiotu i jednolite formatowanie** — nowy `apps/web/src/lib/statFormat.ts`:
`STAT_LABELS` (polskie nazwy wszystkich `StatKey`) + `STAT_FORMAT` (`flat` dla
attack/defense/hp/maxMana/attackSpeed — zaokrąglone do liczby całkowitej; `percent` dla
critChance/critDamage/evasion/damageReduction/movementSpeed — ×100 zaokrąglone, ze znakiem "+"
— `critDamage` na poziomie itemu to bonus nad bazowym mnożnikiem 1.5, nie sam mnożnik, stąd
procentowa interpretacja jest tu poprawna). Nowy `ItemTooltip.tsx` (custom hover przez
`group-hover`, zastępuje natywny atrybut `title`) pokazuje nazwę+poziom ulepszenia, klasę
(`Dla klasy: X`/`Uniwersalny` — wymagało dociągnięcia `classId`+`class` do `listInventory` w
`inventory/service.ts`, bo `InventoryItemDto` w ogóle tego nie miało), "Od poziomu: X", pełną
listę statów sformatowaną. Świadomie BEZ systemu rzadkości (dołączony zrzut ekranu z Metin2 to
wzór UKŁADU tooltipa, nie prośba o dodanie tierów "ZWYKŁY"/itd. — o to wprost nie proszono).
Nowy `ItemTypeIcon.tsx` — prosty, wspólny SVG-glif per `ItemType`, celowo "placeholderowy".
`GamePage.tsx` miał DRUGI, osobny surowy dump statów (panel szczegółów wybranego przedmiotu) —
też przepisany na `STAT_LABELS`/`STAT_FORMAT`, inaczej problem zostałby tylko połowicznie
naprawiony; przy okazji dodano `TYPE_LABELS` (polskie nazwy typów zamiast surowych `weapon`/...).

**Filtry admina**: `ItemsAdminPage.tsx` i `GrantAdminPage.tsx` — szukajka tekstowa + filtr typu
+ filtr klasy nad listą/dropdownem (client-side, `useMemo`), zawężające ~174 itemy do
realistycznej liczby wyników.

**Skrzynia** — nowy `ItemType` `"chest"` (jak `material`/`quest`, nie w `EquipSlotSchema`),
nowy model `ChestLoot` (wzorem `MonsterDrop`: `chestItemId`, `rewardItemId`, `dropChance`,
`minQty`, `maxQty`, dwie nazwane relacje do `Item` bo występuje w dwóch rolach). Otwieranie
(`modules/inventory/service.ts`, `openChest`) losuje każdy wiersz niezależnie
(`Math.random() < dropChance` — `dropChance:1` = gwarantowane), woła reużyte
`addLootToInventory` (ten sam kod co realny drop z potwora), zmniejsza stos skrzyni o 1
(usuwa slot przy ostatniej). Admin UI: edytor `chestLoot` w `ItemsAdminPage.tsx` (wzorem
`upgradeRequirements`), `deleteItem` guard rozszerzony o użycie jako nagroda w skrzyni.
Frontend: `onContextMenu` na `ItemBox.tsx` (tylko `type==="chest"`) → `openChest` → komunikat
z listą zdobytych przedmiotów. Świadomie POZA zakresem: seed script z przykładową "skrzynią
startową" — zbudowano mechanizm, treść tworzy admin przez nowy UI.

**Świadomie NIE zmieniane**: nazwa klucza ustawienia (`expedition.defaultDurationMinutes`),
URL (`/api/settings/expedition-duration`) i nazwy funkcji w kodzie zostały bez zmian — zmieniono
tylko widoczny dla gracza/admina tekst ("Maksymalny czas pojedynczej walki (zabezpieczenie)"),
żeby ograniczyć zakres zmiany i ryzyko literówek w wielu miejscach na raz.

**Obserwacja balansowa z weryfikacji** (nie naprawiana teraz — realny wynik nowego modelu, nie
błąd): bez naturalnej regeneracji HP między starciami, nawet dobrze wyekwipowana postać w
końcu ginie na skutek zwykłej akumulacji drobnych obrażeń w bardzo długiej sesji (nagi poziom-1
charakter zginął po 1 starciu z najsłabszym potworem krainy; w pełnym secie Wilcze Uroczysko
pokonał 49 Młodych Wilków zanim padł, bez potionów w aktywnych slotach). To zgodne z wcześniej
wyrażonym celem projektu ("żeby gracz realnie zużywał potiony, a nie zabijał potwory bez
problemu") — potiony stają się realnie potrzebne do dłuższych sesji, nie kosmetyczne. Dalsze
strojenie liczb (`referenceNakedStats`/`gearBudget` w `seed-zones.ts`) to temat na kolejny
etap po realnym playteście, zgodnie z ustaloną praktyką projektu.

Zweryfikowane: curl — słaba (naga) postać vs dobrze dobrany potwór → `character_died` po 5
rundach, `endsAt` dokładnie odpowiada momentowi zgonu; ta sama postać w pełnym secie krainy →
49 wygranych starć zanim padła; `leaveExpedition` z nowym silnikiem → poprawna częściowa
nagroda + awans poziomu; skrzynia z gwarantowanym (`dropChance:1`) i niemożliwym
(`dropChance:0`) wpisem → `awarded` zawiera tylko gwarantowany, stos skrzyni zmniejsza się i
znika przy ostatniej; próba otwarcia nie-skrzyni → 400; próba usunięcia itemu użytego jako
nagroda w skrzyni → 409. Przeglądarka: pełen cykl walki rundowej na żywo (log odsłania się co
~3s, pasek HP potwora realnie się ścieka, krytyki/loot/zwycięstwa widoczne), tooltip przedmiotu
pokazuje pełne liczby całkowite/procenty po polsku z nazwą klasy, filtry w Itemy/Testowanie
realnie zawężają ~174 itemy, prawy klik na skrzyni w ekwipunku poprawnie ją otworzył (zniknęła
ze stosu, gwarantowana nagroda trafiła do plecaka) — przez rzeczywisty kod UI
(`ItemBox`→`onContextMenu`→mutacja→invalidacja), nie tylko przez curl.

## Weryfikacja przeprowadzona

- `pnpm typecheck` przechodzi dla `shared`, `api`, `web`
- Ręcznie przez curl: register, login (poprawny/niepoprawny), `/me`, refresh (rotacja tokenu),
  logout, odrzucenie refresha po wylogowaniu, RBAC na `/api/admin/logs` (403 dla playera),
  filtrowanie logów po module/poziomie
- Przez przeglądarkę (Claude Browser): rejestracja → przekierowanie na `/characters`,
  zachowanie sesji po odświeżeniu strony, wylogowanie, logowanie jako admin, panel
  `/admin/logs` z filtrowaniem (test filtra `level=warn` zwrócił dokładnie 1 wpis)
- Etap 2 (curl + przeglądarka): utworzenie itemu-materiału, itemu-broni z zakresem statów i
  wymaganiem ulepszenia, potwora z dropem, krainy z potworem i dropem — z poprawnym
  wypełnieniem relacji w odpowiedzi; blokada usunięcia potwora użytego w krainie i itemu
  użytego w dropie/jako materiał; utworzenie, edycja i usunięcie itemu przez formularz w
  przeglądarce (`/admin/items`) z odświeżeniem listy
- Etap 3 (curl + przeglądarka): rejestracja gracza, utworzenie postaci, blokada duplikatu
  nazwy; equip odrzucony dla niepasującego slotu (400), equip poprawny, zdjęcie ekwipunku;
  upgrade konsumujący materiały z wielu stosów (5→2 sztuki), poprawny wzrost `upgradeLevel`,
  odrzucenie ulepszenia bez zdefiniowanej ścieżki (400); move z zamianą zajętego slotu; w
  przeglądarce na `/game/:characterId`: pełny cykl przeciągnięcia itemu do slotu ekwipunku
  (`equip-weapon`) i z powrotem do siatki (potwierdzone komunikatami dostępności `dnd-kit`
  "was dropped over droppable area ..."), klik na item pokazujący panel szczegółów z przyciskiem
  ulepszenia
- Etap 4 (curl + przeglądarka): pełny cykl w przeglądarce — wysłanie postaci na ekspedycję,
  żywy licznik odliczający do zera, odbiór nagród z podsumowaniem (exp/złoto/łup/awans),
  powrót do wyboru krainy gotowy na kolejną ekspedycję; poziom postaci zaktualizowany w
  nagłówku (750→775 exp po odbiorze); zablokowana krata dla krainy poza zakresem poziomu
  (przycisk `disabled` w DOM), błąd "krainie nie przypisano potworów" wyświetlony w UI po
  próbie wysłania do pustej krainy; curl: podwójny start (409), przedwczesny odbiór (409),
  podwójny odbiór (409), symulacja zwracająca poprawny exp/gold/loot zgodny z danymi potwora,
  stackowanie lootu z istniejącym stosem w ekwipunku, RBAC na zapisie ustawień (403 dla gracza)
- Etap 5 (curl + przeglądarka): CRUD klas z 6 umiejętnościami (4 klasy × 6 = 24 w seedzie),
  blokada usunięcia klasy używanej przez postać i umiejętności z wykupionymi punktami;
  tworzenie postaci z klasą (odrzucenie nieistniejącego `classId`), `allocate-stat`/
  `allocate-skill` (blokada przy 0 punktów, blokada umiejętności spoza klasy postaci); **test
  porównawczy silnika walki** — ta sama postać z bazowymi statami (5/5/5/5) przegrywa każde
  starcie z mocnym potworem (0 exp/gold/kills), po dopisaniu 40 punktów staty (siła 30,
  witalność 20) wygrywa (100 exp, 20 gold, awans na poziom 2, +4 niewydane punkty staty i +1
  umiejętności) — potwierdza, że build postaci realnie zmienia wynik symulacji; izolowany test
  `combat.ts` z osłabioną postacią potwierdził zużywanie potionu progowego (`hp_below`) w
  trakcie ekspedycji; w przeglądarce: panel `/admin/classes` z warunkowymi polami formularza,
  konfiguracja potionu w `/admin/items` (widoczna tylko dla `consumable`), tworzenie postaci
  z wyborem klasy, `StatsPanel`/`SkillsPanel` z poprawnie wyłączonymi przyciskami przy 0
  punktach, przeciągnięcie itemu do nowego slotu ekwipunku (`equip-weapon`) i do aktywnego
  slotu potionów (`active-0`), pełny cykl ekspedycji zakończony lootem w ekwipunku. Po drodze
  znaleziono i naprawiono brak `goldReward` w `createMonster` (patrz sekcja modułów wyżej).
