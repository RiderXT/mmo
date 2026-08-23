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
ilość, `qty = poziom × 2`) zamiast ręcznych wpisów.

**UWAGA (od Etapu 15) — ta notatka o "bezpieczeństwie" była aktualna tylko w fazie tworzenia
treści, zanim istnieli prawdziwi gracze.** `clearTier` (wywoływane dla każdej krainy przy
każdym uruchomieniu) usuwa krainę/potworów/itemy po nazwie i tworzy je od nowa — po drodze
kasuje **wszystkie ekspedycje w tej krainie**, przenosi każdą postać aktualnie w tej krainie
z powrotem "donikąd" (`currentZoneId: null`) i usuwa `InventoryItem` graczy trzymających
którykolwiek z usuwanych itemów. Na produkcji z realnymi kontami **nie wolno** już uruchamiać
`seed-zones.ts` ponownie — to skasuje graczom przedmioty i historię ekspedycji w danej
krainie. Punktowe poprawki liczb (np. szans dropu) na już zasianej bazie robi się przez
dedykowany, addytywny skrypt (np. `prisma/scripts/lower-drop-rates.ts` — tylko `updateMany`
na konkretnych polach, zero usuwania) albo ręcznie przez panele admina Itemy/Potwory/Krainy.

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

## Złoto i przedmioty startowe per klasa (Etap 11)

Żądanie: panel admina, w którym można skonfigurować jaki przedmiot lub bonus dostaje nowo
założona postać. Zinterpretowane jako konfigurowalny **per klasa** zestaw startowy (złoto +
lista przedmiotów) — spójne z tym, że gra już różnicuje sety per klasa (Etap 7). "Bonus"
ograniczony świadomie do złota (najprostszy, uniwersalny bonus) — bez rozszerzania o
punkty statystyk/exp, o co wprost nie proszono.

**Model danych** (addytywne, bez resetu `dev.db`): `CharacterClass` dostał `startingGold Int
@default(0)`. Nowy model `ClassStarterItem` (wzorem `ChestLoot`/`ItemUpgradeRequirement`):
`classId`, `itemId`, `quantity`, `@@unique([classId, itemId])`. Wszystkie istniejące klasy mają
`startingGold: 0` i pustą listę — zero zmiany zachowania dla klas, których admin nie skonfiguruje.

**Przyznawanie** (`modules/characters/service.ts`, `createCharacter`): `characterClass` pobierana
z `include: { starterItems: true }`; tworzenie postaci opakowane w `prisma.$transaction` —
`character.gold` ustawione od razu na `characterClass.startingGold`, potem dla każdego
`starterItem` wywołane reużyte `addLootToInventory` (ten sam kod co realny drop z potwora czy
otwarcie skrzyni — losuje staty jeśli item niestakujący, stackuje jeśli tak). Admin CRUD
(`modules/admin/classes/service.ts`) — `starterItems` persystowane wzorem
`upgradeRequirements`/`chestLoot` (`deleteMany`+`create` przy update), nowa
`assertStarterItemsExist`. `deleteItem` (`modules/admin/items/service.ts`) — guard rozszerzony
o `classStarterItem.count`, żeby nie dało się usunąć itemu użytego jako startowy.

**Admin UI** (`ClassesAdminPage.tsx`): pole "Złoto startowe" + edytor "Przedmioty startowe"
(item + ilość, wzorem edytora `chestLoot`), nowa kolumna "Start: złoto/itemy" w tabeli klas.

Zweryfikowane: curl — aktualizacja klasy Mag (`startingGold:50`, 2 przedmioty startowe) →
utworzenie nowej postaci tej klasy → `gold:50` w odpowiedzi, ekwipunek zawiera dokładnie
skonfigurowane przedmioty z poprawną ilością; próba usunięcia itemu użytego jako startowy →
409. Przeglądarka: formularz edycji klasy poprawnie ładuje istniejące złoto/przedmioty startowe,
tabela pokazuje "50 / 2" dla Maga.

## Baner "wyszła nowa wersja" po `deploy.sh` (Etap 12)

Żądanie: po uruchomieniu `./deploy/deploy.sh` na VPS, gracze z otwartą kartą przeglądarki mają
zobaczyć komunikat o dostępnej aktualizacji z możliwością odświeżenia.

**Zasada działania — porównanie wersji, bez żadnej nowej infrastruktury**: `deploy.sh` zawsze
robi `git pull` przed restartem usługi, więc commit `HEAD`, na którym stoi repo w momencie
startu procesu, JEST wdrożoną wersją — nie trzeba żadnego osobnego pliku/licznika wersji.
`apps/api/src/lib/appVersion.ts` odczytuje `git rev-parse HEAD` **raz, przy starcie serwera**
(`execSync`) i trzyma w stałej `APP_VERSION`; nowy publiczny endpoint `GET /api/version`
(`app.ts`, wzorem istniejącego `/health`) go zwraca. Frontend robi dokładnie to samo przy
buildzie: `vite.config.ts` woła `git rev-parse HEAD` w `define: { __APP_VERSION__: ... }`, więc
hash commita, z którego zbudowano bundel, jest w nim zaszyty na stałe (typ zadeklarowany w
`vite-env.d.ts`).

**Wykrywanie** (`apps/web/src/components/UpdateBanner.tsx`, zamontowany raz w `AppShell.tsx`
— widoczny więc na każdym ekranie gry): odpytuje `GET /api/version` przy montowaniu i co 60s
(`setInterval`, bez żadnej nowej biblioteki). Gdy zwrócona wersja różni się od `__APP_VERSION__`
wbudowanej w bieżący bundel (a obie są znane, nie `"unknown"` — środowiska bez `.git` nie
generują fałszywych alarmów), pokazuje stały baner na dole ekranu: "Wyszła nowa wersja gry —
odśwież, żeby zobaczyć zmiany." z przyciskiem "Odśwież" (`window.location.reload()`). Świadomie
bez przycisku "później"/wyciszania — baner jest wąski, nie blokuje reszty ekranu, a odstęp 60s
między sprawdzeniami wystarcza, żeby nie był nachalny.

Zweryfikowane: curl `GET /api/version` zwraca aktualny hash `HEAD`, identyczny z lokalnym `git
rev-parse HEAD`. Przeglądarka: przy zgodnych wersjach baner się nie pojawia; po podmianie
(w konsoli, symulując wdrożenie w tle) odpowiedzi `/api/version` na inny hash i przemontowaniu
`AppShell` (nawigacja SPA między ekranami gry) baner poprawnie się pojawił z właściwym tekstem
i przyciskiem "Odśwież".

## Zabezpieczenie przed błędem balansu w ekspedycjach + narzędzia naprawcze (Etap 13)

### Kontekst

Realny incydent produkcyjny: postać poziomu 1, po ok. 15 minutach ekspedycji (`leave_early`),
zdobyła 4485 exp / 299 pokonanych potworów i awansowała od razu na poziom 48. Przyczyna nie
była błędem w kodzie silnika walki (Etap 10 działał zgodnie ze specyfikacją: walka trwa aż do
śmierci, cofnięcie w dowolnym momencie liczy nagrodę tylko za realnie upłynięty czas), tylko
tym, że postać w danej krainie praktycznie nie mogła przegrać (~1 runda na zabicie potwora) —
przy modelu "walcz aż do śmierci" oznacza to, że ekspedycja może bez końca (do bezpiecznika
`MAX_ROUNDS`/limitu minut) generować nagrody, jeśli kraina/potwory są za słabe względem postaci.
To realny efekt uboczny połączenia Etapu 9 (wybór potworów) + Etapu 10 (walka do śmierci) z
niedostrojonym balansem, a nie usterka pojedynczej funkcji.

### A) Automatyczna blokada podejrzanej nagrody

`apps/api/src/modules/expeditions/service.ts`: `checkRewardPlausibility(character, result)` —
twardy, niekonfigurowalny przez admina bezpiecznik (analogicznie do `MAX_ROUNDS` w `combat.ts`):
jeśli pojedyncza ekspedycja przyznałaby więcej niż `MAX_LEVELS_PER_EXPEDITION = 10` poziomów
naraz, `claimExpedition`/`leaveExpedition` **nie** wywołują `applyExpeditionReward`. Zamiast
tego `flagSuspiciousExpedition` atomowo (ten sam wzorzec `updateMany` co reszta modułu) zmienia
`Expedition.status` na `"flagged"` (nowa dozwolona wartość istniejącego pola String — bez
zmiany schematu) i loguje `GameLog` (`module: "expeditions"`, `action: "reward_blocked"`,
`level: "error"`, payload z kodem `SUSPICIOUS_LEVEL_JUMP`). Gracz dostaje czytelny błąd 422 z
kodem; nie może ponowić odbioru ani opuszczenia (obie funkcje odrzucają status `"flagged"`).

### B) Rozwiązywanie zablokowanych ekspedycji (panel admina)

Nowy moduł `apps/api/src/modules/admin/expeditions/` (`resolveFlaggedExpedition`,
`POST /api/admin/expeditions/:id/resolve` body `{ grant: boolean }`): admin decyduje —
`grant:true` przyznaje oryginalny wynik mimo blokady (reużywa wyeksportowany teraz
`applyExpeditionReward`), `grant:false` odrzuca nagrodę i tylko zwalnia
`character.activeExpeditionId`, żeby postać nie została trwale zablokowana. Panel: sekcja
"Zablokowane ekspedycje" w `GrantAdminPage.tsx` (zakładka Testowanie).

### C) Cofanie już przyznanej nagrody (dla incydentów sprzed tej zmiany)

`revertExpedition` (ten sam moduł, `POST /api/admin/expeditions/:id/revert`): cofa exp/złoto/
poziom/przedmioty przyznane przez **już rozliczoną** ekspedycję, bez resetu bazy. Źródłem prawdy
o tym, co faktycznie przyznano, jest wpis `GameLog` (`action: "claim"` albo `"leave_early"`)
zapisany przez `applyExpeditionReward` w momencie przyznania — **nie** `Expedition.result`,
które dla `leave_early` zawiera pełny potencjalny wynik, a nie tylko tę część, która została
faktycznie wypłacona. Usuwanie przedmiotów jest best-effort (najpierw nieekwipowane, potem
najnowsze stosy; niedobór — bo gracz już zużył/sprzedał przedmiot — jest raportowany, nie
przerywa reszty operacji). Nowe pole `Expedition.revertedAt DateTime?` (addytywne) chroni przed
podwójnym cofnięciem. Panel: sekcja "Cofnij ekspedycję" w `GrantAdminPage.tsx`.

Zweryfikowane lokalnie (curl, testowe konto): spreparowana ekspedycja z `expGained: 999999`
została poprawnie zablokowana (status `flagged`, wpis w logu z kodem); `resolve` z `grant:false`
zwolnił slot bez zmiany exp; `resolve` z `grant:true` przyznał nagrodę (i został poprawnie
wykryty przez `revert` jako w pełni odwracalny); `revert` na zwykłej, wcześniej rozliczonej
ekspedycji poprawnie odjął dokładnie tyle exp/złota, ile wcześniej przyznano, bez naruszania
innych danych postaci.

## Pasek HP/MP gracza w walce, ikony lootu, menu kontekstowe itemu (Etap 14)

### Kontekst

Trzy niezależne poprawki UX zgłoszone razem z incydentem z Etapu 13: (1) dziennik walki
pokazywał aktualne HP/HP potwora wyłącznie jako tekst w każdej linijce rundy — brak żywego,
ciągłego wskaźnika; (2) event `loot` w dzienniku walki i lista nagród na ekranie odbioru
pokazywały gołą nazwę przedmiotu zamiast ikony (mimo że siatka ekwipunku ma ikony od Etapu 10);
(3) prawy klik na przedmiocie od razu otwierał skrzynię (Etap 10) bez żadnego wyboru — brakowało
ogólnego menu kontekstowego z opcjami Otwórz/Sprzedaj/Usuń.

### A) Pasek HP/MP gracza

Nowy `apps/web/src/components/expedition/PlayerVitalsBar.tsx`: wyprowadza aktualne HP/MP z
ostatniego odsłoniętego zdarzenia (`round` aktualizuje tylko HP, `skill_activated`/`potion_used`
aktualizują oba — regeneracja many jest liczona po cichu w symulacji i nie ma własnego zdarzenia
w logu, więc wartość many po prostu nie zmienia się między zdarzeniami, które ją niosą).
Renderowany w `ExpeditionPanel.tsx` nad `MonsterEncounterPanel` (który już miał pasek HP
potwora od Etapu 10) — max HP/MP pobierane z istniejącego `GET /api/characters/:id/combat-stats`.
Linie rundy w `CombatLog.tsx` skrócone (nie powtarzają już "Twoje HP: X"/"potwór: Y HP" — to
teraz pokazują paski na żywo, log narracyjnie opisuje tylko co się stało w danej rundzie).

### B) Ikony zamiast tekstu w logu lootu

`CombatLog.tsx`: event `loot` renderuje `ItemTypeIcon` (już istniejący komponent z Etapu 10)
obok nazwy, zamiast gołego tekstu — wymaga przekazania pełnego `ItemDto` (typ przedmiotu), nie
tylko nazwy, więc `itemNameFor: (id) => string` w `ExpeditionPanel.tsx` zostało rozszerzone o
`itemFor: (id) => ItemDto | undefined`. To samo zastosowane w liście nagród na ekranie
"Ekspedycja zakończona".

### C) Menu kontekstowe przedmiotu (Otwórz / Sprzedaj / Usuń)

Nowy `Item.sellPrice Int @default(0)` (addytywne) — cena sprzedaży za 1 sztukę, 0 = nie do
sprzedania. Edytowalne w `ItemsAdminPage.tsx`. Nowe akcje w `inventory/service.ts`:
- `sellItem` — sprzedaje **cały stos** za `sellPrice × quantity` złota, wymaga zdjęcia
  przedmiotu (equipped nie można sprzedać wprost — częsty błąd w grach z tym wzorcem).
- `discardItem` — trwale usuwa stos bez nagrody, też wymaga zdjęcia.

Nowy `apps/web/src/components/inventory/ItemContextMenu.tsx`: pozycjonowane menu (`fixed`, przy
kursorze, zamyka się na klik poza/Escape) z opcjami zależnymi od przedmiotu — "Otwórz" tylko dla
`type==="chest"`, "Sprzedaj" wyszarzone gdy `sellPrice<=0`, "Usuń" zawsze (z potwierdzeniem).
`ItemBox.tsx`'s `onContextMenu` nie otwiera już skrzyni bezpośrednio — woła callback z pozycją
kliknięcia, `GamePage.tsx` trzyma stan otwartego menu i routuje wybraną akcję do odpowiedniej
mutacji.

Zweryfikowane w przeglądarce: nowa postać (klasa Mag) dostała poprawnie 50 złota + 2 przedmioty
startowe (potwierdza też, że panel "Złoto/Przedmioty startowe" z wcześniejszego etapu faktycznie
działa w grze); prawy klik na Miksturze Życia (ustawione `sellPrice: 5`, stos ×3) pokazał menu
bez "Otwórz" (nie skrzynia), kliknięcie "Sprzedaj" sprzedało cały stos za 15 złota (50→65) i
usunęło slot; prawy klik na Różdżce Wilków → "Usuń" (z potwierdzeniem) trwale usunął przedmiot
bez żadnej nagrody.

## System eventów exp/złoto x2-x4 na czas określony (Etap 16)

### Kontekst

Po zablokowaniu drugiego z rzędu podejrzanego skoku poziomu (Etap 13/15) użytkownik poprosił o
mechanizm bonusowych eventów czasowych (np. weekend x2-x4 exp/złota) — z założeniem, że event
może być zaplanowany na przyszłość (data/godzina startu + czas trwania, nie tylko "start
natychmiast"), oraz że limit bezpieczeństwa `SUSPICIOUS_LEVEL_JUMP` (Etap 13) musi się
przeskalować razem z aktywnym mnożnikiem exp, żeby uczciwy bonus eventowy nie był fałszywie
blokowany.

### Model danych

Nowy model `GameEvent` (addytywne, bez resetu): `name`, `expMultiplier`, `goldMultiplier`,
`startsAt`, `endsAt`. "Aktywny" = `startsAt <= now <= endsAt`. Jeśli kilka eventów nakłada się
czasowo, obowiązuje **maksimum z każdego mnożnika osobno** (nie mnożenie przez siebie) —
`apps/api/src/lib/gameEvents.ts`, `getActiveEventMultipliers()`.

`Expedition` dostaje `appliedExpMultiplier`/`appliedGoldMultiplier` (`Float @default(1)`,
addytywne) — mnożnik **zapisywany raz, przy starcie ekspedycji** (nie odczytywany na nowo przy
odbiorze), żeby wynik i próg bezpieczeństwa pozostały spójne nawet jeśli event się skończy
zanim gracz odbierze nagrodę.

### Silnik walki i próg bezpieczeństwa

`simulateExpedition` (`combat.ts`) dostaje `expMultiplier`/`goldMultiplier`, mnoży
`expReward`/`goldReward` **przy każdym zabiciu** (nie na końcu sumarycznie) — dzięki temu
`encounter_result` w evencie i podsumowanie są od razu spójne, a częściowy odbiór
(`leaveExpedition`, który tnie listę zdarzeń) automatycznie dziedziczy poprawne, już pomnożone
wartości bez dodatkowej logiki.

`checkRewardPlausibility` (Etap 13) mnoży `MAX_LEVELS_PER_EXPEDITION` (10) przez
`appliedExpMultiplier` zapisany na danej ekspedycji — przy evencie x3 próg staje się 30
poziomów, przy braku eventu zostaje 10 jak dotychczas.

### Panel admina

`modules/admin/events` (CRUD, wzorem `admin/classes`) + zakładka "Eventy" w
`AdminSettingsPage.tsx`: formularz nazwa/mnożnik exp/mnożnik złota/start/koniec
(`datetime-local`), tabela z oznaczeniem "AKTYWNY" dla eventu spełniającego `startsAt<=now<=
endsAt`.

**Świadomie poza zakresem**: brak widocznego dla gracza banera "trwa event" (nie proszono o
to) — event działa niewidocznie w tle, gracz zobaczy efekt tylko przez wyższy zysk exp/złota w
dzienniku walki.

Zweryfikowane: curl — kraina z jednym potworem (`expReward: 15`), aktywny event x3 → w
evencie `encounter_result.expGained: 45` (15×3), zgodnie z oczekiwaniem; spreparowana
ekspedycja z `appliedExpMultiplier: 3` i skokiem 25 poziomów **przeszła** (próg 30), identyczna
ekspedycja z `appliedExpMultiplier: 1` (bez eventu) **została zablokowana** (próg 10, kod
`SUSPICIOUS_LEVEL_JUMP`) — potwierdza, że skalowanie działa w obie strony. Przeglądarka: nowy
event zapisany przez formularz poprawnie oznaczony "AKTYWNY" w tabeli.

**Skrzynia per kraina z wybraną szansą** — druga część tej samej prośby — nie wymagała nowego
kodu: `ZonesAdminPage.tsx`'s "Dodatkowe dropy krainy" (Etap 6) już przyjmuje dowolny item,
włącznie z typem "chest" (Etap 10). Wystarczy w Itemy stworzyć przedmiot typu "Skrzynia" ze
skonfigurowaną zawartością, po czym dodać go w Krainy → Edytuj → "Dodatkowe dropy krainy" z
wybraną szansą (0-1).

## Zakładki postaci, uniwersalny filtr itemów, bonus eventowy z każdej krainy, rozbicie statystyk, miasto z NPC (Etap 17-21)

### Kontekst

Po Etapie 16 (eventy exp/złota) użytkownik poprosił o duży pakiet siedmiu powiązanych funkcji
naraz — rozbity na niezależnie wdrażalne etapy 17-24. Ten rozdział opisuje etapy 17-21;
22-24 (Kowadło, cooldown umiejętności/mikstury w czasie, taktyka walki przed starciem) są
opisane osobno po ich ukończeniu.

### Etap 17 — GamePage jako kontener zakładek

`GamePage.tsx` (dawniej jedna strona) rozbita na trzy zakładki przez `?tab=` w obrębie tej
samej trasy `/game/:characterId` (wzorem `AdminSettingsPage.tsx`, `TABS` = `character`/
`expeditions`/`anvil`) — bez nowych tras w `App.tsx`, bo appka nie ma warstwy `<Outlet>`.
Zawartość przeniesiona 1:1 do `pages/game/CharacterTab.tsx` i `pages/game/ExpeditionsTab.tsx`.

### Etap 18 — uniwersalny filtr wyboru itemu

`hooks/useItemPickerFilter.ts` (search/typ/klasa/`filtered`/`total`) +
`components/admin/ItemPickerFilterBar.tsx` (prezentacyjny pasek) — wydzielone z istniejącej
logiki `GrantAdminPage.tsx` i zastosowane też tam, gdzie filtra wcześniej brakowało:
`ItemsAdminPage.tsx` (materiały ulepszenia, zawartość skrzyni), `MonstersAdminPage.tsx` i
`ZonesAdminPage.tsx` (dropy).

### Etap 19 — globalny bonusowy drop z eventu

`GameEvent` += `bonusDropItemId String?`, `bonusDropChance Float? @default(0)` (addytywne).
Przy kilku aktywnych eventach z bonusowym dropem wygrywa ten o najwyższej szansie (ta sama
filozofia "bierz najlepszy, nie sumuj" co przy mnożnikach exp/złota — `getActiveEventMultipliers`
w `lib/gameEvents.ts` zwraca teraz też `bonusDrop: {itemId, dropChance} | null`).
`simulateExpedition` losuje ten drop dokładnie obok pętli po `zone.drops`, reużywając istniejący
event `"loot"` — zero zmian w kształcie `CombatEvent`. Dzięki temu event może dodać "eventową
skrzynkę" wypadającą z każdej krainy bez ręcznego dopisywania jej do każdej z osobna.

### Etap 20 — zakładka "Postać": rozbicie statystyk na źródło

`computeDerivedStatsBreakdown` w `combat.ts` — reimplementuje dokładnie te same formuły co
`computeDerivedStats`, ale zamiast jednej zblendowanej liczby per stat zwraca
`{base, equipment, passive, total}` (współdzielone helpery `sumEquip`/`sumPassive` gwarantują,
że `total` zawsze zgadza się z wynikiem `computeDerivedStats` dla tych samych wejść). Nowy
endpoint `GET /api/characters/:id/combat-stats/breakdown`, nowa tabela w `CharacterTab.tsx`.

### Etap 21 — zakładka "Ekspedycje", typ krainy "miasto", NPC-handlarz

`Zone` += `isTown Boolean @default(false)` (addytywne). Miasto to zwykły wiersz `Zone`, do
którego podróżuje się przez ten sam mechanizm co do każdej innej krainy (Etap 9) — nie osobny,
oderwany od reszty ekran. Nowe modele: `Npc {id, zoneId, name, kind String @default("merchant")}`,
`NpcShopItem {id, npcId, itemId, goldPrice Int, stock Int?}` (`stock: null` = nieograniczony
zapas).

**Backend**: `modules/admin/npcs` — CRUD wzorem `admin/zones` (zagnieżdżone `shopItems` przez
delete-then-recreate w transakcji). `admin/zones/service.ts`'s `zoneInclude` += `npcs`
(read-only stąd — NPC-e zarządzane osobno) i `isTown` w create/update. Nowy moduł `npcShop`:

- `GET /api/npc-shop/zone/:zoneId` (publiczny, `requireAuth`) — lista NPC z pełnym `shopItems`
  danej krainy; oddzielone od `admin/npcs`, bo `ZoneDto.npcs` (współdzielony przez panel admina
  i graczy) świadomie ujawnia graczom tylko `id/name/kind`, nie ceny/zapas per przedmiot.
- `POST /api/npc-shop/:characterId/buy` — `buyFromNpc()` w `npcShop/service.ts`: sprawdza że
  postać fizycznie stoi w krainie NPC (`character.currentZoneId === npc.zoneId`), sprawdza
  złoto/zapas, **atomowy `updateMany` guard** na `stock` (`WHERE stock >= quantity`) zanim
  ruszy transakcja odejmująca złoto (analogiczny `updateMany` guard w środku transakcji) +
  `addLootToInventory` (reużyta z `inventory/service.ts`); przy błędzie transakcji po
  zarezerwowaniu zapasu — zapas jest cofany.

**Frontend**: `ZonesAdminPage.tsx` — checkbox "Kraina typu miasto" (ukrywa sekcję potworów w
formularzu, gdy zaznaczony); nowy `NpcsAdminPage.tsx` (lista NPC filtrowana do krain
`isTown`) + zakładka "NPC" w `AdminSettingsPage.tsx`; nowy `NpcShopPanel.tsx` — w
`ExpeditionPanel.tsx`, gdy `currentZone.isTown`, zamiast przycisku "Walcz" pokazuje listę NPC z
towarem (przycisk "Kup" wyłączony przy braku złota/zapasu), z zachowaniem "Idź do innej
krainy"/"Wróć do wioski".

Zweryfikowane: curl — kraina `isTown:true` z NPC i towarem (`stock:2`), postać podróżuje tam,
dwa udane zakupy wyczerpują zapas (409 "Za mało towaru na stanie" przy trzecim), złoto i
ekwipunek poprawnie zaktualizowane (50→30, +2 do istniejącego stosu mikstur), próba zakupu
towaru droższego niż posiadane złoto → 409 "Za mało złota". Przeglądarka: postać w mieście
widzi panel NPC zamiast "Walcz", przycisk zakupu wyłączony przy niewystarczającym złocie (klik
nie wywołuje żądania), po obniżeniu ceny zakup przechodzi — złoto w nagłówku i panelu spada z
30 na 25, komunikat "Kupiono Mikstura Życia za 5 złota." się pojawia.

## Zakładka "Kowadło" — realna szansa powodzenia ulepszenia (Etap 22)

### Kontekst

Przycisk "Ulepsz" w panelu szczegółów przedmiotu był w 100% deterministyczny — ulepszenie zawsze
się udawało, o ile postać miała materiały. Użytkownik poprosił o zastąpienie go zakładką
"Kowadło" z **prawdziwą mechaniką ryzyka**: malejącą z poziomem szansą powodzenia, materiały
zawsze zużywane niezależnie od wyniku, bez niszczenia itemu przy porażce (na razie).

### Shared

`packages/shared/src/lib/upgradeSuccess.ts` — `defaultUpgradeSuccessChance(targetLevel)`:
krzywa `1 - ((targetLevel-1)/8)^1.5 * 0.9`, floor `MIN_UPGRADE_SUCCESS_CHANCE = 0.05`, anchored
na `MAX_UPGRADE_LEVEL = 9` (ten sam cap co `Item.maxUpgradeStats` "stats at +9"). Ta sama funkcja
jest importowana identycznie przez serwer (losowanie) i klienta (podgląd % przed kliknięciem) —
jedno źródło prawdy, zero ryzyka rozjazdu.

### Model danych

Nowy model `ItemUpgradeLevelConfig {id, itemId, targetLevel, successChance}` (addytywne) —
opcjonalne nadpisanie krzywej domyślnej dla konkretnej pary (item, poziom docelowy). Brak wiersza
dla danego poziomu = stosuje się `defaultUpgradeSuccessChance`. Przy okazji naprawiono
rozjazd między `schema.prisma` a `schema.production.prisma`: produkcyjny plik nie miał pola
zwrotnego `Item.npcShopEntries` dodanego w Etapie 21 (NpcShopItem→Item istniało, ale nie
Item→NpcShopItem), co złamałoby `prisma validate`/deploy na produkcji — wykryte i naprawione
przed pierwszym użyciem produkcyjnego pliku po Etapie 21.

### Backend

`inventory/service.ts`'s `upgradeItem` — po sprawdzeniu materiałów (bez zmian) losuje
`Math.random() < chance` **przed** transakcją (`chance` = `ItemUpgradeLevelConfig` dla
`(itemId, targetLevel)` albo `defaultUpgradeSuccessChance(targetLevel)`). Materiały są
konsumowane zawsze wewnątrz transakcji (pętla bez zmian); `upgradeLevel` ustawiane na
`targetLevel` **tylko przy sukcesie**. Zwraca `{success, newLevel, chance}` zamiast dawnego
`{newLevel}` — `newLevel` przy porażce to niezmieniony bieżący poziom. `admin/items/service.ts`
— `upgradeLevelConfigs` w `itemInclude` + create/update przez delete-then-recreate (wzorzec
identyczny jak `upgradeRequirements`/`chestLootEntries`).

### Frontend

Nowy `apps/web/src/pages/game/AnvilTab.tsx` — lista przedmiotów z ekwipunku/plecaka
ograniczona do typów wyposażalnych (broń/zbroja/hełm/buty/naszyjnik/kolczyki/pierścień;
materiały/questowe/skrzynie pominięte jako nieulepszalne), klik pokazuje: aktualny poziom →
docelowy, % szansy (z configu albo domyślnej krzywej — ta sama funkcja `@mmo/shared`),
wymagane materiały z porównaniem posiadane/potrzebne (czerwone gdy brakuje), przycisk "Ulepsz"
wyłączony przy braku materiałów. Po odpowiedzi z serwera wyświetla czytelny komunikat
sukcesu/porażki i odświeża zapytania `inventory`/`combat-stats`/`combat-stats-breakdown`.
Przycisk "Ulepsz" usunięty z panelu szczegółów przedmiotu w zakładce "Postać"
(`CharacterTab.tsx`) — zastąpiony odnośnikiem tekstowym do zakładki "Kowadło".
`ItemsAdminPage.tsx` — nowa sekcja "Nadpisanie szansy powodzenia" (poziom + szansa 0-1),
analogiczna do istniejącej sekcji materiałów.

Zweryfikowane: curl — override `successChance:0` dla poziomu docelowego → `{success:false,
newLevel:0}`, materiały i tak zużyte (4→2 sztuki); override `successChance:1` → `{success:true,
newLevel:1}`, materiały wyzerowane. Przeglądarka: zakładka Kowadło pokazuje poprawny % (96% dla
poziomu +2, zgodny z ręcznym przeliczeniem krzywej), przycisk wyłączony przy niewystarczających
materiałach (klik bez efektu), po uzupełnieniu materiałów klik kończy się komunikatem "Sukces!
Przedmiot ulepszony do +2." i panel automatycznie pokazuje kolejny poziom (+2→+3, 89%, 0/6).

## Wizualny cooldown umiejętności + mikstury lecznicze w czasie (Etap 23)

### Kontekst

Aktywne umiejętności miały tylko tekstowy wpis w logu walki, bez żadnego wskaźnika, kiedy znów
będą dostępne. Mikstury HP/MP leczyły całą wartość naraz w jednym evencie. Użytkownik poprosił o
graficzny wskaźnik cooldownu oraz o rozłożenie leczenia mikstur w czasie (np. "400hp w 5s") —
zaznaczając, że istniejący mały cooldown zapobiegający spamowi mikstur (`THRESHOLD_POTION_
COOLDOWN_SECONDS = 5`) już działa i nie wymaga zmian.

### Backend — leczenie rozłożone w czasie

`combat.ts`'s `tryConsumePotion` — dla `restore_hp`/`restore_mana`, jeśli item ma skonfigurowane
`potionDurationSec`, licząca wartość (`stats.maxHp * magnitudePct`) nie jest dodawana od razu:
zamiast tego ustawiany jest nowy stan rundowy `hpHotUntil`/`hpHotPerSecond` (analogicznie
`manaHotUntil`/`manaHotPerSecond`) — dokładnie ten sam wzorzec "do znacznika czasu", co istniejące
bufory `attackSpeedBuffUntil`/`attackSpeedBuffPct`. Każda runda (`ROUND_SECONDS`) dolicza
`hpHotPerSecond * ROUND_SECONDS` do HP, dopóki `t <= hpHotUntil`. Brak `potionDurationSec` (pole
opcjonalne) = stare zachowanie, natychmiastowe — pełna wsteczna kompatybilność, zero zmian dla
istniejących skonfigurowanych mikstur. `potionDurationSec` (pole `durationSeconds` w
`PotionConfigSchema`) było wcześniej opisane jako "tylko dla efektów buff_*" — teraz służy
podwójnie: dla `buff_*` to czas trwania buffa, dla `restore_hp`/`restore_mana` to czas rozłożenia
leczenia. `ItemsAdminPage.tsx` pokazuje to pole (z odpowiednią etykietą) dla obu grup efektów.

### Frontend — pasek cooldownu

Nowy `components/expedition/ActiveSkillCooldownBar.tsx` — dla każdej aktywnej, wykupionej
umiejętności klasy (`kind==="active"`, poziom > 0, ta sama definicja co
`gatherCombatBuild`'s filtr w `expeditions/service.ts`) przeszukuje już odsłonięte eventy wstecz
w poszukiwaniu ostatniego `skill_activated` o tej nazwie, liczy pozostały czas względem
`elapsedSeconds` (ten sam zegar symulacji, którego już używa reszta `ExpeditionPanel.tsx` do
odsłaniania eventów) i renderuje kwadrat z wypełnieniem rosnącym wraz z upływem cooldownu oraz
odliczaniem w sekundach (✓ gdy gotowa). Wpięty w `ExpeditionPanel.tsx` obok `PlayerVitalsBar`,
widoczny tylko w trakcie aktywnej walki.

Zweryfikowane: skrypt testowy wywołujący `simulateExpedition` bezpośrednio (poza HTTP) porównał
miksturę bez `durationSeconds` (natychmiastowy skok HP w tym samym evencie `potion_used`) z
identyczną miksturą z `durationSeconds: 9` — event `potion_used` zgłasza tę samą łączną wartość
`amount`, ale `playerHpAfter` w chwili zużycia pozostaje NIEZMIENIONE (bez natychmiastowego
skoku), a kolejne rundy pokazują HP utrzymujące się blisko poprzedniego poziomu zamiast dalej
spadać — potwierdza, że leczenie faktycznie rozkłada się w czasie zamiast być jednorazowym
skokiem. Przeglądarka: postać z wykupioną umiejętnością aktywną (cd 20s) w trakcie ekspedycji —
pasek cooldownu pokazuje odliczanie malejące w czasie rzeczywistym i poprawnie "odświeża się" do
nowego pełnego cooldownu, gdy w logu walki odsłoni się kolejne użycie tej samej umiejętności.

## Popup taktyki walki przed rozpoczęciem (Etap 24)

### Kontekst

Ostatni z pakietu funkcji z tej serii — obok wyboru potworów przed walką (Etap 9) użytkownik
poprosił o drugi krok: możliwość ustawienia **na tę jedną walkę**, od jakiego % HP ma się
uruchamiać mikstura lecznicza, oraz które aktywne umiejętności mają być użyte. Zastrzeżenie
użytkownika: to dodatkowa warstwa NA CZAS TEJ WALKI, nie zamiana bazowej konfiguracji potionu w
Itemach — admin nadal ustawia domyślny trigger/próg/efekt, gracz tylko podnosi próg i wyłącza
wybrane umiejętności dla jednego starcia.

### Shared

`BattleTacticsSchema {hpThresholdOverridePct?: number (0-1), disabledSkillIds: string[]}`,
dołączony jako opcjonalne pole `tactics` do `StartExpeditionSchema`. Backendowy
`modules/expeditions/routes.ts` przeszedł z lokalnie duplikowanego schematu na bezpośredni
import `StartExpeditionSchema` z `@mmo/shared`.

### Backend

`buildAndSimulate` (`expeditions/service.ts`) — po `gatherCombatBuild` (bez zmian, dalej
współdzielony z `/combat-stats`), lokalnie filtruje `activeSkills` (odrzuca id z
`disabledSkillIds`) i mapuje `potions` (nadpisuje `thresholdPct` tylko dla wpisów z
`trigger === "hp_below"`, gdy podano `hpThresholdOverridePct`) — **zanim** wywoła
`simulateExpedition`, która sama w sobie nie wie nic o "taktyce" i dostaje już przefiltrowane
tablice, dokładnie jak w planie. `startExpedition` przyjmuje `tactics` i przekazuje dalej.

### Frontend

Nowy `BattleTacticsModal.tsx` (wzorem `MonsterPickerModal.tsx`) — suwak 0-100% (aktywowany
checkboxem, domyślnie wyłączony = brak nadpisania) + lista checkboxów aktywnych, wykupionych
umiejętności (odznaczona = wyłączona na tę walkę). `ExpeditionPanel.tsx` — potwierdzenie
`MonsterPickerModal`'a nie startuje już ekspedycji od razu, tylko zapamiętuje wybrane potwory i
otwiera ten popup jako drugi krok; dopiero jego potwierdzenie wywołuje `startExpedition` z
pełnym payloadem (`selectedMonsterIds` + `tactics`). "Wstecz" wraca do wyboru potworów.

Zweryfikowane: curl — ta sama postać i kraina, dwa przebiegi: bez taktyki (bazowy próg mikstury
0.3, umiejętność aktywna) → mikstura uruchomiona pierwszy raz przy t=36, umiejętność użyta 3
razy; z taktyką (`hpThresholdOverridePct:0.95, disabledSkillIds:[<id umiejętności>]`) → **0**
użyć umiejętności (poprawnie wyłączona) i mikstura uruchomiona już przy **t=6** (próg podniesiony
działa poprawnie — wcześniejszy trigger). Przeglądarka: pełny flow Walcz → wybór potworów →
popup taktyki → suwak progu + odznaczenie umiejętności → walka w toku pokazuje pasek cooldownu
cały czas na "✓" (nigdy nie użyta) i log walki bez ani jednego wpisu tej umiejętności — zgodnie z
wyłączeniem.

## Flagged ekspedycja nie blokuje postaci + lista w panelu admina (Etap A post-24)

### Kontekst

Użytkownik zgłosił błąd na żywo: postać stojąca w krainie (UI w stanie bezczynnym) dostawała
"Postać walczy — najpierw zakończ lub opuść ekspedycję" przy próbie podróży. Przyczyna:
`character.activeExpeditionId` wskazywał na starą ekspedycję **wstrzymaną (`status: "flagged"`)**
przez anti-cheat (Etap 13), a `flagSuspiciousExpedition` nigdy nie czyściło tego wskaźnika — slot
ekspedycji postaci zostawał zajęty na zawsze, dopóki admin ręcznie nie rozwiązał **tej jednej**
ekspedycji. Po doprecyzowaniu przez użytkownika: flagowanie **nie może** zatrzymywać postaci —
gracz gra dalej normalnie, tylko ta jedna nagroda czeka na decyzję administracji.

### Backend

`expeditions/service.ts`:
- `flagSuspiciousExpedition` — po ustawieniu `status:"flagged"` **od razu** czyści
  `character.activeExpeditionId` atomowym `updateMany` (guard: tylko jeśli nadal wskazuje na tę
  właśnie ekspedycję). Postać jest wolna natychmiast, nie dopiero gdy admin zareaguje.
- `clearStaleActiveExpeditionPointer` (dodane wcześniej jako pierwsza warstwa naprawy) — zostaje
  jako ogólny mechanizm zabezpieczający na wypadek innych, nieprzewidzianych rozjazdów wskaźnika;
  traktuje teraz tylko `"in_progress"` jako ważny powód trzymania wskaźnika (flagged już nie).
- `getActiveExpedition` — wraca do zapytania tylko o `status:"in_progress"` (flagged nie zajmuje
  już slotu, więc przestaje być "aktywną ekspedycją" blokującą UI).
- Nowa `listFlaggedExpeditionsForCharacter` + `GET /api/expeditions/:characterId/flagged-count` —
  lekki, nieblokujący licznik dla gracza.
- `admin/expeditions/service.ts`'s nowa `listFlaggedExpeditions()` + `GET /api/admin/expeditions`
  — pełna lista wstrzymanych ekspedycji z nazwą postaci/krainy i podglądem nagrody, zamiast
  wymagania ręcznego wklejenia ID znalezionego w Logach.

### Frontend

`ExpeditionPanel.tsx` — usunięty branch pełnoekranowo blokujący UI dla `status==="flagged"`
(skoro taka ekspedycja już nie zajmuje slotu, `getActiveExpedition` zwraca `null` jak dla
zwykłej bezczynnej postaci). Zamiast tego osobne zapytanie o `flagged-count` renderuje mały,
**nieblokujący** baner nad normalnym UI (widoczny we wszystkich stanach panelu — bezczynność,
podróż, miasto, walka), informujący, że nagroda czeka na sprawdzenie.

`GrantAdminPage.tsx`'s sekcja "Zablokowane ekspedycje" — tabela (postać, kraina, kiedy, podgląd
nagrody exp/gold/loot, przyciski "Przyznaj mimo to"/"Odrzuć" per wiersz) zamiast wymagania
ręcznego ID; pole ręcznego ID zostaje jako zwinięty (`<details>`) fallback.

Zweryfikowane: curl — sztucznie oflagowana ekspedycja: `GET .../flagged-count` → `{count:1}`,
`GET .../active` → `null` (nie blokuje), `POST /api/travel/start` **przechodzi natychmiast**
(wcześniej 409 "Postać walczy"); `GET /api/admin/expeditions` listuje ją z nazwą postaci/krainy i
podglądem nagrody; po `resolve` znika z listy. Przeglądarka: panel Testowanie pokazuje tabelę z
poprawnymi danymi i działającymi przyciskami akcji.

## Ekspedycje i Kowadło w lewym menu (Etap B post-24)

### Kontekst

Użytkownik poprosił, żeby "Ekspedycje" i "Kowadło" przestały być zakładkami wewnątrz strony
postaci, a stały się osobnymi pozycjami w **lewym menu bocznym** (`AppShell`) — z zapowiedzią, że
zakładka Ekspedycje docelowo pokaże dodatkowe rzeczy zależne od krainy (bossy, kopalnie — poza
zakresem tej zmiany, tylko uzasadnienie architektoniczne). Kowadło ma być klikalne w menu tylko,
gdy postać stoi w krainie typu miasto.

### Implementacja

Bez nowych tras w `App.tsx` — `/game/:characterId` zostaje jedną trasą, `GamePage.tsx` nadal
przełącza treść po `?tab=` (mechanizm z Etapu 17 bez zmian, domyślnie `"character"`). Zmieniło
się tylko **skąd** można to nawigować — usunięty wizualny pasek zakładek w `GamePage.tsx`.

`AppShell.tsx` — nowy wewnętrzny `CharacterNavLinks`: woła `useParams<{characterId?:string}>()`
(działa transparentnie, bo `AppShell` renderuje się wewnątrz drzewa `GamePage`, które jest
elementem trasy `/game/:characterId`; na innych stronach `characterId` jest `undefined` i nic się
nie renderuje). Gdy obecny: `useQuery(["character", characterId], getCharacter)` +
`useQuery(["player-zones"], listPlayerZones)` — te same klucze co już używane w
`GamePage.tsx`/`ExpeditionPanel.tsx`, więc react-query dzieli cache (zero dodatkowych żądań
sieciowych w praktyce). Renderuje nagłówek z imieniem postaci, `NavLink` "Postać"/"Ekspedycje"
(zawsze aktywne), i "Kowadło" — `NavLink` gdy `currentZone?.isTown`, w przeciwnym razie
nieklikalny, wyszarzony wiersz z `title="Dostępne tylko w mieście"`. Dodane do współdzielonego
`SidebarContent` (już używanego zarówno w stałym sidebarze, jak i mobilnej szufladzie —
Etap 8.5), więc działa na obu bez dodatkowej pracy.

Zweryfikowane w przeglądarce: na `/characters` sekcja postaci nie pojawia się; po utworzeniu i
wejściu na postać sidebar pokazuje jej imię + "Postać"/"Ekspedycje" jako linki, "Kowadło" jako
wyszarzony, nieklikalny wiersz (kraina dzicz); po przeniesieniu postaci do testowej krainy typu
miasto "Kowadło" staje się klikalnym linkiem prowadzącym do `?tab=anvil`; kliknięcie
"Ekspedycje"/"Kowadło" poprawnie przełącza treść bez przeładowania strony.

## Kowadło — pełny ekwipunek + porównanie przed/po (Etap C post-24)

### Kontekst

Użytkownik poprosił, żeby Kowadło zamiast klikalnej listy przedmiotów wyglądało jak pełny
ekwipunek — przeciągamy item z ekwipunku na kowadło, a panel szczegółów pokazuje te same
informacje co popup w zakładce Postać, plus obok jakie staty będą **po** ulepszeniu.

### Implementacja

`AnvilTab.tsx` przepisany na wzór `CharacterTab.tsx`: `DndContext` + rząd slotów założonego
ekwipunku (`EquipSlotBox`, tylko źródło przeciągania/kliku) + siatka 4-zakładkowa
`GridSlot`×24 (filtrowana do `UPGRADABLE_TYPES` — potiony/materiały się tam nie pojawiają).
Nowy `AnvilSlotBox` (`components/inventory/AnvilSlotBox.tsx`) — jedyny realny cel upuszczenia
(`useDroppable({id:"anvil-slot", data:{type:"anvil"}})`); upuszczenie tam **lub** klik na
przedmiot w gridzie/slocie equip wywołują tę samą funkcję `selectItem`, więc oba sposoby
wyboru są w pełni równoważne. Wybrany przedmiot jest pomijany przy budowaniu
`byEquipSlot`/`byGridSlot` (żeby nie renderować tego samego `inventoryItemId` jako dwóch
draggable naraz w jednym `DndContext` — dnd-kit wymaga unikalnych id) i renderuje się
wyłącznie wewnątrz `AnvilSlotBox`, wizualnie "przeniesiony" na kowadło.

Panel szczegółów pokazuje dokładnie te same pola co popup w zakładce Postać (nazwa+poziom,
typ/poziom min/klasa, opis, staty) reużywając `interpolateUpgrade`/`STAT_LABELS`/
`formatStatValue`/`TYPE_LABELS`. Obok dodana kolumna "Po ulepszeniu (+N+1)" — te same klucze
statów przeliczone przez `interpolateUpgrade(item.baseStats, item.maxUpgradeStats,
upgradeLevel + 1)` + niezmienione `rolledStats`; zmienione wartości podświetlone na złoto.
Poniżej bez zmian: szansa powodzenia, lista wymaganych materiałów (posiadane/potrzebne),
przycisk "Ulepsz" (cała logika `upgradeMutation` z Etapu 22 bez zmian).

Blokada "tylko w mieście" na poziomie strony (nie tylko linku w sidebarze) — `zonesQuery` +
sprawdzenie `currentZone?.isTown`; gdy nieprawda, panel z komunikatem zamiast reszty UI.

Zweryfikowane w przeglądarce (postać `Mag` w testowej krainie-mieście, założona broń +
materiały nadane przez panel admina): zakładka Kowadło pokazuje założony ekwipunek + siatkę
4-zakładkową; klik na przedmiot (założony i z siatki) ustawia go jako wybrany na kowadle;
panel szczegółów pokazuje pełne informacje + kolumnę "Teraz (+0)"/"Po ulepszeniu (+1)" z
poprawnie przeliczonym atakiem (+31→+33); przycisk "Ulepsz" konsumuje materiały (2/2→0/4) i
podnosi poziom do +1, tabela i wymagania odświeżają się natychmiast (96% szansy na +2). Poza
miastem zakładka i link w sidebarze poprawnie pokazują blokadę zamiast UI. Rzeczywista
symulacja przeciągnięcia myszą (fizyczny drag) nie została w tej sesji zweryfikowana z
przyczyn środowiskowych (podgląd przeglądarki nie kompozytował klatek do zrzutów ekranu) —
`onDragEnd` woła identyczną funkcję `selectItem` co klik, a wzorzec `DndContext`/
`useDraggable`/`useDroppable` jest 1:1 tym już działającym w `CharacterTab.tsx`.

## Restyling wg szkicu "Fight Club" z Claude Design (post-C)

### Kontekst

Użytkownik przesłał wstępny szkic wizualny stworzony w Claude Design (projekt "Strona gry w
ciemnym stylu") i poprosił o wdrożenie jego stylu na ekranach gracza. Po pytaniu doprecyzowującym
zakres wybrano: nowa paleta/typografia + dopasowanie struktury kluczowych ekranów do szkicu
(nagłówek z awatarem/paskiem XP/walutą, sekcje w sidebarze, log walki w dwóch kolumnach, siatka
sklepu z filtrami), bez zmiany nawigacji/funkcji ani nowych podstron — wszystkie etapy 17-24/A-C
zostają funkcjonalnie identyczne.

### Zmiany

- **Design tokens** (`tailwind.config.js`, `index.css`, `index.html`): paleta przepisana na
  `oklch()` wprost ze szkicu (Tailwind przyjmuje dowolny poprawny string CSS jako wartość koloru,
  bez konwersji na hex), fonty Cinzel (nagłówki) + Inter (treść) doładowane z Google Fonts,
  `.panel` zaokrąglone (`border-radius`), dodane `@keyframes pulseGlow`/`flicker` (zarezerwowane
  pod przyszłe użycie, np. aktywne wyzwania).
- **`AppShell.tsx`**: nowy `CharacterHeaderBar` (avatar-inicjał, odznaka poziomu, pasek XP liczony
  czysto po stronie frontendu z `character.exp % 100` — krzywa poziomów jest płaska,
  `computeLevel()` w `apps/api/src/modules/expeditions/service.ts:32`, więc nie potrzeba nowego
  endpointu — i licznik złota) widoczny w sticky headerze nad całą stroną, nie tylko na mobile.
  Sidebar pogrupowany w sekcje z tytułami (linia + romb + uppercase label) i każdy `NavLink` z
  okrągłą odznaką-ikoną.
- **`LoginPage.tsx`**: karta 400px, ukośne tło w paski + radialny blask, nagłówek "FIGHT CLUB" w
  Cinzel — czysto kosmetyczne, logika formularza bez zmian.
- **`CharacterTab.tsx`**: sekcja założonego ekwipunku podzielona na trójkolumnowy układ (lewa
  kolumna slotów `helmet/armor/necklace/boots`, środkowy portret-placeholder z
  imieniem+klasą+poziomem — nowe `classQuery` przez `getPlayerClass`, prawa kolumna
  `weapon/ring/earrings`). Cała logika DnD/mutacji bez zmian.
- **`CombatLog.tsx`**: rozbity na dwie równoległe kolumny ("Aktywność gracza"/"Aktywność
  przeciwnika") z tego samego `events: CombatEvent[]` — bez zmian backendu. Numery rund liczone
  raz z pełnej listy zdarzeń (`Map<CombatEvent, number>`), współdzielone między kolumnami.
- **`NpcShopPanel.tsx`**: lista NPC-ów przełożona na siatkę kart przedmiotów (ikona w boksie z
  przekątnym wzorem tła, nazwa, cena ze złotą kropką, przycisk "Kup"/"Wyprzedane") zamiast
  pionowej listy tekstowej. Logika zakupu bez zmian.

Panele admina (`/admin/*`) świadomie poza zakresem — szkic dotyczy tylko ekranów gracza, panele
admina nie mają `AppShell` od Etapu 8.4.

Zweryfikowane w przeglądarce (curl do przygotowania testowej krainy-miasta z NPC + Prisma-script
do przenoszenia postaci): logowanie z nowym stylem karty; header z avatarem/poziomem/paskiem
XP/złotem po wejściu na postać; sidebar z sekcjami "Nawigacja"/"Postać"/"Admin"; zakładka Postać —
trójkolumnowy układ slotów wokół portretu; sklep NPC — siatka kart, zakup działający (złoto
5000→4950, zapas 10→9); pełna walka do śmierci — dwukolumnowy log poprawnie rozdzielił zdarzenia
gracza (rundy z zadanymi obrażeniami, HP) i przeciwnika (starcie, rundy z otrzymanymi obrażeniami,
HP wroga), odbiór nagród po śmierci zadziałał. `pnpm --filter web typecheck` czysto. Dane testowe
(krainę, NPC, postać) usunięto po weryfikacji.

## Osobna zakładka NPC (handel) + popup zakupu + masowa sprzedaż (post-restyling)

### Kontekst

Handlarz NPC był wciśnięty w zakładkę Ekspedycje, wyświetlał się nad kontrolkami podróży gdy
postać stała w mieście, a klik "Kup" kupował natychmiast 1 sztukę. Użytkownik poprosił o osobną
zakładkę **NPC** w lewym menu (aktywną tylko w mieście, wzorem gatingu "Kowadło"), z układem
dwukolumnowym — własny ekwipunek po lewej, towar NPC po prawej — i popupem zakupu: dla
przedmiotów stackowalnych wybór ilości, dla niestackowalnych proste potwierdzenie. Dodatkowo
(doprecyzowane w rozmowie) lewy panel ma zachować istniejące prawy-klik "Sprzedaj"
(`ItemContextMenu`) oraz dostać nową możliwość zaznaczenia kilku przedmiotów i sprzedania ich
naraz.

Backend już w pełni wspierał to, czego było trzeba — `buyFromNpc`
(`apps/api/src/modules/npcShop/service.ts`) przyjmował `quantity` od początku i poprawnie
rozgałęział się w `addLootToInventory` (`apps/api/src/modules/inventory/service.ts`) na
stackowalne (dopełnianie stosów) i niestackowalne (osobny wiersz + przetoczone staty na sztukę);
`sellItem` już obsługiwał pojedynczą sprzedaż. **Zero zmian backendu/schematu.**

### Zmiany

- `AppShell.tsx` — nowy wpis "NPC" w `CharacterNavLinks`, gated na `inTown` dokładnie tym samym
  wzorcem co "Kowadło" (real `NavLink` w mieście, wyszarzony `title="Dostępne tylko w mieście"`
  poza nim).
- `GamePage.tsx` — `TabKey` rozszerzony o `"npc"`, nowa gałąź renderująca `NpcTab`.
- Nowy `pages/game/NpcTab.tsx` — blokada "tylko w mieście" na poziomie strony (wzorem
  `AnvilTab.tsx`). W mieście: `DndContext` (bez realnej logiki przeciągania, wymagany tylko przez
  `GridSlot`/`ItemBox`) + `grid lg:grid-cols-2`. Lewa kolumna — siatka ekwipunku 1:1 z
  `CharacterTab.tsx` (4 zakładki, `ItemContextMenu` do Otwórz/Sprzedaj/Usuń bez zmian) plus nowy
  toggle "Zaznacz do sprzedaży": włączony zamienia klik na przełącznik zaznaczenia
  (`Set<string>`, wizualizowany reużytym propem `ItemBox`'s `selected`), pasek akcji liczy sumę
  `sellPrice × quantity` zaznaczonych i sprzedaje sekwencyjną pętlą `sellItem` per przedmiot
  (błędy pojedynczych pozycji — np. `sellPrice === 0` — zliczane osobno, reszta się sprzedaje).
  Prawa kolumna — siatka kart towaru NPC (przeniesiona z usuniętego `NpcShopPanel.tsx`,
  przełącznik pigułkowy między NPC gdy jest ich więcej niż jeden w mieście), klik na kartę
  otwiera popup zamiast kupować od razu.
- Nowy `components/expedition/BuyItemModal.tsx` — wzorem `MonsterPickerModal.tsx` (`fixed inset-0`
  + backdrop + `panel`). Dla `stackable: true` — stepper ilości ograniczony do
  `[1, stock ?? 999]` z przeliczaną sumą; dla `false` — sam tekst potwierdzenia. `onConfirm`
  woła `buyFromNpc(characterId, npcShopItemId, quantity)` (istniejące API, `quantity` już
  obsługiwane end-to-end).
- `components/expedition/NpcShopPanel.tsx` — usunięty (przeniesiony do `NpcTab.tsx`).
- `ExpeditionPanel.tsx` — gałąź `isTown` już nie renderuje handlarza, tylko krótki panel z nazwą
  miasta + odnośnik do zakładki NPC + `travelControls` (bez zmian w logice podróży).

Zweryfikowane w przeglądarce (testowa kraina-miasto z dwoma NPC — jeden ze stackowalnym towarem
`consumable`, jeden z niestackowalnym `weapon`): zakup stackowalnego ×4 poprawnie przeliczał sumę
w popupie i pomniejszył złoto/stan magazynowy o właściwą wielokrotność; zakup niestackowalnego
pokazał sam tekst potwierdzenia i dodał dokładnie 1 sztukę; tryb "Zaznacz do sprzedaży" zaznaczył
2 przedmioty (stackowalny + niesprzedawalny), poprawnie policzył sumę, sprzedaż zwróciła "Sprzedano
za 50 złota (1 nieudanych)" — dokładnie oczekiwany częściowy sukces; zakładka Ekspedycje w mieście
już nie pokazuje handlarza; poza miastem sidebar pokazuje "NPC" wyszarzone, a bezpośredni URL
zakładki pokazuje blokadę. `pnpm --filter web typecheck` czysto. Dane testowe usunięto po
weryfikacji.

## Powrót z ekspedycji "donikąd" + zawieszony licznik + masowa sprzedaż 0 złota (post-NPC-tab)

### Kontekst

Użytkownik zgłosił, że stojąc w dzikiej krainie i klikając "Wróć do wioski", po odliczeniu czasu
trzeba było kliknąć jeszcze raz, żeby faktycznie znaleźć się w mieście — bo przycisk celował w
`destinationZoneId: null`, czyli w **wirtualną "wioskę"** sprzed Etapu 21 (`currentZoneId ===
null`), a nie w żadną realną krainę typu miasto. Skoro `isTown` sprawdzane jest wszędzie przez
`zones.find(z => z.id === character.currentZoneId)`, wylądowanie na `null` nigdy nie liczyło się
jako bycie w mieście — NPC/Kowadło były i tak niedostępne, trzeba było ręcznie wybrać prawdziwe
miasto z listy krain. Osobno zgłoszono, że po samym odliczeniu ("W drodze… 0:00") panel nie
odświeżał się automatycznie — wymagał ręcznej nawigacji. Dodatkowo w nowej zakładce NPC masowa
sprzedaż zwracała "Sprzedano za 0 złota (N nieudanych)" i przedmioty nie znikały — bo tryb
zaznaczania pozwalał zaznaczyć też przedmioty z `sellPrice === 0`, które `sellItem` odrzuca.

### Zmiany

- `ExpeditionPanel.tsx` — przycisk (przemianowany z "Wróć do wioski" na "Wróć do miasta") celuje
  teraz w `zones.find(z => z.isTown)?.id` zamiast w `null`; ukryty gdy postać już stoi w mieście,
  wyszarzony z tooltipem "Brak skonfigurowanego miasta" gdy żadna kraina nie ma `isTown: true`.
  Zero zmian backendu — `startTravel` już przyjmował dowolny `destinationZoneId` i poprawnie liczy
  czas jako sumę `travelTimeSeconds` obu krain (Etap 9), więc to czysto frontendowa zmiana celu.
- `ExpeditionPanel.tsx` — jednorazowy `invalidateQueries` przy przekroczeniu `travelArrivesAt`
  mógł przegrać wyścig z zegarem serwera (`resolveTravelArrival` porównuje `travelArrivesAt` z
  serwerowym `Date.now()` — przy niewielkim rozjeździe zegara klient/serwer na produkcyjnym VPS
  jeden refetch mógł nic nie zmienić, a że efekt odpalał się tylko raz, nic już nie ponawiało
  próby). Naprawione przez utrzymanie tickowania `now` przez cały czas `isTraveling` (nie tylko
  do `travelReady`) i dopisanie `now` do zależności efektu invalidującego — odpytuje serwer co
  sekundę, aż ten faktycznie potwierdzi przybycie, zamiast próbować raz.
- `NpcTab.tsx` — `toggleSelected` odrzuca teraz przedmioty z `item.item.sellPrice <= 0` (ten sam
  warunek co `canSell` w `ItemContextMenu`), pokazując komunikat zamiast dodawać je po cichu do
  zaznaczenia; podpowiedź nad siatką doprecyzowana ("…przedmioty z wartością sprzedaży").

Zweryfikowane w przeglądarce (testowa kraina-miasto): stojąc w dzikiej krainie, klik "Wróć do
miasta" pokazał poprawną nazwę celu (nie "wioski"), a po odliczeniu panel **bez żadnego
dodatkowego kliknięcia** przełączył się na widok miasta (NPC-hint) i sidebar odblokował
Kowadło/NPC; próba zaznaczenia niesprzedawalnego przedmiotu w trybie masowej sprzedaży pokazała
komunikat i nie weszła do zaznaczenia, a sprzedaż jedynego zaznaczonego (sprzedawalnego)
przedmiotu zwróciła pełny sukces ("Sprzedano za 25 złota", bez "nieudanych") i usunęła go z
ekwipunku. `pnpm --filter web typecheck` czysto. Dane testowe usunięto po weryfikacji.

## Polish pass po restylingu — całą ścieżkę gracza (post-fixes)

### Kontekst

Po serii poprawek funkcjonalnych zlecono `/impeccable polish` na całej ścieżce gracza (Login →
Postacie → Postać/Ekspedycje/Kowadło/NPC + AppShell), poprzedzone `/impeccable init`
(`apps/web/PRODUCT.md`) i `/impeccable document` (`apps/web/DESIGN.md` + sidecar
`.impeccable/design.json` — wyekstrahowane wprost z tokenów i komponentów tej sesji). Przegląd
skatalogował konkretny dryf między restylowanymi (Etap "Restyling…") a nieodwiedzonymi jeszcze
ekranami/komponentami, zamiast zgadywać.

### Znaleziska i poprawki

- **Emoji jako pseudo-ikony w logu walki** — `CombatLog.tsx`/`ActiveSkillCooldownBar.tsx`
  używały unicode-emoji (⚔️🗡️🛡️💢✨🧪☠️⏱️✅, "✓") tam, gdzie reszta gry (`ItemTypeIcon.tsx`,
  `MonsterEncounterPanel.tsx`, `LootBar.tsx`) już rysuje własne, spójne ikony SVG (viewBox 24,
  `strokeWidth 1.4`, zaokrąglone zakończenia). Nowy `components/expedition/CombatIcon.tsx` —
  9 glifów w tej samej konwencji (dwa z nich dosłownie reużywają ścieżki `weapon`/`consumable`
  z `ItemTypeIcon`), podłączone w miejsce emoji.
- **RegisterPage.tsx zostało sprzed restylingu** — ekran bliźniaczy do `LoginPage.tsx` w tym
  samym flow (logowanie ↔ rejestracja) nadal miał stary wygląd (zwykły `panel`, brak
  ukośnego tła/Cinzel/gradientowego przycisku) — użytkownik odbijający się między tymi dwoma
  ekranami trafiał na wizualny zgrzyt. Przepisane 1:1 na wzór `LoginPage.tsx`.
- **Niedokończone zaokrąglenie przycisków** — dryf udokumentowany już w `DESIGN.md`
  (`rounded-md` jako standard) domknięty w `CharactersPage.tsx`, `CharacterTab.tsx`,
  `ExpeditionPanel.tsx`, `AnvilTab.tsx`, `MonsterPickerModal.tsx`, `BattleTacticsModal.tsx`,
  `StatsPanel.tsx`/`SkillsPanel.tsx`, `UpdateBanner.tsx`, `BuyItemModal.tsx` (ten ostatni —
  świeży plik z tej sesji, przeoczony przy pierwszym pisaniu).
- **Przeglądarkowe elementy domyślne bez motywu** — zaznaczenie tekstu, scrollbar i pierścień
  fokusu renderowały się w kolorach systemowych zamiast palety gry. `index.css`: `::selection`
  (gold/ink), `::-webkit-scrollbar` + `scrollbar-color` (line-soft na panel, gold na hover),
  `:focus-visible` na linkach/przyciskach/checkboxach/radio/range (gold-bright, 2px) — celowo
  **nie** na polach tekstowych, które już mają własny fokus przez zmianę koloru obwódki
  (`border-gold`), żeby nie dublować efektu. `accent-color: gold` globalnie plus jawne
  `accent-gold` na checkboxach/range w `BattleTacticsModal.tsx`.

Panele admina świadomie poza zakresem (jak w `DESIGN.md` — szkic i ten polish dotyczą tylko
ekranów gracza).

Zweryfikowane w przeglądarce na desktopie i mobile (375px): Login/Register (parytet wizualny),
tworzenie postaci, pełna walka do śmierci z nowymi ikonami logu (bez błędów konsoli, 14 SVG na
stronie), Kowadło i NPC w testowym mieście, chowany panel boczny na mobile (bez przepełnienia
poziomego na żadnym sprawdzonym ekranie). `pnpm --filter web typecheck` czysto. Dane testowe
usunięto po weryfikacji.

## Ikony nawigacji + osobna zakładka Ekwipunek + kategoria "Miasto" + restyling kowalstwa

### Kontekst

Użytkownik dostarczył w `Tymczasowe/rpg_menu_design/` zestaw okrągłych, złotych ikon-medalionów i
mockup HTML docelowego wyglądu paska nawigacyjnego, plus zrzut ekranu ornamentowego UI kowalstwa
(lista receptur / szczegóły / materiały) jako wzór stylu dla ekwipunku i Kowadła. Chciał trzech
powiązanych zmian: prawdziwe ikony zamiast kolorowych kropek w `NavIcon`, wydzielenie ekwipunku z
zakładki "Postać" do własnej zakładki, oraz nową kategorię "Miasto" grupującą Kowadło i NPC
(zamiast płaskich pozycji pod "Postać"). Z dostarczonych 22 plików ikon 6 (itemshop/poczta/
przyjaciele/pulpit/targ/wyzwania, wszystkie 64×64px/669B) okazały się uszkodzonymi placeholderami —
i tak nie odpowiadały żadnej funkcji istniejącej w grze (generyczny szablon mockupu). Pozostałe
(204–600px, prawdziwa grafika) pokryły dokładnie potrzebne pozycje.

### Zmiany

- Ikony przeskalowane do jednolitego rozmiaru (96×96px, ~22–24KB/szt., wcześniej do 500KB przy
  600×600px) i skopiowane do `apps/web/public/icons/nav/{postacie,postac,ekwipunek,ekspedycje,
  kowadlo,npc}.png` (przez `sharp-cli` via `npx`, jednorazowo — nie dodano jako zależność).
- `AppShell.tsx` — nowy `NavIconImg` (obrazek 32px w okrągłej ramce, `border-gold`+poświata gdy
  aktywny, `opacity-50 grayscale` gdy niedostępny poza miastem) obok istniejącego `NavIcon`
  (kropka, zostawiony tylko dla Ustawienia/Logi — bez dedykowanej grafiki). `CharacterNavLinks`
  przebudowany na dwie sekcje: "Postać" (Postać → **Ekwipunek** nowy → Ekspedycje) i nowa
  "Miasto" (Kowadło, NPC — dokładnie ten sam wzorzec `inTown` gate co wcześniej, tylko pod nowym
  nagłówkiem sekcji).
- `GamePage.tsx` — `TabKey` rozszerzony o `"equipment"`, nowa gałąź renderująca `EquipmentTab`.
- Nowy `pages/game/EquipmentTab.tsx` — 1:1 wydzielony z `CharacterTab.tsx`: cały blok ekwipunku
  (sloty equip, portret postaci, aktywne sloty potionów, siatka 4×24, panel szczegółów,
  `ItemContextMenu`), wraz z `invalidateInventoryAndCombatStats` (equip/unequip nadal unieważnia
  `combat-stats`/`combat-stats-breakdown`, które czyta teraz osobna zakładka "Postać" — sprzężenie
  działa automatycznie przez współdzielony klucz cache react-query, bez propsów).
- `CharacterTab.tsx` okrojony do `VitalsPanel`/`StatsPanel`/`SkillsPanel` + tabeli rozbicia statów
  bojowych — bez ekwipunku.
- Restyling socketów (`ItemBox.tsx`, `GridSlot.tsx`, `EquipSlotBox.tsx`, `ActiveItemSlotBox.tsx`,
  `AnvilSlotBox.tsx`) — wzmocniona wewnętrzna poświata (`shadow-[inset_...]`) na spoczynku i
  jaśniejsza złota poświata + obwódka przy przeciąganiu/zaznaczeniu; kwadratowy, bez zaokrąglenia
  kształt sockera (Socket-vs-Surface Rule z `DESIGN.md`) pozostał bez zmian — to jedna zmiana
  współdzielona przez zakładki Ekwipunek/Kowadło/NPC naraz.
- `AnvilTab.tsx` — panel szczegółów wybranego przedmiotu dostał dużą ikonę w okrągłej złotej
  ramce (jedyne miejsce poza nawigacją z okrągłą ramką — pojedynczy "bohaterski" podgląd, nie
  siatka), nazwę w Cinzel/uppercase, listę materiałów z ikoną + ułamkiem posiadane/wymagane
  (czerwone tło/tekst przy braku), i przycisk "Ulepsz przedmiot" jako pełnej szerokości wypełniony
  przycisk.
- `NpcTab.tsx` — karty towaru NPC dostały spójną złotą ramkę wokół ikony (ten sam język co
  `ItemBox`) i delikatną poświatę na hover; bez zmian strukturalnych.

Zweryfikowane w przeglądarce (nowa postać + tymczasowa testowa kraina-miasto z NPC, dane usunięte
po weryfikacji): sidebar pokazuje prawdziwe ikony (nie kropki) i sekcję "Miasto" z Kowadło/NPC
wyszarzonymi poza miastem i aktywnymi w mieście; zakładka "Postać" nie pokazuje już ekwipunku;
nowa zakładka "Ekwipunek" renderuje pełny ekwipunek+inwentarz (sloty, aktywne itemy, siatka,
panel szczegółów); Kowadło pokazuje nowy panel z dużą ikoną w złotej ramce i czytelną listą
materiałów; NPC pokazuje odświeżone karty towaru i otwiera `BuyItemModal` poprawnie. `pnpm
--filter web typecheck` czysto.

**Poprawka po dalszym feedbacku użytkownika** — screenshot pokazał kwadratowe ramki wokół
Postać/Ekwipunek/Ekspedycje/Kowadło/NPC jednocześnie (nie tylko wokół aktywnej). Przyczyna:
wszystkie te linki żyją pod tym samym pathname `/game/:characterId`, różniąc się tylko `?tab=`, a
`NavLink`'s domyślne `isActive` dopasowuje wyłącznie pathname — więc wszystkie zapalały się razem.
Naprawione nowym `TabNavLink` w `AppShell.tsx`, który liczy aktywność ręcznie przez
`useSearchParams().get("tab")` zamiast polegać na wbudowanym dopasowaniu `NavLink`. Przy okazji
`navLinkClass` zamieniony z pełnego `border` (czytanego jako "kwadratowa ramka") na
`border-l-2` — subtelny lewy pasek koloru tylko dla aktywnej zakładki, zero ramki dla
pozostałych (tak jak "Postacie", które nigdy jej nie miało).

Użytkownik przesłał też własny plik `border_corner.svg` jako przykład stylu, ale poprosił o
**własną** grafikę zamiast dosłownego reużycia jego assetu na obu rogach. Nowy
`components/inventory/SocketCorners.tsx` — mały, ręcznie narysowany narożnik (ta sama konwencja
`viewBox 0 0 20 20`, `stroke="currentColor"` co `ItemTypeIcon.tsx`/`CombatIcon.tsx`, plus
kwadracik obrócony o 45° nawiązujący do już istniejącego diamentowego markera w `SectionTitle`),
doklejony do `GridSlot`/`EquipSlotBox`/`ActiveItemSlotBox`/`AnvilSlotBox` (ten ostatni w
większym rozmiarze, 14px zamiast 10px). Zweryfikowane w przeglądarce: dokładnie jeden link
aktywny naraz przy przełączaniu zakładek, każda kratka ekwipunku renderuje 2 SVG narożnika bez
błędów konsoli. `pnpm --filter web typecheck` czysto.

## Siatka 5×7, przebudowa Kowadła na 3 kolumny, koszt ulepszenia w złocie, 2-kratkowe bronie/zbroje

### Kontekst

Użytkownik zgłosił pięć powiązanych zmian w ekwipunku i Kowadle: siatka ekwipunku miała 6
kolumn/4 wiersze — zmienić na 5×7; sekcja "kowadło" (miejsce, w które ląduje wybrany przedmiot)
miała być po prawej stronie razem ze szczegółami, a "Założony ekwipunek" w osobnej ramce
całkowicie po lewej; wymagane materiały ulepszenia miały pokazywać ikonę konkretnego itemu, nie
generyczny placeholder; ulepszanie nie miało żadnego kosztu w złocie — każdy poziom każdego
itemu musi mieć ustalony (rosnący z poziomem) koszt; a broń i zbroja miały zajmować 2 kratki w
siatce. To ostatnie wymagało prawdziwej mechaniki multi-slot (nie tylko wizualnej sztuczki) —
backend musiał zacząć egzekwować kolizje/umieszczanie względem "śladu" zajmowanego przez item, bo
`InventoryItem.slotIndex` to wciąż pojedyncza liczba (jeden wiersz DB = jeden przedmiot = jedna
"główna" kratka; druga kratka szerokiego itemu nie ma własnego wiersza).

### Zmiany

- **Geometria siatki** — nowe stałe współdzielone przez klienta i serwer:
  `packages/shared/src/schemas/inventory.ts`'s `INVENTORY_GRID_COLS` (5), `INVENTORY_GRID_ROWS`
  (7), `INVENTORY_GRID_SLOTS_PER_TAB` (35) oraz `inventoryOccupiedRange(slotIndex, width)` —
  zwraca listę zajętych komórek dla danej szerokości, `null` gdy umieszczenie wychodziłoby poza
  wiersz. Backend i frontend importują te same stałe/funkcję, żeby walidacja i renderowanie nigdy
  się nie rozjechały.
- **`Item.gridWidth Int @default(1)`** (Prisma, additive) — ile kratek poziomo zajmuje item
  odłożony w ekwipunku. `packages/shared`'s `CreateItemSchema` + panel `/admin/items` (nowe pole
  liczbowe) + `seed-zones.ts` (broń/zbroja tworzone od razu z `gridWidth: 2`). Istniejące w bazie
  itemy typu weapon/armor donastawione jednorazowym skryptem
  `prisma/scripts/set-weapon-armor-grid-width.ts` (dopisany do `deploy.sh`, idempotentny —
  aktualizuje tylko wiersze wciąż na domyślnym `gridWidth=1`, bezpieczny na produkcji).
- **Backend `inventory/service.ts`** — `moveItem` liczy teraz pełny zakres docelowych komórek
  przez `inventoryOccupiedRange` i porównuje go z zakresami WSZYSTKICH innych przedmiotów w
  siatce (rozszerzonymi o ich własny `gridWidth` — druga kratka szerokiego itemu nie ma wiersza w
  DB, więc kolizję trzeba liczyć w locie); klasyczna zamiana miejscami działa tylko dla pary
  1-kratka/1-kratka, każdy inny częściowy nakład jest odrzucany (409 "Docelowe miejsce jest
  zajęte"). `findNextFreeSlotIndex`/`addLootToInventory` (loot, skrzynie, przedmioty startowe,
  zakupy NPC — wszystkie przez wspólny `addLootToInventory`) analogicznie szukają pierwszej
  pozycji, której pełny zakres jest wolny i nie wychodzi poza wiersz.
- **Frontend `lib/inventoryGrid.ts`** (nowy) — `layoutGridTab()` układa jedną stronę siatki:
  rozwija każdy przedmiot do jego `gridWidth`, pomija komórki już "skonsumowane" przez
  poprzedzający szeroki item. `GridSlot`/`ItemBox` dostały prop `width`/`wide` (2-kratkowy item =
  `col-span-2` + `w-[7.5rem]` zamiast `w-14`). Użyte identycznie w `EquipmentTab.tsx`,
  `AnvilTab.tsx`, `NpcTab.tsx` (wszystkie trzy muszą się zgadzać co do geometrii, bo renderują tę
  samą przestrzeń `slotIndex` tej samej postaci).
- **`AnvilTab.tsx` — przebudowa na 3 kolumny**: lewa — nowa, osobna ramka "Założony ekwipunek"
  (paperdoll 2×3 jak w `EquipmentTab.tsx`, bez portretu); środkowa — siatka do wyboru materiału/
  przedmiotu (bez zmian funkcjonalnych, tylko 5×7); prawa — `AnvilSlotBox` przeniesiony tu z
  lewej kolumny + panel szczegółów. Wymagane materiały renderują teraz `ItemTypeIcon` dla
  faktycznego typu itemu (`itemFor(r.requiredItemId)?.type`, wcześniej zahardkodowane
  `"material"`).
- **Koszt ulepszenia w złocie** — `ItemUpgradeLevelConfig.goldCost Int?` (Prisma, nullable —
  `null` = użyj wspólnej rosnącej krzywej domyślnej, dokładnie ten sam wzorzec co istniejące
  `successChance`/`defaultUpgradeSuccessChance`). Nowa `defaultUpgradeGoldCost(targetLevel)` w
  `packages/shared/src/lib/upgradeSuccess.ts` (`round(100 * poziom^1.6)` — tania na niskich
  poziomach, gwałtownie droższa bliżej +9, tak jak szansa powodzenia gwałtownie maleje). Panel
  `/admin/items`'s edytor nadpisań poziomów dostał trzecie pole (puste = domyślny koszt).
  `upgradeItem` w `inventory/service.ts` sprawdza `owner.gold >= goldCost` (409 przy braku),
  potrąca złoto w tej samej transakcji co materiały. **Przy porażce przedmiot jest teraz
  całkowicie niszczony** (`tx.inventoryItem.delete`), nie tylko "zostaje bez zmian" jak wcześniej
  — złoto i materiały i tak przepadają przy każdej próbie, sukces czy porażka.
- Poprawka przy okazji: komunikat wyniku (`resultMessage`/`error`) w `AnvilTab.tsx` był
  renderowany wewnątrz bloku `{selected && ...}` — po zniszczeniu przedmiotu `selected` staje się
  `null` i komunikat "przedmiot został zniszczony" nigdy by się nie pokazał. Przeniesiony poza ten
  blok.

Zweryfikowane w przeglądarce (nowa postać klasy Wojownik + ręcznie przyznana broń/zbroja/materiał
+ tymczasowa krainy-miasto, dane usunięte po weryfikacji): siatka Ekwipunku ma 5 kolumn (33
wyrenderowane komórki na 35 dla dwóch 2-kratkowych itemów — zgodne z matematyką), broń i zbroja
renderują się jako `col-span-2` o szerokości 120px; Kowadło pokazuje 3 kolumny z "Założony
ekwipunek" w osobnej ramce po lewej i kowadłem po prawej; wybranie broni pokazuje koszt (100g dla
poziomu 1, zgodnie ze wzorem), szansę (100%), i materiał z ikoną (dokładnie 1 SVG w wierszu);
udane ulepszenie poprawnie potrąciło złoto i podniosło poziom; wymuszona (nadpisanie
`successChance=0`) próba na kolejnym poziomie potrąciła złoto, **usunęła przedmiot z ekwipunku**,
i poprawnie pokazała komunikat porażki. `pnpm -r typecheck` czysto (shared/api/web).

## Publiczny profil postaci + Znajomi + Ranking

### Kontekst

Użytkownik przesłał zrzut profilu postaci z innej gry (styl "Ninjago") jako inspirację i poprosił
o: (1) publiczny profil każdej postaci, (2) Znajomych z zapraszaniem innych kont, (3) Ranking
wszystkich postaci z podziałem na klasy. Zbadałem model danych i część mechanik ze zrzutu **nie
istnieje w tej grze** — nie zostały dodane, żeby nie rozszerzać zakresu poza prośbę: atak
magiczny/obrona magiczna/szybkość zaklęcia (wszystkie klasy dzielą jeden `attack`), bonusy
"silny przeciwko [typ]" (Monster nie ma rasy/typu), "zabite rare"/"zabite bossy"/"zniszczone
metiny" (Monster nie ma flagi rzadkości/bossa, "metin" to pojęcie z Metin2 którego tu nie ma).
Profil pokazuje więc 8 realnie liczonych statystyk pochodnych, "X / 7 slotów założonych" (prawdziwa
liczba slotów, nie 9 ze zrzutu), i liczniki ograniczone do zabitych potworów i otwartych skrzyń.

### Zmiany

- **Prisma (addytywnie)** — `User.lastSeenAt DateTime?`; `Character.monstersKilled`/
  `chestsOpened Int @default(0)`; nowy `FriendRequest` (self-relacja na `User`, dwie nazwane
  relacje `FriendRequestsSent`/`FriendRequestsReceived` — wzorem `Character.currentZone`/
  `travelDestinationZone`), `status: pending|accepted|declined` — "znajomy" to wiersz
  `accepted`, sprawdzany z dowolnej strony.
- **Obecność online** (`lib/authGuard.ts`'s `requireAuth`) — fire-and-forget (bez `await`, błędy
  ignorowane) `prisma.user.update({ lastSeenAt: new Date() })` przy każdym uwierzytelnionym
  żądaniu. Nowy `lib/presence.ts`'s `isOnline(lastSeenAt)` — online = świeże w ciągu 5 minut,
  reużywane przez profile/friends/ranking.
- **Liczniki życiowe** — `monstersKilled` inkrementowany o `result.monstersDefeated` w
  `expeditions/service.ts`'s `applyExpeditionReward` (wspólny punkt dla claim i leave_early);
  `chestsOpened` inkrementowany w `inventory/service.ts`'s `openChest`.
- **Nowy moduł `modules/profile`** — `GET /api/profile/:characterId`, dostępny dla każdego
  zalogowanego (nie tylko właściciela, w przeciwieństwie do `getCharacter`) — Ranking/Znajomi
  muszą linkować do cudzych profili. `gatherCombatBuild` w `expeditions/service.ts` zmienione z
  prywatnej na eksportowaną funkcję i reużyte bezpośrednio (z `computeDerivedStats`) zamiast
  duplikować logikę budowania staty. Bonusy z ekwipunku liczone przez zsumowanie
  `equipmentStats: StatBlock[]` per klucz statystyki.
- **Nowy moduł `modules/friends`** — `POST /request` (rozwiązanie nazwy postaci → właściciel;
  jeśli druga strona już zaprosiła nas, automatyczna akceptacja zamiast duplikatu),
  `POST /:id/accept|decline`, `DELETE /requests/:id` (anuluj wysłane), `DELETE /:userId` (usuń
  znajomego), `GET /` (znajomi + przychodzące + wychodzące, każdy z reprezentatywną postacią —
  najwyższy poziom danego konta). `packages/shared`'s `SendFriendRequestSchema`.
- **Nowy moduł `modules/ranking`** — `GET /api/ranking?classId=`, dostępny dla każdego gracza
  (nie tylko admina, w przeciwieństwie do `admin/characters`), bez pól prywatnych (bez
  email/gold), sortowany po poziomie/exp.
- **Frontend** — `lib/{profileApi,friendsApi,rankingApi}.ts` (wzorem `npcShopApi.ts`);
  `pages/{ProfilePage,FriendsPage,RankingPage}.tsx`, każda owinięta w `AppShell`, poza systemem
  zakładek `GamePage` (profil musi być oglądalny dla cudzej postaci); nowe trasy `/profile/
  :characterId`, `/friends`, `/ranking` w `App.tsx`. `AppShell.tsx` — "Znajomi"/"Ranking" w
  sekcji "Nawigacja" (poziom konta, zawsze widoczne), "Profil" w sekcji "Postać" (link do
  własnego profilu, `/profile/${characterId}`, zwykły `NavLink` a nie `TabNavLink` — bo to inna
  ścieżka, nie `?tab=`). Dwie nowe ikony nawigacji (`znajomi.png`, `PVP.png` → `ranking.png`)
  przeskalowane tą samą metodą co poprzednie (`sharp-cli` do 96×96px). Żadne nowe tło bordowe —
  wszystko w istniejącym ciemnym motywie `panel`/`ink`.

Zweryfikowane: w przeglądarce — nowa postać widzi poprawny status Online, "0 / 7 slotów
założonych", statystyki pochodne zgodne z tabelą rozbicia w zakładce Postać, sidebar pokazuje
Znajomi/Ranking/Profil. Pełny cykl znajomych zweryfikowany przez curl na dwóch niezależnych
kontach (przeglądarkowe zakładki współdzielą ten sam localStorage/sesję, więc do testu
dwukontowego trzeba dwóch niezależnych tokenów): wysłanie zaproszenia, widoczność po obu stronach
(incoming/outgoing), akceptacja, obecność na liście znajomych obu kont z poprawnym `online`,
usunięcie znajomego. Ranking i profil zweryfikowane przez curl dla różnych kont (profil cudzej
postaci wczytuje się bez błędu własności). `pnpm -r typecheck` czysto. Dane testowe (4 konta, 4
postacie) usunięte po weryfikacji.

## Nowa krzywa poziomów — exp w milionach (post-profil)

`computeLevel()` używał płaskiej krzywej placeholder (`floor(exp/100)+1` — każdy poziom kosztował
dokładnie 100 exp, level 40 = 3900 exp). Użytkownik zgłosił, że to zbyt mało — level 40 powinien
wymagać milionów exp. Zastąpiono sześcienną krzywą w nowym `packages/shared/src/lib/leveling.ts`:

- `expForLevel(level) = round(100 * (level-1)^3)` — level 1 = 0 exp (jak dotychczas), level 10 ≈
  72,9k, level 40 ≈ 5,93 mln, level 70 ≈ 32,85 mln, level 99 ≈ 94,1 mln (wybrane wśród trzech
  wariantów zaproponowanych użytkownikowi, jako środkowa opcja "100 × poziom³").
- `computeLevel(totalExp)` odwraca powyższe (cbrt + korekta zaokrągleń) — jedyne miejsce liczące
  poziom z exp, reużywane przez `expeditions/service.ts` (re-eksportowane stamtąd, więc
  `admin/expeditions` i `admin/characters` nie zmieniły importów) i front (`AppShell.tsx`).
- `expRewardForLevel(level)` — ile exp powinien dawać pojedynczy "on-level" potwór, wyliczane
  wprost z krzywej: `(expForLevel(level+1) - expForLevel(level)) / KILLS_PER_LEVEL` (stała
  `KILLS_PER_LEVEL = 25`), zamiast osobno dobieranej liczby. Zastąpiło to
  `expReward = round(hp * 0.21)` w `seed-zones.ts` — rebalans krzywej automatycznie rebalansuje
  też nagrody z potworów, bez ręcznego przeliczania.

**Anti-cheat (`checkRewardPlausibility`, dawniej próg `MAX_LEVELS_PER_EXPEDITION`)**: stary próg
"ile poziomów zdobyto w jednej ekspedycji" miał sens tylko przy płaskiej krzywej (każdy poziom = ta
sama porcja exp). Przy krzywej sześciennej całkowicie traci sens — blisko poziomu 1 zdobycie kilku
poziomów z niewielkiego exp jest normalne, blisko poziomu 90 nawet mocno zawyżona nagroda może nie
dobić do jednego poziomu, czyli próg nigdy by tam nie zadziałał. Nowa logika patrzy na **exp na
zabitego potwora** (curve-independent): flaguje, gdy średnie exp/potwór przekracza
`expRewardForLevel(character.level + 15) * mnożnik eventu * 1.5` — czyli więcej niż realnie mógłby
dać najmocniejszy potwór ze szczytu strefy (strefy mają szerokość 10 poziomów), z zapasem. To też
wyjaśnia zgłoszony wcześniej fałszywy alarm (1051 exp / 8 potworów ≈ 131 exp/potwór, pasujące do
zawartości poziomu ~30-35) — pod starym progiem "10 poziomów/ekspedycję" tak duży skok exp blisko
niskiego poziomu bywał niesłusznie łapany; nowy próg patrzy tylko na samo exp/potwór, nie na to, ile
poziomów to akurat dało.

**Przeliczenie istniejących postaci**: `Character.level` to pole zapisane w bazie, nie liczone na
żywo — jednorazowy skrypt `apps/api/prisma/scripts/recompute-character-levels.ts` przelicza
`level = computeLevel(exp)` dla każdej postaci (exp, złoto, wydane/niewydane punkty statów
NIETKNIĘTE — nie da się sensownie "cofnąć" już wydanych punktów, więc pozostają jak były). Levele
spadły drastycznie (np. 3957 exp: level 40 → level 4) — to świadomy wybór użytkownika ("przelicz
uczciwie") spośród dwóch opcji zaproponowanych w pytaniu doprecyzowującym.

Przy okazji naprawiono preexistujący bug w `seed-zones.ts`'s `clearTier()` (blokował ponowny
reseed krain FK-em na `ClassStarterItem`/`ChestLoot`/`GameEvent.bonusDropItemId` — te relacje
zostały dodane już po napisaniu tej funkcji i nie były czyszczone przed usunięciem itemu).

Zweryfikowane: `pnpm -r typecheck` czysto (wymaga zbudowania `packages/shared` — `tsc -p
tsconfig.json` — bo `apps/api`/`apps/web` konsumują `dist/`, nie źródła). `seed-zones.ts`
uruchomiony ponownie na czysto (10 krain, poprawne `expReward` per poziom, np. level 1 = 4 exp,
level 99 = 116,4k exp). Skrypt przeliczenia poziomów uruchomiony na `dev.db` (3 z 5 postaci
zmieniły poziom, reszta już była poziom 1 / 0 exp). W przeglądarce: nowa testowa postać (poziom 1,
pasek exp 0%) → nadanie 10 000 exp przez panel admina → poprawnie "awansowała o 4 poz. (teraz poz.
5)", pasek exp w `AppShell` pokazuje ~59% (zgodnie z wyliczeniem: (10000-6400)/(12500-6400)).
Postać testowa usunięta po weryfikacji.

**Świadomie poza zakresem tej zmiany**: pełny system łowisk/kopalni (nowe typy przedmiotów wędka/
kilof/przynęta, mechanika połowu/wydobycia z dwoma niezależnymi oknami czasowymi, przełącznik
"można wrócić do krainy powyżej poziomu") — to osobna, duża funkcja omówiona z użytkownikiem, ale
jeszcze nie zaplanowana ani zaimplementowana.

## System zbieractwa — łowiska i kopalnie (post-krzywa-exp)

Nowa mechanika farmienia poza walką, na wzór wzorca `isTown`/`Npc` (opcjonalna funkcja krainy —
zero lub jeden wiersz na `Zone`, więc jeden mechanizm pokrywa zarówno "łowisko w istniejącej
krainie" jak i "kraina wyłącznie z łowiskiem" bez przypisanych potworów).

**Schemat** (`FishingSpot`/`FishingDrop`, `Mine`/`MiningDrop`, oba `zoneId @unique`; nowy
`GatherSession` — jedna aktywna sesja na postać, `characterId @unique`, mirror
`Character.activeExpeditionId`; `Zone.allowRevisitAboveLevel Boolean` — pozwala wejść do krainy
mimo przekroczenia `maxLevel`, nie omija `minLevel`; `Item` += `gatherSpeedBonusPctMax`/
`gatherChanceBonusPctMax` (tylko `rod`/`pickaxe`, wartość PRZY +9, interpolowana liniowo od 0 przy
+0) i `baitChanceBonusPct` (tylko `bait`)). Nowe typy `ItemTypeSchema`: `rod`, `pickaxe`, `bait` —
rod/pickaxe dostały własne sloty ekwipunku (jak weapon/armor), bait siedzi w aktywnym slocie jak
potion, ale **nie jest zużywany** (`setActiveSlot` dopuszcza `consumable`||`bait`; `gatherCombatBuild`
już filtrował `type === "consumable"` więc bait automatycznie nie wchodzi do symulacji walki).

**Pętla zbieractwa (`modules/gathering/service.ts`) — świadomie NIE wzorem ekspedycji.**
Ekspedycje pre-rollują cały wieloetapowy timeline z góry (potrzebują scrubowalnego logu walki +
częściowej nagrody przy wcześniejszym wyjściu) — pojedynczy połów/wydobycie to tylko jeden losowy
czas + jeden rzut, więc wzorem jest `lib/travelResolution.ts`: jeden zapisany `phaseEndsAt`,
leniwie rozwiązywany przy najbliższym odczycie (`getActiveGathering`), bez pollingu/crona.
`GatherSession.phase`: `catching` (łowienie, auto-loop — po złowieniu od razu losuje kolejną fazę,
spójnie z tym że ekspedycje też walczą z wieloma potworami bez klikania) albo `extracting`/
`searching` (kopanie — dwie NIEZALEŻNIE losowane fazy na cykl, potwierdzone explicite przez
użytkownika: wydobycie przyspiesza kilof, szukanie złoża **zawsze** losowe, kilof go nie
przyspiesza). Nagroda przyznawana natychmiast po rozwiązaniu każdej fazy (nie batch na końcu jak
w ekspedycjach) — więc `stopGathering` to zwykłe usunięcie sesji, bez logiki "częściowej nagrody".

**Zabezpieczenie przed nieograniczonym doganianiem AFK**: nowy klucz Settings
`gathering.settings` z `maxCyclesPerResolve` (domyślnie 100) — pętla leniwego rozwiązywania w
`resolveGatherSession` liczy cykle; jeśli limit padnie zanim dogoni `now`, sesja jest automatycznie
usuwana (`logAction` z `action: "auto_stopped_cap"`) i gracz musi zacząć od nowa. Nic nie ginie —
każda faza już wypłaciła nagrodę w momencie rozwiązania.

**Naprawiony przy okazji pre-istniejący bug w `inventory/service.ts`'s `findNextFreeSlotIndex`**:
funkcja wykluczała założone/aktywne itemy z listy "zajętych" slotów przy szukaniu wolnego miejsca
na łup — ale `equipItem`/`setActiveSlot` nie przenoszą/nie czyszczą `slotIndex` (item zostaje na
starym miejscu w tabeli, tylko dostaje `equippedSlot`/`activeSlotIndex`), więc DB-owy unique
constraint `(characterId, slotIndex)` i tak wymaga tego miejsca jako zajętego. Ujawniło się to od
razu przy pierwszym pełnym teście łowienia (postać z założoną wędką + kilkanaście złowionych ryb
pod rząd trafiło w `P2002 Unique constraint failed`) — bug jest ogólny (dotyczy każdego źródła
lootu: ekspedycji, skrzyń), po prostu rzadziej wcześniej wywoływany tyle razy pod rząd. Poprawka:
`findNextFreeSlotIndex` liczy WSZYSTKIE wiersze postaci jako zajęte, nie tylko te bez
`equippedSlot`/`activeSlotIndex`.

Nowe moduły backendu: `modules/gathering` (gracz: start/active/stop pod `/api/gathering`),
`modules/admin/fishingSpots`, `modules/admin/mines` (CRUD, walidacja że kraina nie ma już
przypisanego łowiska/kopalni przed uderzeniem w `@unique`). Frontend: `GatheringPanel.tsx`
(wzorem `ExpeditionPanel.tsx` — jeden fetch + lokalny tick co sekundę + `invalidateQueries` po
przekroczeniu `phaseEndsAt`, bez `refetchInterval`), niebieski pasek postępu wydzielony do
reużywalnego `components/common/ProgressBar.tsx` (z prywatnego `VitalBar` w
`PlayerVitalsBar.tsx`), nowa zakładka admina "Zbieractwo" (pod-zakładki Łowiska/Kopalnie, mirror
`NpcsAdminPage.tsx`), checkbox `allowRevisitAboveLevel` w `ZonesAdminPage.tsx` obok `isTown`, nowe
panele warunkowe rod/pickaxe/bait w `ItemsAdminPage.tsx` (mirror sekcji potionu).

Zweryfikowane: `pnpm -r typecheck` czysto. Curlem end-to-end: item `rod` z bonusami, łowisko z
gwarantowanym dropem, start/active/stop, auto-pętla catch-up (67 cykli po odtworzeniu okna po
awarii — potwierdza że limit `maxCyclesPerResolve=100` działa i timeline liczy się poprawnie od
`phaseEndsAt`, nie od `now`), stackowanie łupu z overflow na drugi slot. Kopalnia: przejście
`extracting → searching → extracting` z poprawnym rozróżnieniem przyspieszanej/nieprzyspieszanej
fazy. W przeglądarce: panel admina (checkbox, listy Łowiska/Kopalnie, panele itemów) i panel
gracza (przycisk zablokowany bez odpowiedniego narzędzia, auto-pętla z rosnącym licznikiem, pasek
postępu, "Zatrzymaj") potwierdzone na żywo. Dane testowe (postać, 4 itemy, łowisko, kopalnia)
usunięte po weryfikacji.

## Poprawki ekwipunku/ekspedycji + zakładka Umiejętności pasywnych (post-zbieractwo)

**Trzy niezależne bugi znalezione i naprawione przy okazji zgłoszeń użytkownika:**

- `equipItem`/`setActiveSlot` (`inventory/service.ts`) przy podmianie zawartości slotu ustawiały
  poprzedniemu przedmiotowi `equippedSlot`/`activeSlotIndex: null`, ale nie nadawały mu realnego
  `slotIndex` w gridzie — przedmiot stawał się jednocześnie niewidoczny w lalce I w plecaku
  (`equippedSlot: null` ORAZ `slotIndex: null`). Poprawka: przed nadpisaniem slotu, poprzedni
  zajmujący go item dostaje `findNextFreeSlotIndex`-owy wolny slot w gridzie. Zweryfikowane na
  żywo (equip drugiej broni → pierwsza poprawnie wraca do plecaka) i w bazie.
- `addLootToInventory` przy pełnym plecaku rzucała wyjątek, który wywalał całą transakcję nagrody
  z ekspedycji/zbieractwa — exp, złoto i cała reszta łupu przepadały, a ekspedycja i tak zostawała
  oznaczona jako `claimed` (idempotency-guard flip następuje PRZED transakcją nagrody). Nowy tryb
  `allowPartial` (domyślnie wyłączony — `openChest`/kupno u NPC/admin-grant zachowują atomowe
  niepowodzenie całości, co jest tam pożądane) przyznaje ile się zmieści i zwraca `overflow`;
  `applyExpeditionReward` i `gathering/service.ts` włączają ten tryb i (dla ekspedycji) pokazują
  graczowi `overflowLoot` w oknie z nagrodą.
- Profil postaci liczył "X / 10 SLOTÓW ZAŁOŻONYCH" wliczając wędkę/kilof do tej samej puli co
  broń/zbroję/hełm itd., mimo że `EquipmentTab` pokazuje narzędzia zbieractwa jako osobną sekcję
  ("Narzędzia zbieractwa") oddzieloną od głównej lalki — myląco dawało np. "7/10" zamiast "7/8".
  `profile/service.ts` liczy teraz tylko 8 tradycyjnych slotów gearu (`CORE_EQUIP_SLOTS =
  EquipSlotSchema.options` minus `rod`/`pickaxe`).

**URL profilu po nazwie postaci**: `/profile/:characterId` → `/profile/:nazwa-postaci` —
`Character.name` jest już `@unique` w schemacie, więc żaden nowy constraint nie był potrzebny,
tylko zmiana lookupu w `profile/service.ts` (`where: { name }` zamiast `where: { id }`) i
`encodeURIComponent` przy budowaniu linków we wszystkich miejscach (`AppShell`, `RankingPage`,
`FriendsPage`).

**Nowa zakładka "Umiejętności"** — dwie pod-zakładki, oddzielny system niż `ClassSkill`
(klasowe, kosztują punkty za poziom, mechanika combat-only):

- **"Umiejętności postaci"** — istniejący `SkillsPanel` przeniesiony tu z `CharacterTab` (który
  wraca do 2-kolumnowego gridu `VitalsPanel`+`StatsPanel`), bez zmian w logice.
- **"Umiejętności pasywne"** — nowy koncept: umiejętności całej postaci (nie klasy), które NIE
  kosztują punktów — rosną wyłącznie przez czytanie przedmiotu typu `book` (prawy klik → "Przeczytaj",
  zużywa 1 sztukę, rzuca `Math.random() < item.bookSuccessChance`, sukces = `CharacterPassiveSkill.level
  += 1`, blokowane po osiągnięciu `maxLevel` żeby nie marnować książki). Nowe modele
  `PassiveSkillType` (katalog admina: nazwa, opis, `maxLevel`, opcjonalny `gatherKind` +
  `chanceBonusPerLevel`/`speedBonusPerLevel`) i `CharacterPassiveSkill` (poziom per postać).
  Umiejętność z ustawionym `gatherKind` realnie wpływa na grę: `gathering/service.ts`'s
  `getPassiveSkillGatherBonus` sumuje `level × bonusPerLevel` po wszystkich pasujących
  umiejętnościach i dolicza do bonusu łowienia/kopania **addytywnie z bonusem narzędzia**
  (`getEquippedToolBonuses` zwraca teraz też `toolInventoryItemId`, żeby przy okazji dało się
  zinkrementować licznik narzędzia bez dodatkowego zapytania — patrz niżej).

**Dodatkowy licznik ulepszenia wędki/kilofa**: `InventoryItem.gatherSuccessCount` — inkrementowany
w `gathering/service.ts`'s `resolveOnePhase` przy każdym udanym połowie/wydobyciu TYM konkretnym
egzemplarzem narzędzia. `upgradeItem` (`inventory/service.ts`) dla `type === "rod"|"pickaxe"`
blokuje ulepszenie dopóki licznik nie osiągnie `gathering.settings.successesPerToolUpgrade`
(nowe pole ustawień, domyślnie 100, konfigurowalne w panelu admina razem z resztą progów
zbieractwa) i zeruje licznik po udanym ulepszeniu. Frontend: `AnvilTab.tsx` — rod/pickaxe były
dotąd całkowicie wykluczone z `UPGRADABLE_TYPES` (nie dało się ich w ogóle wybrać na kowadle) i
lalka kowadła nie miała dla nich gniazd — dodane analogicznie do wcześniejszej poprawki w
`EquipmentTab` (osobna sekcja "Narzędzia zbieractwa"), plus licznik i blokada przycisku "Ulepsz
przedmiot" gdy `gatherSuccessCount` poniżej progu. `ItemTooltip`/`ItemBox` pokazują "Udane
zbiórki: X/Y" dla rod/pickaxe wszędzie gdzie się pojawiają (ekwipunek, kowadło).

Nowy typ `ItemTypeSchema`: `book` (świadomie osobny typ, nie wariant `consumable` jak potiony —
potwierdzone z użytkownikiem). Nowe moduły backendu: `modules/passiveSkills` (gracz: `GET
/api/passive-skills/:characterId`, `POST .../read-book`), `modules/admin/passiveSkills` (CRUD
`PassiveSkillType`). Nowa strona admina `PassiveSkillsAdminPage.tsx` (mirror `EventsAdminPage.tsx`),
nowy warunkowy panel w `ItemsAdminPage.tsx` dla `type === "book"` (wybór `PassiveSkillType` +
szansa powodzenia), ikona `book` w `ItemTypeIcon.tsx`.

Zweryfikowane: `pnpm -r typecheck`+`build` czysto. Skryptem przez `readBook` bezpośrednio: poziom
umiejętności 0→2 po dwóch udanych czytaniach, stos książki 3→1. W przeglądarce: obie pod-zakładki
Umiejętności renderują się poprawnie, `CharacterTab` z 2 panelami, panel admina tworzy
`PassiveSkillType`, prawy klik na książce w ekwipunku → "Przeczytaj" → komunikat "Przeczytano
książkę — Górnictwo: poziom 1!", poziom widoczny w panelu pasywnym z paskiem postępu. Naprawa
equip-swap zweryfikowana osobno (equip drugiej broni, pierwsza wraca do plecaka, potwierdzone w
bazie). Licznik narzędzia na kowadle zweryfikowany tylko przeglądem kodu — brak krainy-miasta w
lokalnym dev.db uniemożliwił żywy test (ta sama, wcześniej już zaakceptowana granica środowiska
co przy weryfikacji Kowadła w Etapie zbieractwa). Dane testowe (umiejętność, książka, przedmioty)
usunięte po weryfikacji.

**Itemy czasowe (osobisty mnożnik exp/złoto/łup) + system poleceń + ustawienia konta** — trzy
niepowiązane funkcje w jednym przebiegu:

- **Itemy czasowe**: nowy `potionTrigger: "on_use"` (zużycie natychmiastowe na decyzję gracza, bez
  progu/interwału jak `hp_below`/`mana_below`/`interval`) i trzy nowe `PotionEffect`:
  `buff_exp`/`buff_gold`/`buff_drop`. Celowo NIE wpięte w istniejące 6 fizycznych aktywnych slotów
  (te są zarezerwowane pod obecność-podczas-walki) — zamiast tego osobna akcja "Użyj" w menu
  kontekstowym (`ItemContextMenu`'s `canUse`/`onUse`, mirror `canRead`/`onRead` z książek),
  `inventory/service.ts`'s `useBuffItem` zużywa 1 sztukę i nadpisuje
  `Character.<effect>BuffMultiplier`/`<effect>BuffUntil` (`multiplier = 1 + potionMagnitudePct`,
  `until = now + potionDurationSec`; nowy item tego samego efektu NADPISUJE poprzedni, bez
  sumowania). `lib/personalBuffs.ts`'s `getActivePersonalBuffMultipliers(character)` czyta te pola
  bez dodatkowego zapytania (character i tak jest już załadowany) i zwraca `1` gdy wygasłe/nigdy
  nieustawione. `expeditions/service.ts`'s `buildAndSimulate` MNOŻY (nie zastępuje) event×personal
  dla exp/gold przed wywołaniem `simulateExpedition` — połączona wartość trafia do
  `Expedition.appliedExpMultiplier` jak dotąd, więc anti-cheat (`checkRewardPlausibility`) skaluje
  się poprawnie bez zmian. Drop: nowy parametr `dropChanceMultiplier` w `simulateExpedition`
  (mnoży wszystkie 3 miejsca rzutu w `combat.ts`, capped `Math.min(1, ...)`) i w
  `gathering/service.ts`'s `rollDrops` (mnoży `dropChance + chanceBonusPct`, liczone raz na
  początku `resolveGatherSession` jak pozostałe bonusy). Frontend: `ActiveBuffsBar.tsx` (nowy) —
  do 3 pigułek z żywym odliczaniem mm:ss (lokalny `setInterval` co sekundę), zamontowany w
  `AppShell`'s `CharacterHeaderBar` (współdzieli już istniejące zapytanie `["character",
  characterId]`, więc widoczny na każdej zakładce, nie tylko Ekwipunku). `ItemsAdminPage.tsx` nie
  wymagał żadnych zmian — selecty triggera/efektu już czytają wprost z `PotionTriggerSchema
  .options`/`PotionEffectSchema.options`, a pola `magnitudePct`/`durationSeconds` już renderują się
  dla każdego efektu `buff_*` (gating `effect.startsWith("buff_")` sprzed tego zadania).
- **System poleceń**: `User.referralCode` jest **nullable** (`String? @unique`, BEZ
  `@default(cuid())`) — celowo, żeby uniknąć resetu dev.db: kolumna wymagana+unikalna z
  domyślną wartością generowaną po stronie klienta Prisma nie da się dopisać do istniejącej
  tabeli z danymi jednym `db push` (SQLite nie potrafi wypełnić istniejących wierszy per-wiersz
  unikalną wartością). Zamiast tego kod generuje kod jawnie: nowe konta dostają go przy
  rejestracji (`accountRoutes`/`account/service.ts`'s `getAccountSettings` → `ensureReferralCode`,
  wywoływane leniwie przy pierwszym wejściu w Ustawienia konta — `crypto.randomBytes(5).toString
  ("hex")`, retry przy kolizji). Nowy model `Referral` (`referrerId`/`referredId`/`rewardedAt` —
  null dopóki nagroda nieczekana). `RegisterSchema.referralCode` (opcjonalne) — nieznany/zwrotny
  na siebie kod jest CICHO ignorowany (literówka nie blokuje rejestracji). Nagroda skonfigurowana
  w `referral.settings` (`rewardKind: none|gold|item`, `target: referrer|referred|both`,
  `requiredLevel`) przez `lib/referralRewards.ts`'s `tryPayReferralReward(characterId)` —
  wywoływane (a) po utworzeniu PIERWSZEJ postaci konta (rejestracja sama nie tworzy postaci, więc
  "poziom 1 od razu" sprawdza się dopiero tutaj, w `characters/service.ts`'s `createCharacter`),
  (b) przy każdym awansie poziomu w `expeditions/service.ts`'s `applyExpeditionReward`. Nagroda dla
  "polecającego" trafia do jego PIERWSZEJ założonej postaci (`orderBy createdAt asc` — złoto jest
  polem postaci, nie konta, więc trzeba wybrać którąś). Panel admina: nowa zakładka "Polecenia" w
  `AdminSettingsPage.tsx` → `ReferralAdminPage.tsx`, `GET`/`PUT /api/admin/settings/referral-settings`.
- **Ustawienia konta**: nowa strona `/account` (`AccountSettingsPage.tsx`, poza systemem zakładek
  gry — dotyczy konta, nie postaci) z 4 sekcjami: link poleceń (kod+URL+kopiuj+statystyki), zmiana
  widoczności online (`User.hideOnlineStatus`, zagatowane w `profile/service.ts` I
  `friends/service.ts` — ukrywa zarówno `online` JAK I surowy `lastSeenAt`, nie tylko flagę), zmiana
  hasła, usunięcie konta. `POST /api/auth/change-password` i `/request-deletion` odwołują WSZYSTKIE
  odświeżacze sesji (`revokeAllRefreshTokensForUser`, nowe w `lib/refreshToken.ts`) i czyszczą
  cookie — frontend wymusza wylogowanie i przekierowuje na `/login` z komunikatem (nowy wzorzec:
  `navigate("/login", {state:{message}})`, czytany w `LoginPage.tsx` przez `useLocation()`).
  Usunięcie konta jest leniwe (RODO-styl, 30 dni karencji) — `User.deletionRequestedAt` ustawiany
  przy żądaniu, żadnego crona: `loginUser`/`refreshSession` w `auth/service.ts` sprawdzają przy
  KAŻDYM logowaniu/odświeżeniu, czy `deletionRequestedAt` jest starsze niż 30 dni — jeśli tak,
  `prisma.user.delete()` (kaskady już obsługują `RefreshToken`/`Character`/`FriendRequest`) i błąd
  zamiast zalogowania; jeśli ustawione ale świeższe, logowanie i tak się udaje (użytkownik musi
  móc się zalogować, żeby zobaczyć ekran cofnięcia), a `AuthUser.deletionRequestedAt` (nowe pole,
  płynie przez `/me`, login/register/refresh) daje frontendowi sygnał. `ProtectedRoute.tsx`
  renderuje blokujący `DeletionPendingScreen` zamiast dzieci gdy pole ustawione — "Cofnij usunięcie"
  aktualizuje lokalny stan auth przez `setSession` (bez przeładowania strony), "Wyloguj" kończy
  sesję. `RegisterPage.tsx` czyta `?ref=KOD` z URL (`useSearchParams`) i wstępnie wypełnia (wciąż
  edytowalne) pole "Kod polecający".

Zweryfikowane: `pnpm -r typecheck`+`build` czysto (shared/api/web). Backend skryptami bezpośrednio
przez funkcje serwisowe (bez HTTP): `useBuffItem` — multiplier/until poprawne, stos zużyty
2→1, odrzucenie dla itemu bez `on_use`; pełny cykl referral — rejestracja z kodem tworzy
`Referral`, brak wypłaty przed pierwszą postacią, wypłata dokładnie przy tworzeniu pierwszej
postaci polecającego (gold +500 u obu stron, zgodnie z `target: both`, `requiredLevel: 1`);
zmiana hasła (stare hasło odrzucone, nowe działa), żądanie/cofnięcie usunięcia, symulacja
usunięcia po 31 dniach (kolejne logowanie faktycznie usuwa wiersz `User` z bazy i zwraca błąd),
`hideOnlineStatus` ukrywa `online`+`lastSeenAt` w publicznym profilu. W przeglądarce: prawdziwy
item `on_use`/`buff_exp` utworzony przez formularz `/admin/items` (potwierdzone, że selecty
triggera/efektu faktycznie zawierają `on_use`/`buff_exp`/`buff_gold`/`buff_drop`), przyznany
graczowi, prawy klik → "Użyj" → toast "Użyto: +100% exp przez 2 min!", item zniknął z ekwipunku,
pigułka "EXP x2 jeszcze przez 1:53" z żywym odliczaniem w nagłówku; `/account` renderuje 4 sekcje
z poprawnym `GET /api/account` (200); modal usunięcia konta pokazuje błąd "Nieprawidłowe hasło"
dla złego hasła; link "Ustawienia konta" na własnym profilu; panel admina "Polecenia" zapisuje
(`PUT` 200) i odczytuje ustawienia. Dane testowe (testowy item, ustawienia poleceń) usunięte po
weryfikacji.

**Licznik X.XXs + awans umiejętności pasywnej powiązanej ze zbieractwem z XP + bramka
książkowa** — trzy powiązane poprawki do łowienia/kopania:

- **Licznik czasu**: `GatheringPanel.tsx` tickował dotąd co 1s tylko po to, żeby przesuwać pasek
  %, bez żadnej liczby na ekranie. Tick przyspieszony do 100ms i obok etykiety fazy
  ("Łowi rybę…") dopisany dokładny odliczający czas `(X.XXs)` — `Math.max(0, (phaseEndsAt -
  now) / 1000).toFixed(2)`.
- **Nowy tor awansu XP dla umiejętności powiązanych ze zbieractwem**: dotąd `CharacterPassiveSkill`
  rosło WYŁĄCZNIE przez czytanie książek (`readBook`'s `Math.random() < bookSuccessChance`) — bez
  żadnego pola XP. Teraz `PassiveSkillType` z ustawionym `gatherKind` ma płaską krzywą
  (`xpPerLevel`, stała ilość XP na każdy poziom) i przyznaje `xpPerGatherAction` XP za KAŻDĄ próbę
  zbieractwa (nie tylko udaną — potwierdzone z użytkownikiem), niezależnie od tego, czy coś
  faktycznie złowiono/wydobyto. Nowa `passiveSkills/service.ts`'s `grantGatherXp(tx, characterId,
  gatherKind)` — wywoływana wewnątrz `gathering/service.ts`'s `resolveOnePhase` na fazie
  "catching" (rybactwo) i "extracting" (górnictwo, NIE "searching" — to wędrówka, nie próba
  wydobycia) — dolicza XP i auto-awansuje w pętli, aż poziom osiągnie próg XP LUB (jeśli
  skonfigurowana) bramkę książkową. Transakcja w `resolveOnePhase` otwiera się teraz ZAWSZE (nie
  tylko przy udanym połowie jak dotąd) właśnie po to, żeby XP naliczało się na każdą próbę;
  przyznanie łupu/`gatherSuccessCount` zostaje warunkowe jak wcześniej, wewnątrz tej samej
  transakcji.
- **Bramka książkowa**: nowe `PassiveSkillType.bookGateFromLevel` (nullable — brak = czysty awans
  za XP na zawsze) i `booksRequiredPerLevel`. Gdy poziom DOCELOWY (`currentLevel + 1`) osiąga tę
  granicę, samo zebranie pełnego XP już nie awansuje automatycznie — `readBook` (przeprojektowany
  dla umiejętności z `gatherKind`) wymaga dodatkowo `booksRequiredPerLevel` udanych odczytów
  (każdy nadal rzuca istniejące `bookSuccessChance` — książka może się "zmarnować", zgodnie z
  potwierdzeniem od użytkownika), zanim poziom faktycznie wzrośnie. Nowe pole
  `CharacterPassiveSkill.pendingBooksRead` liczy postęp w stronę bramki na bieżącym poziomie
  (zeruje się po awansie). `readBook` blokuje z jasnym komunikatem PRZED zużyciem książki, jeśli:
  (a) bramka jeszcze nieaktywna na tym poziomie ("rośnie z doświadczenia... książka nie jest
  jeszcze potrzebna"), albo (b) bramka aktywna, ale XP jeszcze niepełne ("zbierz najpierw pełne
  doświadczenie X/Y"). Zwraca teraz też jawne pole `leveledUp` (osobne od `success` — udany odczyt
  książki może tylko przybliżyć do bramki bez realnego awansu), żeby frontend nie musiał zgadywać
  z porównania poziomów. Umiejętności BEZ `gatherKind` (gdyby kiedyś powstały) zachowują dokładnie
  stary tok — nie mają żadnego źródła XP.
- Panel gracza (`PassiveSkillsPanel.tsx`) pokazuje osobny pasek "XP do następnego poziomu" dla
  umiejętności z `gatherKind` oraz — gdy bramka aktywna i XP pełne — komunikat "Gotowe do awansu —
  przeczytaj jeszcze N książek (X/Y)". Panel admina (`PassiveSkillsAdminPage.tsx`) dostał 4 nowe
  kontrolowane pola (`xpPerLevel`, `xpPerGatherAction`, `bookGateFromLevel`,
  `booksRequiredPerLevel`), zgatowane jak istniejące pola bonusów (`disabled={!form.gatherKind}`).
  `seed.ts` (nowa, idempotentna `seedPassiveSkills()`, guard `findUnique({where:{name}})`) tworzy
  dwie gotowe umiejętności: "Rybak" (fishing) i "Górnik" (mining) — `maxLevel: 50, xpPerLevel: 50,
  xpPerGatherAction: 5, bookGateFromLevel: 10, booksRequiredPerLevel: 2`.

Zweryfikowane: `pnpm -r typecheck`+`build` czysto. Skryptem bezpośrednio przez `grantGatherXp`:
3 próby → 15/50 XP; 10 prób łącznie → poziom 1, nadwyżka XP przeniesiona (0 zamiast ujemnej);
ręcznie ustawiona postać na poziomie 9 z pełnym XP (próg bramki na 10) — kolejne wywołania
`grantGatherXp` NIE awansują i XP zostaje zacapowane na progu; `readBook` na tym etapie: pierwsza
książka zwiększa `pendingBooksRead` do 1/2 bez awansu, druga awansuje na poziom 10 i zeruje
liczniki; `readBook` poniżej pełnego XP poprawnie odrzucony z komunikatem "Zbierz najpierw pełne
doświadczenie". W przeglądarce: prawdziwa sesja łowienia (testowe łowisko + wędka, potem
usunięte) pokazuje odliczający `(X.XXs)` w panelu Zbieractwa, licznik "Łącznie zebrano" rośnie po
cyklu; zakładka Umiejętności → Umiejętności pasywne pokazuje realnie rosnące XP "Rybak" (15/50 po
3 próbach, zgodnie ze skryptem) bez czytania żadnej książki; panel admina "Umiejętności pasywne"
→ Edytuj "Rybak" pokazuje wszystkie 4 nowe pola z poprawnymi wartościami z seeda. Dane testowe
(testowe łowisko, testowa wędka, postęp XP testowej postaci) usunięte po weryfikacji.

## Drzewka umiejętności klasowych zamiast levelowania 1-10 (post-zbieractwo)

Dotychczasowy model umiejętności klasowych (`ClassSkill`/`CharacterSkill`) polegał na levelowaniu
0-10 za punkty umiejętności, z efektem liniowo skalującym się z poziomem
(`scalingFactor * core[scalingStat] * level`). Zastąpiony drzewkiem: każda umiejętność ma teraz
**stałą wartość bazową**, odblokowywaną raz za `unlockCost` punktów, a cały dalszy rozwój pochodzi
z dowolnie zdefiniowanych przez admina **węzłów-upgrade'ów** (`SkillTreeNode`), które gracz
odblokowuje w **dowolnej kolejności** za punkty umiejętności — bez wymaganej ścieżki i bez
żadnego automatycznego darmowego odblokowania na jakimkolwiek poziomie postaci.

- **Schemat (dwuetapowo, addytywnie)**: `ClassSkill` dostał `unlockCost` (koszt odblokowania
  samej umiejętności) i `baseManaCost` (dla aktywnych — zastępuje starą globalną formułę
  `10 + 5*level`); nowa relacja `nodes: SkillTreeNode[]`. Nowy model `SkillTreeNode`
  (`classSkillId`, `name`, `description`, `effect: "magnitude"|"cost"|"cooldown"`,
  `magnitudePct`, `pointCost`, `@@unique([classSkillId, name])`) — `cost`/`cooldown` mają sens
  tylko przy `kind === "active"` (walidacja krzyżowa w `ClassSkillInputSchema`).
  `CharacterSkill.level` zastąpiony `unlocked: Boolean`. Nowy `CharacterSkillNode`
  (`characterId` + `nodeId`, `@@unique`) — join gracz→odblokowany węzeł. Etap A (addytywny,
  `level`/`maxLevel` zachowane obok nowych pól) wdrożony `db push`; skrypt migracyjny
  jednorazowo przeliczał istniejące `CharacterSkill.level > 0` na `unlocked: true` ze zwrotem
  nadwyżki punktów (`unspentSkillPoints += level - 1`) — na dev.db nie było żadnych wykupionych
  poziomów, więc migracja przetworzyła 0 rekordów. Etap B usunął `level`/`maxLevel` z obu plików
  schematu (`--accept-data-loss` na jednej już niepotrzebnej kolumnie, NIE `--force-reset`).
- **Efektywne wartości liczone przez sumowanie procentów odblokowanych węzłów danego typu**:
  `magnitudeMultiplier = 1 + Σ(magnitude)`, `manaCost = round(baseManaCost * max(0, 1 -
  Σ(cost)))`, `cooldownSeconds = round(cooldownSeconds * max(0.1, 1 - Σ(cooldown)))` (dolna
  granica 10% — węzły nie potrafią zejść z cooldownu do 0s). Liczone w
  `expeditions/service.ts`'s `gatherCombatBuild` (nowy helper `sumNodePct`, drugie równoległe
  zapytanie o `CharacterSkillNode` obok `CharacterSkill`); `combat.ts`'s `PassiveSkillBonus.level`
  zastąpione `magnitudeMultiplier`, formuła w obu miejscach (`computeDerivedStats`,
  `computeDerivedStatsBreakdown`) zaktualizowana.
- **Backend**: `characters/service.ts`'s `allocateSkill` zastąpiony przez `unlockSkill`
  (jednorazowo, sprawdza `unspentSkillPoints >= unlockCost` i `!unlocked`) i `unlockNode`
  (wymaga wcześniej odblokowanej rodzicielskiej umiejętności, sprawdza
  `unspentSkillPoints >= pointCost`, brak duplikatu). Trasy: `/unlock-skill`, `/unlock-node`,
  nowa `/skill-nodes` (lista odblokowanych węzłów postaci). `admin/classes/service.ts` — węzły
  upsertowane po `classSkillId_name` w tej samej pętli co `classSkill`; usunięcie umiejętności
  blokowane, gdy `unlocked: true` u jakiegokolwiek gracza (409, było `level:{gt:0}`); usunięcie
  POJEDYNCZEGO węzła blokowane analogicznie, gdy jakiś `CharacterSkillNode` już na niego wskazuje.
  `profile/service.ts`'s publiczny profil pokazuje teraz listę nazw odblokowanych umiejętności
  bez liczby poziomu (nie ma już czego pokazywać).
- **Frontend**: `SkillsPanel.tsx` przebudowany z płaskiej listy level/maxLevel na widok drzewka —
  karta umiejętności z przyciskiem "Odblokuj (koszt: N)", a po odblokowaniu lista węzłów jako
  osobne wiersze (`+X% mocy` / `-X% kosztu many` / `-X% czasu odnowienia`, przycisk "Odblokuj (N)"
  albo ✓). `ClassesAdminPage.tsx` — pole "maks. poziom" zastąpione "koszt odblokowania (pkt)",
  nowe pole "bazowy koszt many" (tylko active), zagnieżdżony edytor "Węzły drzewka" per
  umiejętność (nazwa, opis, efekt, %, koszt pkt, usuń wiersz/węzeł).

Zweryfikowane: `pnpm -r typecheck` czysto (api + web + shared) po każdej warstwie zmian. Skryptem
bezpośrednio przez `unlockSkill`/`unlockNode`: odblokowanie odejmuje `unlockCost` i ustawia
`unlocked`; próba odblokowania węzła przed umiejętnością odrzucona; dwa węzły (magnitude + cost)
na tej samej aktywnej umiejętności poprawnie składają się w `gatherCombatBuild` (`power`/
`manaCost` dokładnie zgodne z oczekiwaną formułą, różne od stanu bazowego); odblokowanie węzła
magnitude na pasywnej umiejętności realnie podnosi `computeDerivedStats().attack` względem stanu
bez węzła. W przeglądarce (panel admina, zalogowany jako `admin@mmo.local`): dodanie węzła do
umiejętności klasy Mag, zapis, ponowne wejście w edycję pokazuje zapisany węzeł z poprawnymi
polami; próba usunięcia węzła odblokowanego wcześniej przez testową postać poprawnie zwraca 409
("gracze już go odblokowali"), po usunięciu odblokowania węzeł dający się usunąć bez błędu. Jako
gracz (świeże konto testowe, postać Wojownika z 10 punktami): zakładka Umiejętności → drzewko
pokazuje wszystkie 6 umiejętności z przyciskiem "Odblokuj (koszt: 1)"; kliknięcie odblokowuje
"Furia Bitewna" (punkty 10→9, przycisk znika). Wszystkie dane testowe (węzeł, testowe konta,
postacie, odblokowania) usunięte po weryfikacji.

## Nagrody za codzienne logowanie — per postać (post-drzewka-umiejętności)

Nowy, w pełni od zera napisany moduł `dailyLogin`. Nagroda za codzienne logowanie jest przypisana
do **postaci, nie do konta** — dwie postacie na tym samym koncie mają niezależne serie, dni cyklu
i statusy odebrania.

- **Model `CharacterDailyLoginReward`**: jeden wiersz na postać na kalendarzowy dzień w strefie
  `Europe/Warsaw` (`periodKey` w formacie `YYYY-MM-DD`, `@@unique([characterId, periodKey])`).
  Trzyma `cycleDay` (1-7), `streak` (licznik rosnący również po zawinięciu cyklu), typ i kwotę
  nagrody zamrożone w momencie utworzenia wiersza (`rewardType`/`rewardAmount` — nagroda nie
  zmienia się już po utworzeniu, nawet jeśli admin kiedyś zmieni tabelę) oraz `claimedAt`.
- **Cykl**: pierwsze wejście postaci → dzień 1, seria 1. Kolejny dzień z rzędu → dzień+1
  (zawija 7→1), seria+1. Pominięty dzień → reset do dnia 1, seria 1. Obliczane w
  `nextCycleState()` przez różnicę dni między `periodKey` ostatniego wiersza a dzisiejszym
  (parsowane jako północ UTC obu dat kalendarzowych, więc DST nie wpływa na wynik).
  `ensureDailyLoginReward()` jest idempotentne w obrębie jednego dnia (unique constraint chroni
  przed duplikatem przy równoczesnych żądaniach — `P2002` łapane i traktowane jako "już istnieje,
  odczytaj ponownie") i wywoływane automatycznie przy pierwszym `GET` danego dnia — nie trzeba
  osobno podpinać go pod przełączanie aktywnej postaci.
- **Odbiór nagrody**: `claimDailyLoginReward()` — jeśli już odebrana, zwraca ten sam rekord bez
  ponownego przyznawania (`goldGained`/`expGained` = 0). W przeciwnym razie w transakcji: atomowy
  guard `updateMany({where:{id, claimedAt:null}})` (ten sam wzorzec co `flagSuspiciousExpedition`)
  chroni przed podwójnym przyznaniem przy dwóch równoczesnych `claim`; złoto dolicza się wprost,
  XP przechodzi przez `computeLevel` z przyznaniem `unspentStatPoints +4`/`unspentSkillPoints +1`
  za każdy zdobyty poziom (identyczna formuła jak w `applyExpeditionReward`).
- **Nagrody dzień 1-7** (stała tabela w kodzie, łatwa do przeniesienia do panelu admina później):
  500 złota, 750 złota, 250 XP, 1000 złota, 500 XP, 1500 złota, 3000 złota.
- **Endpointy**: `GET /api/daily-login/:characterId` (status + pełna tabela 7 nagród, tworzy
  dzisiejszy wiersz jeśli nie istnieje), `POST /api/daily-login/:characterId/claim`.
- **Frontend**: nowa zakładka "Nagrody dzienne" (`DailyLoginTab.tsx` → `DailyLoginPanel.tsx`) w
  sekcji "Postać" nawigacji — pasek 7 dni z podświetlonym bieżącym dniem, licznik serii, przycisk
  "Odbierz" (wyszarzony na "Odebrano" po kliknięciu), komunikat z dokładną przyznaną nagrodą.

Zweryfikowane: `pnpm -r typecheck` czysto (api + web). Skryptem bezpośrednio przez
`ensureDailyLoginReward`/`claimDailyLoginReward`: pierwsze wejście → dzień1/seria1/500 złota;
drugie wywołanie tego samego dnia nie tworzy duplikatu; symulowany poprzedni dzień → dzień2/
seria2/750 złota; symulowana 3-dniowa przerwa → reset do dnia1/seria1; symulowany dzień7 →
zawinięcie do dnia1 z serią rosnącą do 11 (nie resetującą się); odbiór złota przyznaje dokładną
kwotę i jest w pełni idempotentny (drugie wywołanie: 0 przyznane, stan bez zmian); odbiór XP na
postaci tuż przed progiem awansu poprawnie podnosi poziom i przyznaje punkty staty/umiejętności;
`getDailyLoginStatus` zwraca 7-elementową tabelę; obcy użytkownik dostaje 404 przy próbie
odczytu/odbioru cudzej postaci. W przeglądarce: świeże konto testowe, zakładka "Nagrody dzienne"
pokazuje poprawnie 7 dni z podświetlonym dniem 1. i przyciskiem "Odbierz (500 złota)"; kliknięcie
natychmiast podnosi złoto postaci w nagłówku z 0 do 500 i zmienia przycisk na "Odebrano" z
komunikatem potwierdzającym. Dane testowe (konto, postać, wiersze nagród) usunięte po weryfikacji.

## Drzewko umiejętności: zależności między węzłami, levelowanie, kategorie (post-daily-login)

Rozszerzenie świeżo wdrożonego drzewka umiejętności (patrz sekcja "Drzewka umiejętności
klasowych..." wyżej) o trzy zmiany, na podstawie wizualnego mockupu dostarczonego przez
użytkownika: (1) węzły mogą wymagać wcześniejszego odblokowania innego węzła (kłódka, dopóki
"rodzic" w gałęzi nieaktywny) — ODWRACA wcześniejszą decyzję "dowolna kolejność"; (2) węzły
levelują się wielokrotnie (Lv 1, Lv 2, ...) zamiast jednorazowego odblokowania — ODWRACA
wcześniejszą decyzję "jednorazowe odblokowanie"; (3) umiejętności grupowane w zakładki kategorii
(Walka/Przetrwanie/Taktyka). Świadome uproszczenie: zależności działają WEWNĄTRZ jednej
umiejętności (jej własnej listy węzłów), nie rozpięte na wielu umiejętnościach jak zbiegający się
węzeł na mockupie — pełny graf wielo-umiejętnościowy wymagałby osobnego algorytmu układu i nie
został zaimplementowany. Ikony węzłów dobierane są heurystycznie (emoji wg `targetStat`/
`effectType`/`effect`) — brak nowego pola "ikona" w bazie.

- **Schemat (addytywnie, bez migracji)**: `ClassSkill.category: String @default("combat")`.
  `SkillTreeNode` += `maxLevel: Int @default(1)`, `requiresNodeId: String?` (self-relacja
  `"NodePrerequisite"`, `onDelete: SetNull` jako siatka bezpieczeństwa na poziomie bazy — realna
  ochrona to guard aplikacyjny, patrz niżej). `CharacterSkillNode` += `level: Int @default(1)` —
  istniejące wiersze (dawne "odblokowany") zachowują się identycznie jako "poziom 1". `magnitudePct`/
  `pointCost` na węźle reinterpretowane jako WARTOŚĆ ZA POZIOM (nie zmienia się schemat, tylko
  formuła w kodzie).
- **`packages/shared`**: nowy `SkillCategorySchema`. `SkillTreeNodeInputSchema` += `maxLevel`,
  `requiresNodeName` (referencja po nazwie węzła w TEJ SAMEJ umiejętności, rozwiązywana na `id`
  po stronie serwera). `ClassSkillInputSchema` += `category`, nowy `.refine` wykrywający
  self-referencję, nieznaną nazwę i CYKL w łańcuchu `requiresNodeName` (przechodzi po `s.nodes`,
  400 zanim cokolwiek trafi do bazy).
- **`admin/classes/service.ts`**: węzły upsertowane jak dotąd po `classSkillId_name`, potem DRUGI
  przebieg (`resolveNodeRequirements`) mapuje `requiresNodeName` → `requiresNodeId` po świeżo
  poznanych id (konieczne, bo węzeł może wymagać innego węzła tworzonego w tej samej transakcji).
  Guard usuwania węzła rozszerzony: oprócz istniejącego "gracze już go odblokowali" doszedł
  "jest wymagany przez inny węzeł" (`skillTreeNode.count({requiresNodeId:{in:removed}, id:{notIn:
  removed}})` — **wyklucza węzły usuwane W TEJ SAMEJ turze**, żeby legalne usunięcie powiązanej
  pary naraz nie było fałszywie blokowane).
- **`characters/service.ts`'s `unlockNode`**: teraz "zainwestuj kolejny poziom", wywoływalne
  wielokrotnie na tym samym węźle. Nowy check: jeśli `requiresNodeId` ustawiony, wymagany węzeł
  musi mieć `level >= 1` u tej postaci, inaczej 400 z nazwą brakującego węzła. Pierwsza inwestycja
  tworzy `CharacterSkillNode` na poziomie 1, kolejne `update({level:{increment:1}})` aż do
  `maxLevel` (płaski koszt `pointCost` za każdy poziom, bez progresji).
- **`expeditions/service.ts`**: `gatherCombatBuild`'s `unlockedNodeIds: Set` → `nodeLevels: Map<
  nodeId, level>`; `sumNodePct` mnoży `magnitudePct * level` zamiast liczyć samą obecność w
  zbiorze — węzeł na poziomie 3 z `magnitudePct=0.1` daje teraz +30%, nie +10%.
- **Frontend**: `SkillsPanel.tsx` przebudowany z płaskiej listy na wizualne drzewko — zakładki
  kategorii, gałęzie umiejętności ułożone jako kolumny obok siebie, węzły w wierszach wg
  głębokości łańcucha zależności (BFS, dowolna długość), każdy z ikoną, odznaką `Lv X/maxLevel`,
  kłódką i pionowym łącznikiem CSS do wiersza wyżej; klik wybiera węzeł/umiejętność do panelu
  szczegółów u dołu (efekt bazowy vs. aktualny przy bieżącym poziomie, przycisk "Odblokuj"/
  "Ulepsz"); licznik "Punkty umiejętności" przeniesiony na sam dół panelu. `ClassesAdminPage.tsx`
  — nowy select kategorii per umiejętność, w edytorze węzła nowe pole "maks. poziom" i select
  "wymaga węzła" (opcje = pozostałe węzły tej samej umiejętności).

Zweryfikowane: `pnpm -r typecheck` czysto. Skryptem: cykliczna zależność (A wymaga B, B wymaga A)
odrzucona przez Zod przed zapisem; łańcuch A(korzeń)→B(wymaga A)→C(wymaga B) poprawnie rozwiązany
na `requiresNodeId`; inwestycja w B przed A odrzucona, po A — B dostępne, C nadal zablokowane bez
B; wielokrotne wywołanie na tym samym węźle levelinguje do `maxLevel(3)`, czwarta próba odrzucona;
`gatherCombatBuild` z węzłem na poziomie 3 (+10%/poziom) i drugim na poziomie 1 daje dokładnie
`magnitudeMultiplier=1.4`; usunięcie węzła wymaganego przez inny (osobno) poprawnie odrzucone
(zarówno przez Zod przy normalnym zapisie, jak i przez guard serwisu przy wywołaniu z pominięciem
Zod), a usunięcie POWIĄZANEJ PARY naraz (oba usuwane jednocześnie) przechodzi bez blokady —
wykryto i naprawiono błąd, w którym guard początkowo fałszywie blokował tę drugą, poprawną
sytuację. W przeglądarce (panel admina): dodanie pary węzłów z zależnością i `maxLevel`, zapis,
ponowna edycja pokazuje poprawnie odtworzone `requiresNodeName`/`maxLevel`; próba zapisu z
osieroconą referencją (usunięty węzeł nadal wymagany przez inny) poprawnie odrzucona przed
wysłaniem do serwera, baza nienaruszona. Jako gracz: zakładka Umiejętności pokazuje zakładki
kategorii i wizualne drzewko z ikonami/kłódkami; odblokowanie umiejętności odsłania jej węzeł
korzeniowy; inwestycja w węzeł korzeniowy poprawnie odblokowuje zależny węzeł potomny (kłódka
znika); kolejne kliknięcia "Ulepsz" levelują węzeł (Lv 1→2/3) z widocznym wzrostem efektu w
panelu szczegółów (+10%→+20% mocy). Wszystkie dane testowe (węzły, konta, postacie) usunięte po
weryfikacji.

## Kafelki drzewka umiejętności w stylu slotu ekwipunku + tooltip (post-drzewko-zależności)

Czysto wizualna przebudowa (bez zmian schematu/backendu) na życzenie użytkownika, który przesłał
zrzut ekranu swojego obecnego drzewka (kolorowe emoji, "Lv N" pod ikoną) i referencyjny mockup —
chciał, żeby kafelki wyglądały jak sloty ekwipunku (kwadrat 1:1 z gniazdem sprzętu, złota ramka,
poziom w rogu) i pokazywały tooltip na hover jak przy itemie. Wyraźnie zaznaczył, że dokładność
ikon per-umiejętność nie jest teraz priorytetem ("silnik i rozmieszczenie" ważniejsze niż treść).

- **Nowe komponenty** (`apps/web/src/components/character/`): `SkillSygil.tsx` — jeden wspólny
  placeholder-glif (inline SVG, ta sama konwencja co `inventory/ItemTypeIcon.tsx`: `currentColor`
  stroke, brak fill) używany dla WSZYSTKICH węzłów/umiejętności zamiast heurystycznie dobieranych
  emoji — świadomie generyczny, do podmiany na docelowe ikony per-umiejętność później (jedna
  zmiana w jednym miejscu, nie przebudowa). Ten sam plik eksportuje `LockGlyph` (kłódka, ten sam
  styl rysowania) dla zablokowanych kafelków. `SkillTooltip.tsx` — wierny odpowiednik
  `inventory/ItemTooltip.tsx` (identyczny mechanizm: `fixed` div, `getBoundingClientRect()` +
  fallback góra/dół, `w-56`, te same stałe `TOOLTIP_WIDTH`/`TOOLTIP_GAP`), ale z treścią
  dopasowaną do umiejętności (tytuł, etykieta rodzaju, status "Poziom X/Y" / "Wymaga: ...", opis,
  linie efektu, koszt) zamiast delt statystyk itemu — osobny komponent zamiast rozszerzania
  `ItemTooltip`, bo kształt danych się nie pokrywa.
- **`SkillsPanel.tsx`'s `Tile`**: rozmiar `h-14 w-14` (56px), identyczny jak
  `inventory/EquipSlotBox.tsx`/`ItemBox.tsx`. Cztery stany wizualne: zablokowany
  (`border-2 border-dashed border-line-soft/60 opacity-60` + `LockGlyph`, jak pusty slot
  ekwipunku), dostępny-niezainwestowany (`border-line-soft/70 bg-panel-raised
  hover:border-gold/60`, neutralny), zainwestowany-nie-zmaksowany (`border-gold/50 bg-gold/10`),
  zmaksowany (`border-gold-bright/70 bg-gold-bright/10`, jaśniejszy odcień). `SocketCorners`
  (te same złote narożniki-bracket co sloty ekwipunku) na każdym odblokowanym kafelku. Poziom
  pokazywany jako `+N` w lewym górnym rogu — dokładnie ten sam wzorzec co `ItemBox`'s odznaka
  poziomu ulepszenia `+{upgradeLevel}` — WYŁĄCZNIE dla węzłów; korzenie umiejętności (jednorazowy
  unlock, brak realnego poziomu w modelu danych) nie dostają fałszywej odznaki "+1" — jedyny
  sygnał to zmiana obramowania z przerywanego na pełne. Etykieta nazwy pod kafelkiem USUNIĘTA
  (była w poprzedniej wersji) — nazwa/opis/efekt dostępne przez hover-tooltip, zgodnie z życzeniem
  użytkownika, żeby kafelek wyglądał czysto jak slot itemu, nie karta z podpisem.
- Mechanika (zależności/levelowanie/kategorie), backend i model danych — bez zmian względem
  poprzedniej sekcji. Tylko warstwa wizualna `Tile`+tooltip została przebudowana.

Zweryfikowane: `pnpm --filter web typecheck` czysto. W przeglądarce (testowa postać z węzłami we
wszystkich 4 stanach: zablokowany/dostępny/poziom 1 z 2/zmaksowany 3 z 3): odczyt DOM potwierdził
dokładnie oczekiwane klasy Tailwind dla każdego stanu (`border-dashed` dla zablokowanych,
`border-gold-bright/70` dla zmaksowanego z widocznym „+3”, `border-gold/50` dla częściowo
zainwestowanego z „+1”, neutralny `border-line-soft/70` dla dostępnych-pustych). Tooltip
wywołany syntetycznym `mouseover` (React 17+ deleguje mouseenter/leave z bąbelkującego
mouseover/mouseout, więc bezpośredni natywny `mouseenter` nie wystarcza — trzeba `mouseover` z
`bubbles:true`) pokazał poprawną treść zarówno dla zmaksowanego węzła ("Furia I / Moc / Poziom
3/3 / opis / +10% mocy za poziom / Obecnie: +30% mocy / Poziom maksymalny" — mnożenie przez
poziom potwierdzone) jak i dla zablokowanej umiejętności ("Krytyczne Uderzenie / Pasywna /
Nieodblokowana / Koszt odblokowania: 1 pkt"). Dane testowe (węzły, konto, postać) usunięte po
weryfikacji.

## Sześć zgłoszeń: tło admina, upload grafik itemów, 3 poprawki błędów, panel mikstur (post-kafelki-drzewka)

Pakiet niepowiązanych zgłoszeń użytkownika, każde zweryfikowane osobno.

- **Tło panelu admina**: `.panel`/`bg-panel`/`bg-ink` mają w całej grze lekki ciepły odcień
  (`oklch(... 45)`, hue 45° — celowy "pergaminowy" motyw), który w adminie czytał się jako
  "wciąż trochę brązowy". Nowy `.admin-scope` (`index.css`) nadpisuje te trzy klasy na czysto
  neutralny szary/czarny (`oklch(... 0 0)`, chroma 0) TYLKO w zakresie panelu admina — `AppShell`
  dostał opcjonalny `mainClassName`, ustawiany na `"admin-scope"` w `AdminSettingsPage.tsx` i
  `AdminLogsPage.tsx`; selektor `.admin-scope .bg-panel` wygrywa z samym `.bg-panel` przez wyższą
  specyficzność, więc żaden z ~11 plików zakładek admina nie wymagał zmian — motyw właściwej gry
  zostaje nietknięty.
- **Upload grafiki itemu**: nowe `Item.imageUrl String?` (addytywnie), `@fastify/multipart` +
  `@fastify/static` (limit 3 MB, katalog `apps/api/uploads/items/` tworzony przy starcie
  serwera — gitignored, więc świeży checkout/deploy inaczej by go nie miał). Nowy endpoint
  `POST /api/admin/items/:id/image` — zapisuje pod `{itemId}-{timestamp}.{ext}`, kasuje poprzedni
  plik przy reuploadzie (świeża nazwa zamiast nadpisywania = bez problemu z cache przeglądarki).
  Upload dostępny dopiero dla ISTNIEJĄCEGO itemu (zapisz najpierw, potem wgraj grafikę) — brak
  wsparcia dla uploadu "w locie" przy tworzeniu nowego itemu. Front: `ItemBox.tsx`'s nowy
  `ItemIcon` renderuje `<img>` gdy `imageUrl` ustawiony, inaczej dotychczasowy placeholder
  (`ItemTypeIcon`) — pokryte tylko główne miejsce renderowania itemów (ekwipunek/plecak/aktywne
  mikstury); drobne ikonki w LootBar/AnvilTab/NpcTab/ExpeditionPanel zostały przy placeholderze
  (świadome zawężenie zakresu, nie przeoczenie).
- **Przenoszenie między kartami plecaka nie działało**: `DndContext` w `EquipmentTab.tsx` nie
  miał `<DragOverlay>` — realny `ItemBox` (ten sam węzeł DOM, który dnd-kit fizycznie przesuwał
  przez `transform`) był unmountowany w momencie przełączenia zakładki plecaka w trakcie
  przeciągania (`TabDropButton`'s hover-triggered `onSelect`), bo siatka renderuje tylko komórki
  AKTUALNEJ zakładki (`layoutGridTab`). Naprawione dodaniem `<DragOverlay>` + stanem
  `activeDragItem` (ustawianym w nowym `onDragStart`) i nowym `ItemBoxPreview` (nieinteraktywny
  klon kafla, bez `useDraggable`/tooltipa) — ten węzeł żyje w portalu poza siatką, więc
  przełączenie zakładki już go nie dotyczy. Usunięto też ręczne `style={transform...}` z
  `ItemBox.tsx` (i nieużywany już `transform` z `useDraggable()`) — z `DragOverlay` obecnym,
  pozostawienie transformu na źródłowym elemencie dawałoby wizualny duplikat.
- **Event exp/złoto "nie działał"**: cała logika liczenia/stosowania mnożnika (start ekspedycji →
  symulacja → zapis na ekspedycji → odbiór nagrody) była poprawna. Prawdziwa przyczyna:
  `<input type="datetime-local">` w `EventsAdminPage.tsx` wysyłał "naiwny" string bez strefy
  (`"2026-08-19T22:30"`), a `admin/events/service.ts`'s `new Date(input.startsAt)` interpretował
  go w strefie czasowej PROCESU SERWERA, nie przeglądarki admina — na produkcyjnym VPS (zwykle
  UTC) to realne przesunięcie o 1-2h względem zamiaru admina (Europe/Warsaw), więc świeżo
  utworzony/aktywowany event "od teraz" faktycznie aktywował się 1-2h później niż admin myślał.
  Naprawione nowym `localInputValueToISO()` — konwertuje naiwny string na jednoznaczny
  ISO-z-`Z` PRZED wysłaniem, używając poprawnie lokalnej strefy PRZEGLĄDARKI (gdzie ten kod
  faktycznie działa), więc serwer już niczego nie zgaduje. Zweryfikowane: event utworzony w
  przeglądarce jako "22:30" (Warszawa, UTC+2 latem) zapisał się w bazie jako dokładnie
  `20:30:00.000Z` — poprawne niezależnie od strefy serwera.
- **Fałszywy "(-1)" w tooltipie przy identycznych statach**: `ItemTooltip.tsx` liczyło różnicę na
  SUROWYCH wartościach (`value - compareValue`), potem osobno zaokrąglało wynik do wyświetlenia —
  dwie wartości, które PO ZAOKRĄGLENIU wyświetlają się identycznie (np. obie "+1%"), mogą się
  różnić tuż pod powierzchnią (0.0051 vs 0.0149) na tyle, że zaokrąglona RÓŻNICA wychodzi ±1,
  mimo że widoczne liczby są takie same. Naprawione liczeniem różnicy na już-zaokrąglonych
  (wyświetlanych) wartościach zamiast na surowych floatach — identyczne wyświetlane liczby dają
  teraz zawsze różnicę 0.
- **Panel aktywnych mikstur w ekspedycji był czystym tekstem**: `ActivePotionsSummary.tsx`
  przebudowany, żeby używać dokładnie tych samych komponentów co zakładka Ekwipunek
  (`ActiveItemSlotBox` + `ItemBox`, 6 slotów) zamiast ręcznie stylowanych `<span>` z nazwą i
  ikonką. `ItemBox`'s `useDraggable` jest bezpieczny do renderowania poza `<DndContext>` (dnd-kit
  ma domyślny kontekst) — przeciąganie po prostu nigdy się nie aktywuje w tym czysto
  podglądowym miejscu, bez potrzeby duplikowania logiki wizualnej w osobnym komponencie.

Zweryfikowane w przeglądarce: tło admina — kolor obliczony (`getComputedStyle`) potwierdzony jako
`oklch(0.12 0 0)`/`oklch(0.23 0 0)` (bez odcienia) na stronie ustawień i na stronie logów; upload
grafiki — realny plik PNG wgrany przez symulowany `<input type="file">`, potwierdzony `200 OK`,
podgląd w formularzu ładuje się (`naturalWidth: 1`), a ta sama grafika widoczna w prawdziwym
`ItemBox` w zakładce Ekwipunek (aktywny slot mikstury); event — utworzony przez formularz,
zapisany czas w UTC zgadza się z oczekiwanym przesunięciem strefowym. Dane testowe (testowa
grafika, testowy event) usunięte po weryfikacji.

## Mapa ekspedycji: wizualny wybór krainy + inline wybór potworów (post-sześć-zgłoszeń)

Przebudowa ekranu planowania ekspedycji (nie ekranu aktywnej walki) na życzenie użytkownika,
który przesłał zrzut ekranu referencyjny ("MAPA EKSPEDYCJI" — mapa krain połączonych ścieżką po
lewej, zaznaczanie potworów po prawej). Dobra wiadomość: zewnętrzna ramka (`PanelFrame.tsx`) już
domyślnie renderuje dokładnie to, co widać na obrazku — 4 złote narożniki (`PanelCorners`),
wyśrodkowany tytuł w Cinzel — więc redesign dotyczy WYŁĄCZNIE wewnętrznej treści.

- **Scalono dwie dawne, osobne gałęzie** `ExpeditionPanel.tsx` (płaska lista krain, gdy postać
  jeszcze nigdzie nie stała, ORAZ inny layout z rozwijaną listą "Idź do innej krainy", gdy już
  stała) w jeden dwukolumnowy widok, aktywny zawsze gdy `!expedition && !isTraveling`. Usunięty
  stan `otherZonesOpen` i cały blok rozwijanej listy — mapa to w pełni zastępuje.
- **`ZoneMapPath.tsx`** (nowy) — lewa kolumna: krainy posortowane wg `minLevel` (kolejność
  tierów) jako pionowa ścieżka węzłów, przerywany łącznik między kolejnymi. Węzeł = okrągły
  medalion (`rounded-full`, gradient `panel-raised`→`panel`, 1px border — dokładnie wzorzec
  odznaki ikon nawigacji z `AppShell.tsx`), z autorskim inline-SVG glifem (`ZoneGlyphs.tsx`:
  ognisko dla miasta, drzewo dla dzikiej krainy — dwa warianty, bo model danych nie ma
  bardziej szczegółowego "typu" krainy). Zablokowana (dzisiejszy warunek `!eligible`,
  `character.level` poza `[minLevel, maxLevel]` — bez zmiany zasad gry, tylko nowy wygląd)
  pokazuje `LockGlyph` (reużyty z drzewka umiejętności, `character/SkillSygil.tsx`) i jest
  nieklikalna. Aktualna kraina dostaje złoty glow + plakietkę "Tu jesteś".
- **`ZoneInfoCard.tsx`** (nowy) — pod mapą, dla klikniętej krainy: nazwa, opis, zalecany poziom,
  czas podróży, lista przeciwników, i "Możliwe łupy" — realne ikony z `ZoneDto.drops[]` (limit 6
  + "+N więcej"). Sekcja "Przygotowania" (sugerowane mikstury) z obrazka referencyjnego świadomie
  POMINIĘTA — to nie jest żadna istniejąca funkcja, tylko przykładowa treść mockupu.
- **`MonsterAttackPanel.tsx`** (nowy, zastępuje usunięty `MonsterPickerModal.tsx` — nie zostaje
  jako martwy kod) — identyczna logika zaznaczania potworów (`Set<string>`, "Zaznacz/Odznacz
  wszystkie") co dawny modal, ale renderowana INLINE w prawej kolumnie zamiast `fixed inset-0` +
  `bg-black/60` backdrop; bez przycisku "Anuluj" (nie ma czego anulować, to nie overlay).
  Ponieważ komponent zostaje teraz zamontowany cały czas (nie tylko gdy modal był otwarty), jego
  stan zaznaczenia PRZETRWAŁ nawet przejście do `BattleTacticsModal` i powrót — drobna poprawka
  UX względem starego zachowania (dawniej "Wstecz" z modala taktyki gubiło zaznaczone potwory).
  `BattleTacticsModal` (osobny, świadomy krok) bez zmian.
- Prawa kolumna reaguje na to, CO jest kliknięte na mapie względem tego, GDZIE postać faktycznie
  stoi: inna kraina niż obecna → przycisk "Wyrusz do krainy"; obecna, miasto → info o NPC; obecna,
  dzika, bez potworów → komunikat; obecna, dzika, z potworami → `MonsterAttackPanel`.
  `selectedZoneId` domyślnie = `character.currentZoneId` (mapa od razu otwiera się na "tu
  jesteś"), ale to tylko wartość POCZĄTKOWA `useState` — dalsze kliknięcia gracza nie są
  nadpisywane przy przerenderowaniach.

Zweryfikowane: `pnpm --filter web typecheck` czysto; grep po całym `apps/web/src` bez śladu
usuniętego `MonsterPickerModal`/`pickerOpen`/`otherZonesOpen`. W przeglądarce: mapa renderuje
wszystkie 10 krain, kraina poza zasięgiem poziomu poprawnie zablokowana (kłódka, `disabled`,
`opacity-50`, tytuł z wymaganym poziomem) i nieklikalna; klik eligible krainy pokazuje
`ZoneInfoCard` z realnymi wrogami/łupami i przycisk "Wyrusz"; postać ustawiona bezpośrednio w
"Wilcze Uroczysko" — mapa pokazuje "TU JESTEŚ", prawy panel pokazuje realny `MonsterAttackPanel`;
pełny przepływ (zaznacz wszystkie → "Rozpocznij walkę" → `BattleTacticsModal` → potwierdź) faktycznie
wystartował ekspedycję z żywym dziennikiem walki, bez regresji względem starego przepływu.
Responsywność: `lg:grid-cols-[1.3fr_1fr]` potwierdzone jako collapsujące do jednej kolumny
(`gridTemplateColumns` = pojedyncza wartość) na viewport 375px. Dane testowe (pozycja postaci,
testowa ekspedycja) zresetowane po weryfikacji.

### Mapa ekspedycji — dopracowanie ramki, zakładek poziomowych i układu (2026-08-19)

Trzy poprawki do świeżo wdrożonej mapy ekspedycji, na podstawie tego samego zrzutu referencyjnego
co wyżej: (1) wierniejsza ramka/narożniki, (2) podział długiego łańcucha krain na zakładki
poziomowe, (3) karta informacyjna krainy przeniesiona z lewej (pod mapą) na prawą stronę.

- **`common/OrnateCorners.tsx`** (nowy) — cięższy, bardziej ozdobny odpowiednik `PanelCorners`:
  podwójna linia bracketu (pełna zewnętrzna + przygaszona wewnętrzna, offsetowana), zawinięty
  "ogon" na końcach, diamentowy akcent w rogu — ten sam inline-SVG grammar (currentColor stroke,
  ręcznie rysowane ścieżki, bez biblioteki ikon/emoji). `PanelFrame.tsx` dostał nowy prop
  `cornerStyle?: "standard" | "ornate"` (domyślnie `"standard"` — bez zmian dla żadnego innego
  panelu w grze) — gdy `"ornate"`, dokłada też wewnętrzną, przygaszoną linię (`inset-1 border
  border-gold/20`) dla efektu zagnieżdżonej podwójnej ramki. Zastosowane WYŁĄCZNIE na
  `<PanelFrame title="Mapa ekspedycji" cornerStyle="ornate">` — świadomie NIE zmieniono
  współdzielonego `PanelCorners`/domyślnego wariantu, żeby nie zmieniać wyglądu każdego innego
  panelu w grze (logowanie, cały panel admina, resztę ekranów gry) przy okazji dopasowywania
  jednego konkretnego widoku do jednego konkretnego zrzutu.
- **`ZoneMapPath.tsx`** — długi, jeden nieprzerwany łańcuch wszystkich krain zastąpiony
  zakładkami przedziałów poziomowych (`BAND_SIZE = 30` → "1-30", "31-60", "61-90", ...),
  liczonymi DYNAMICZNIE z faktycznego `maxLevel` istniejących krain (`Math.ceil(maxLevel / 30)`),
  nie z twardo zakodowanej liczby krain — więc dalej działa poprawnie, gdy w adminie dojdą/znikną
  krainy. Aktywna zakładka domyślnie = przedział zawierający `character.currentZoneId` (albo
  pierwsza, gdy postać nigdzie jeszcze nie stoi). Przełączanie zakładek filtruje tylko WIDOCZNE
  węzły ścieżki — nie czyści `selectedZoneId`, więc wybrana wcześniej kraina (i jej
  `ZoneInfoCard`/panel akcji po prawej) zostaje na ekranie nawet po zmianie zakładki.
- **`ExpeditionPanel.tsx`** — `ZoneInfoCard` przeniesiona z lewej kolumny (pod `ZoneMapPath`) na
  górę prawej kolumny, nad dotychczasową zawartość tej kolumny (przycisk "Wyrusz do krainy" /
  komunikat NPC / `MonsterAttackPanel` — ta sama logika warunkowa co wcześniej, bez zmian).
  `ZoneInfoCard.tsx` straciła własny hardkodowany `mt-4` (który miał sens tylko w starej pozycji
  pod mapą) — odstęp teraz kontroluje rodzic (`ExpeditionPanel`) w zależności od tego, czy karta
  w ogóle jest renderowana.

Zweryfikowane w przeglądarce (bezpośrednio na koncie admina, bez modyfikacji danych): 4 zakładki
poziomowe wygenerowane poprawnie z realnych 10 krain (1-30/31-60/61-90/91-120), klik zakładki
poprawnie filtruje widoczne węzły ścieżki (np. "31-60" pokazuje inny zestaw krain niż "1-30"),
wybór krainy w jednej zakładce przetrwał przełączenie na inną zakładkę. `ZoneInfoCard` renderuje
się teraz w prawej kolumnie (potwierdzone przez `getBoundingClientRect` — ta sama współrzędna X
co przycisk "Wyrusz do krainy" pod nią, różna od lewej kolumny z mapą). Panel "Mapa ekspedycji"
ma 4 narożniki `OrnateCorners` (`viewBox="0 0 36 36"`, potwierdzone w DOM) + wewnętrzną linię
`inset-1` — żaden inny panel w grze nie zmienił wyglądu (zmiana opt-in per `cornerStyle` prop).
Responsywność: układ mobilny (375px) nie rozjechał się po zmianach. `pnpm --filter web typecheck`
czysto.

### Fix: obrazki itemów niewidoczne na produkcji — brakująca reguła `/uploads/` w nginx/Caddy (2026-08-19)

Zgłoszenie usera: wgrany obrazek itemu (np. "Różdżka Wilków", "Mikstura Życia") nie wyświetlał się
— inspekcja elementu pokazywała poprawny `src="/uploads/items/{id}-{timestamp}.png"`, ale otwarcie
tego adresu przekierowywało na `/characters`. Lokalnie (dev) obrazki działają, bo `API_URL` jest
tam zawsze absolutny (`http://localhost:4000`); na produkcji `VITE_API_URL` jest CELOWO puste
(`docs/deployment.md` krok 6 — "zapytania idą pod ten sam adres co strona"), więc `<img src>`
staje się względną ścieżką `/uploads/...`, którą musi obsłużyć reverse proxy. `deploy/mmo-api.service.example`
serwuje te pliki poprawnie (`@fastify/static`, patrz `apps/api/src/app.ts`) — problem był wyłącznie
w szablonach configów, które przekierowywały do backendu `/api/*` i `/health`, ale NIE `/uploads/*`
(funkcja uploadu grafik itemów została dodana w tej sesji, długo po tym, jak te szablony powstały).
Bez tej reguły `/uploads/*` trafiał w catch-all `try_files $uri /index.html` (nginx) / `handle {
file_server }` (Caddy), serwer zwracał SPA zamiast pliku PNG, a router frontendowy przekierowywał
nieznaną ścieżkę na `/characters` — dokładnie objaw zgłoszony przez usera.

Naprawione w **szablonach** (`deploy/nginx-mmo.conf.example`, `deploy/Caddyfile.example`, w tym
wariant "bez domeny" w Caddyfile) — dodana reguła `/uploads/` → `proxy_pass`/`reverse_proxy` do
`127.0.0.1:4000`, identyczna jak dla `/api/`. **To NIE naprawia samo z siebie już działającego
serwera na VPS** — szablon jest kopiowany tylko raz przy pierwszym wdrożeniu (`docs/deployment.md`
krok 9); istniejącą, żywą konfigurację nginx/Caddy trzeba ręcznie dopisać na serwerze i przeładować
(`sudo nginx -t && sudo systemctl reload nginx`, albo dla Caddy `sudo systemctl reload caddy`).

### Kowadło: sloty materiałów w stylu eq + opcjonalne katalizatory (2026-08-20)

User poprosił o zamianę tekstowej listy "Wymagane materiały" na kwadraty jak w eq (auto-wypełniane,
czerwona poświata + liczba X/Y gdy brakuje), plus możliwość dołożenia opcjonalnych "ulepszaczy"
(np. +5% szansy powodzenia). Ustalone z userem przed implementacją (AskUserQuestion): (1) nowy
dedykowany `Item.type = "catalyst"` (jak rod/pickaxe/bait/book, nie nadpisywanie "consumable");
(2) na start tylko efekt "+% szansy powodzenia" — drugi pomysł usera ("+% szansy na poprawienie
bonusowego statu") świadomie odłożony, wymagałby osobnej decyzji co dokładnie znaczy "poprawienie";
(3) siatka 4 kwadratów łącznie — pierwsze auto-zajęte przez wymagane materiały, reszta wolna na
katalizatory.

**Schemat** (`schema.prisma` + `schema.production.prisma`, addytywnie): `Item.catalystSuccessChanceBonusPct
Float?` — sensowne tylko gdy `type === "catalyst"`. `packages/shared`: `"catalyst"` dodane do
`ItemTypeSchema`; `CreateItemSchema` += `catalystSuccessChanceBonusPct` (wzorem `baitChanceBonusPct`);
nowy `ANVIL_SLOT_COUNT = 4` (eksportowany, używany przez klienta do układu slotów I przez
`UpgradeItemSchema` do walidacji długości tablicy); `UpgradeItemSchema` += `catalystInventoryItemIds:
string[]` (max 4, domyślnie `[]`).

**Backend** (`modules/inventory/service.ts` `upgradeItem`): pobiera i waliduje każdy
`catalystInventoryItemId` (należy do postaci, `item.type === "catalyst"`, brak duplikatów w
tablicy → 400), sumuje `catalystSuccessChanceBonusPct` wszystkich, `chance = min(1, baseChance +
catalystBonusPct)`. Katalizatory konsumowane W TEJ SAMEJ transakcji co materiały/złoto —
**niezależnie od wyniku losowania** (ta sama filozofia co materiały: "zawsze zużywane przy próbie,
wygrana czy przegrana"), po 1 sztuce z każdego wskazanego stacka (delete-if-zero, jak materiały).
`modules/admin/items/service.ts`: nowa `catalystData()` (wzorem `bookData`/`gatherData`),
dołożona do `createItem` ORAZ `updateItem` (przy okazji zauważony i zgłoszony osobnym zadaniem
w tle nie-związany bug: `updateItem` już wcześniej brakowało `...bookData(input)`, więc edycja
istniejącego itemu typu "book" cicho gubiła zmiany w polach książki — NIE naprawione tutaj,
świadomie zostawione jako osobne zadanie, żeby nie mieszać z tym PR-em).

**Frontend**:
- **`components/inventory/AnvilRequirementSlots.tsx`** (nowy) — `MaterialSlotBox` (nieinteraktywny
  kwadrat 56px: grafika/ikona itemu + odznaka `owned/required` w rogu, czerwona ramka+poświata gdy
  za mało) i `CatalystSlotBox` (drop target dnd-kit `type: "catalyst-slot"` + `index`; pusty = kreskowana
  ramka z podpisem "Ulepszacz", pełny = renderuje prawdziwy `ItemBox` bez podwójnej ramki, klik usuwa).
- **`ItemTypeIcon.tsx`** += ręcznie rysowany glif "catalyst" (fasetowany kamień + iskra "+") —
  zgodnie z zakazem emoji/generycznych ikon z `craft-floor.md`, ta sama gramatyka co reszta typów.
- **`AnvilTab.tsx`** — `selectedCatalystIds: (string | null)[]` (stan lokalny, reset na zmianę
  wybranego przedmiotu ORAZ po każdej próbie ulepszenia, bo katalizatory i tak są zużywane).
  `handleDragEnd` rozgałęziony wg `over.data.current.type`: `"anvil"` (tylko `UPGRADABLE_TYPES`,
  jak dawniej) vs `"catalyst-slot"` (tylko `type === "catalyst"`, wg indeksu). Klik na katalizator
  w siatce "Ekwipunek do wyboru" (`handlePickerSelect`) trafia do pierwszego wolnego slotu zamiast
  ustawiać go jako cel ulepszenia. Siatka "Ekwipunek do wyboru" rozszerzona o `type === "catalyst"`
  (wcześniej tylko `UPGRADABLE_TYPES`) — item w slocie katalizatora jest z niej wykluczony (jak
  dotychczas wybrany przedmiot na kowadle), więc nie ma dwóch draggable tego samego id naraz.
  Szansa powodzenia pokazuje rozbicie "(baza X% + Y% z katalizatorów)" gdy `catalystBonusPct > 0`.

Zweryfikowane bezpośrednio w przeglądarce (konto testowe, dane sprzątnięte po teście, w tym
tymczasowa flaga `isTown` użyta tylko żeby dotrzeć do zablokowanego ekranu Kowadła — przy okazji
zgłoszone osobnym zadaniem w tle: `seed.ts` w ogóle nie tworzy żadnej krainy `isTown:true`, więc
Kowadło/NPC są dziś nieosiągalne na świeżo zasianej bazie): kliknięcie katalizatora w siatce
poprawnie trafia do pierwszego wolnego kwadratu; kwadrat materiału poprawnie pokazuje `7/2`;
kliknięcie umieszczonego katalizatora usuwa go i zwraca do siatki; pełne ulepszenie z katalizatorem
faktycznie zmniejszyło ilość katalizatora o 1, materiału o wymaganą ilość, złota o koszt, podniosło
przedmiot do +1, i wyczyściło sloty katalizatorów po próbie. `pnpm -r typecheck` czysto dla
`shared`/`api`/`web`.

### Fix: brak porównania statów/ostrzeżenia o klasie na kowadle (2026-08-20)

User zgłosił, że w zakładce Kowadło nie widać, czy przedmiot jest lepszy/gorszy od założonego, ani
ostrzeżenia "nie dla Twojej klasy" — mimo że ten sam `ItemTooltip`/`ItemBox` w zakładce Ekwipunek
to pokazuje. Przyczyna: `EquipmentTab.tsx` przekazuje do `ItemBox` propsy `equippedComparisonItem`
(co jest założone w tym samym slocie, do porównania statów) i `characterClassId` (do ostrzeżenia
o klasie) — `AnvilTab.tsx` nigdy tego nie przekazywało, więc `ItemTooltip` renderował się bez tych
sekcji na całym ekranie kowadła (siatka wyboru ORAZ sam slot kowadła).

Naprawione dokładnie tym samym wzorcem co `EquipmentTab.tsx`: `equippedComparisonItem =
UPGRADABLE_TYPES.has(item.type) ? byEquipSlot.get(item.type as EquipSlot) ?? null : undefined`
(katalizatory świadomie pomijają porównanie — nie są ekwipunkiem). Dla samego slotu kowadła dodany
dodatkowy warunek `selected.equippedSlot === null` — gdy na kowadle leży przedmiot, który jest
jednocześnie założony (przeciągnięty z lalki), porównywanie go z samym sobą nie ma sensu, więc
pomijane (ten sam warunek co dla renderu lalki w obu zakładkach).

Zweryfikowane w przeglądarce: hover na "Hełm Maga Wilków" (inna klasa niż postać) pokazuje "Nie
dla Twojej klasy (wymaga: Mag)"; hover na "Hełm Strażnika Twierdzy" (ten sam typ/klasa co założony,
wyższy tier) pokazuje deltę w nawiasie np. "Obrona: +4 (+3)". `pnpm --filter web typecheck` czysto.
Przy okazji, przy tym samym teście, naprawiono własną pomyłkę z poprzedniej sesji: skrypt sprzątający
po teście katalizatorów odjął złoto postaci testowej o więcej niż wcześniej dodał, zostawiając ją na
-100 złota — zresetowane do 0.

### Zakładka NPC: sztywne kwadraty ekwipunku + sklep w stylu ItemBox (2026-08-20)

User zgłosił dwie rzeczy w zakładce NPC: (1) siatka "Twój ekwipunek" ma za duże odstępy, (2)
towar handlarza powinien wyglądać jak ekwipunek gracza (małe kwadraty), z opcją pokazania itemu
jako już zestackowanego (np. 200 mikstur).

**Przyczyna (1)**: `NpcTab.tsx` używał `grid grid-cols-5` (tak jak `EquipmentTab.tsx`/`AnvilTab.tsx`),
ale w tamtych dwóch zakładkach panel z siatką siedzi w płaskim `flex flex-wrap` (panel kurczy się
do szerokości treści), a w NpcTab panele są w `grid lg:grid-cols-2` — każda kolumna dostaje SZTYWNO
50% szerokości strony, więc panel "Twój ekwipunek" rozciąga się dużo szerzej niż potrzebuje 5×56px
siatka. `grid-cols-5` dzieli tę szerokość na 5 RÓWNYCH części (`1fr` każda, ~82px zamiast 56px),
a każdy `GridSlot` (sztywne `w-14`) zostaje wyrównany do lewej wewnątrz dużo szerszego toru — stąd
wizualnie "za duże odstępy" (potwierdzone pomiarem `getBoundingClientRect` przed i po). Naprawione
zamianą na `grid-cols-[repeat(5,3.5rem)]` — sztywne tory 56px niezależnie od szerokości panelu,
sloty pakują się ciasno, nadmiar miejsca zostaje pustym marginesem z prawej, nie rozjeżdża siatki.

**Przyczyna (2) / redesign sklepu**: `ShopItemBox.tsx` (nowy) — 56×56px kwadrat w dokładnie tej
samej gramatyce co `ItemBox`: grafika itemu (`imageUrl`) albo `ItemTypeIcon`, cena w lewym górnym
rogu, `entry.stock` jako odznaka w prawym dolnym rogu (DOKŁADNIE tak jak plakietka ilości na
zestackowanym itemie w ekwipunku) — **żadne nowe pole w bazie nie było potrzebne**: `NpcShopItem.stock`
już istniało i już było edytowalne w `NpcsAdminPage.tsx` (puste = bez limitu/bez odznaki, liczba np.
200 = pokazuje się jako odznaka "200", dokładnie spełniając prośbę "żeby mikstury były już
zestackowane"; malejąca w miarę wykupywania, jak prawdziwy stack). Użyty prawdziwy `ItemTooltip`
(ten sam komponent co w ekwipunku) — hover pokazuje nazwę, typ, staty PRZY +0 (`interpolateUpgrade`
z poziomem ulepszenia 0, bo towar w sklepie jeszcze nie jest kupiony/ulepszony), oraz **ostrzeżenie
o niezgodności klasy** (nowa zapytanie `listPlayerClasses()` w `NpcTab.tsx`, budujące mapę
`classId → nazwa` — sklep dotąd tego nie sprawdzał wcale). Stary duży card (`rounded-xl`, 64px
ikona na szrafowanym tle, pełny opis pod spodem) usunięty, `ICON_BG` (był używany tylko tam) też.

Zweryfikowane w przeglądarce (tymczasowy testowy NPC z 2 towarami — mikstura ze `stock:200`,
hełm maga z `stock:null` — usunięty po teście): siatka "Twój ekwipunek" ma teraz `gridTemplateColumns:
"56px 56px 56px 56px 56px"` (wcześniej ~82px każda); kafelek mikstury pokazuje odznaki "200"/"10";
hover na hełm maga (inna klasa niż postać) pokazuje "Nie dla Twojej klasy (wymaga: Mag)" + realne
staty; kliknięcie kafelka nadal poprawnie otwiera `BuyItemModal` i realny zakup działa bez regresji.
`pnpm --filter web typecheck` czysto.

### Fix: to samo brakujące porównanie/ostrzeżenie o klasie, teraz w "Twój ekwipunek" w NPC (2026-08-20)

User zauważył, że po redesignie sklepu (wyżej) własny ekwipunek gracza w zakładce NPC dalej nie
pokazuje ostrzeżenia o klasie ani porównania statów, mimo że `ShopItemBox` to już miał. Ta sama
przyczyna co wcześniejszy fix na `AnvilTab.tsx`: `ItemBox` w siatce "Twój ekwipunek" nigdy nie
dostawał `equippedComparisonItem`/`characterClassId` — `NpcTab.tsx` w ogóle nie budował mapy
`byEquipSlot` (nie renderuje lalki ekwipunku, więc jej wcześniej nie potrzebował). Naprawione tym
samym wzorcem: nowy `EQUIPPABLE_TYPES` (lokalna kopia tej samej listy co w `AnvilTab`/`EquipmentTab`),
`byEquipSlot` budowany obok `byGridSlot` w tej samej pętli po `items`, propsy dopisane do `ItemBox`.

Zweryfikowane w przeglądarce: hover na "Hełm Maga Wilków" we własnym ekwipunku pokazuje "Nie dla
Twojej klasy (wymaga: Mag)"; hover na "Hełm Strażnika Twierdzy" pokazuje "+4 (+3)" względem
założonego hełmu. `pnpm --filter web typecheck` czysto.

### Fix: mikstury znikały z panelu podczas ekspedycji "w toku" (2026-08-20)

User zgłosił, że podczas trwającej ekspedycji panel "Aktywne mikstury" pokazuje puste sloty, mimo
że dziennik walki wyraźnie pokazuje ich zużycie. Przyczyna: cała walka jest symulowana i
ROZSTRZYGNIĘTA ATOMOWO w `startExpedition` w momencie kliknięcia "Rozpocznij walkę" — łącznie ze
zużyciem mikstur z aktywnych slotów (`tx.inventoryItem.delete`/`update` w tej samej transakcji, co
tworzy `Expedition`). Ekran "Ekspedycja w toku" tylko ANIMUJE już gotowy wynik, odsłaniając zdarzenia
stopniowo wg `elapsedSeconds` — ale `ActivePotionsSummary` odpytywał ŻYWY stan ekwipunku, który już
w chwili startu odzwierciedla stan PO całej walce. Jeśli mikstura skończyła się w trakcie (cały stos
zużyty → wiersz `InventoryItem` usunięty), slot pokazywał się jako pusty przez CAŁY czas oglądania
animacji walki, mimo że log właśnie pokazywał jej użycie.

Naprawione zrzutem stanu aktywnych slotów robionym PRZED zużyciem, przechowywanym niezależnie od
żywego ekwipunku:
- **Schemat** (`schema.prisma` + `schema.production.prisma`, addytywnie): `Expedition.potionSlotsSnapshot
  String @default("[]")` — JSON `{slotIndex, itemId, quantity}[]`.
- **Backend** (`modules/expeditions/service.ts`): `gatherCombatBuild` już i tak pobierał wszystkie
  itemy z `activeSlotIndex` (do zbudowania listy mikstur do symulacji) — teraz dodatkowo zwraca z
  tych samych danych gotowy snapshot (bez nowego zapytania do bazy), przekazywany przez
  `buildAndSimulate` do `startExpedition` i zapisywany na rekordzie ekspedycji RÓWNOLEGLE z jej
  utworzeniem, przed konsumpcją mikstur w tej samej transakcji. `getActiveExpedition` parsuje i
  zwraca to pole w DTO.
- **Frontend**: `ActivePotionsSummary.tsx` dostał opcjonalny prop `snapshot` — gdy podany (tylko
  ekran "Ekspedycja w toku" w `ExpeditionPanel.tsx`), renderuje z zamrożonych danych zamiast z
  żywego zapytania o ekwipunek, przez nowy lekki `SnapshotItemBox` (bo item mógł już fizycznie nie
  istnieć w ekwipunku — nie da się użyć prawdziwego `ItemBox`, który wymaga realnego
  `InventoryItemDto`; ikona/grafika rozwiązywana z katalogu przez `itemFor`, nie z żywego stanu).
  Ekran planowania (przed startem) używa tego samego komponentu BEZ propsu `snapshot` — tam żywe
  zapytanie jest poprawne i pożądane (pokazuje aktualny stan przed decyzją o starcie).

Zweryfikowane bezpośrednio przez prawdziwy `startExpedition()` (nie przez UI-only mock): postać
testowa z 1 miksturą (`hp_below`, próg 99%) w slocie 0 — po starcie walki wiersz `InventoryItem`
faktycznie zniknął z bazy (potwierdzone `null` przy ponownym odpytaniu), ale `getActiveExpedition`
nadal zwracał poprawny `potionSlotsSnapshot` z tą miksturą. W przeglądarce: ekran "Ekspedycja w
toku" pokazał miksturę w slocie 1 (`1` na plakietce) mimo że log walki potwierdzał "Użyto:
TestSnapshotPotion (+9)". Posprzątane (`leaveExpedition` + usunięcie testowego itemu). `pnpm -r
typecheck` czysto dla `shared`/`api`/`web`.

### Bot gracza — playtesting balansu i test obciążeniowy serwera (2026-08-20)

User poprosił o system botów grających w grę autonomicznie (postać → ekspedycje → punkty
umiejętności → zakupy u NPC → ulepszenia na kowadle) z raportem szczegółowości "do poziomu 10
potrzebowałem 10 min, zużyłem 200 miksturek i 3000 złota" — z dwoma celami: (1) test wczesnego
balansu gry, (2) test czy serwer nie zwalnia pod obciążeniem. Ustalone z userem przed
implementacją (AskUserQuestion): bot ma też docelowo działać przeciw prawdziwemu VPS-owi (nie
tylko lokalnie), na start budujemy jednego bota ze szczegółowym raportem (nie od razu rój N
botów).

**Kluczowa decyzja architektoniczna**: bot rozmawia z API przez PRAWDZIWE żądania HTTP (fetch +
Bearer token), dokładnie jak przeglądarka — nie woła bezpośrednio funkcji `service.ts` ani nie
dotyka bazy. To jedyny sposób, żeby jednocześnie zrealizować oba cele usera: test balansu musi
przejść przez te same reguły co prawdziwy gracz, a test obciążeniowy musi wygenerować prawdziwy
ruch sieciowy/DB, nie ominąć go. Bot też NIE przyspiesza czasu ekspedycji — czeka realnie do
`endsAt`, tak jak prawdziwy gracz czekałby (celowe: to jest miara realnego tempa gry, nie
teoretycznego minimum).

**Nowe pliki** (`apps/api/scripts/bot/`, poza `tsconfig.json`'s `include: ["src"]` — uruchamiane
bezpośrednio przez `npx tsx`, tak jak istniejące `prisma/scripts/*.ts`):
- **`client.ts`** — lekki typowany klient HTTP na 9 obszarach API (auth, postać, klasy, podróż,
  ekspedycje, sklep NPC, itemy/ekwipunek/kowadło, umiejętności, strefy) — zbudowany na podstawie
  pełnej inwentaryzacji REST API (deleguj do subagenta Explore, żeby nie zgadywać kształtów
  żądań/odpowiedzi). Auto-relogowanie przy 401 (access token wygasa po 15 min — długo trwający
  bot by inaczej się wywalił w połowie).
- **`report.ts`** (`BotReport`) — dziennik zdarzeń z znacznikami czasu + per-poziomowe rozbicie
  (czas/złoto zarobione-wydane/mikstury zużyte/liczba ekspedycji/błędy), generuje Markdown i JSON.
  Sekcja "Anomalie": poziomy, które trwały >2× medianę pozostałych — NIE zgaduje przyczyny
  (żadnej fabrykowanej narracji "bo X"), tylko wskazuje gdzie faktycznie warto zajrzeć.
- **`policy.ts`** (`runBot`) — pętla decyzyjna: wydaj punkty statystyk (główny stat klasy) →
  wydaj punkty umiejętności (najpierw nowe umiejętności, potem węzły drzewka, zachłannie od
  najtańszych) → załóż wolny ekwipunek pasujący do pustych slotów → w mieście dokup mikstury gdy
  zapas niski i włóż jedną do aktywnego slotu → spróbuj ulepszyć założone przedmioty na kowadle
  gdy stać na materiały+złoto → wybierz najsilniejszą dostępną krainę i walcz, czekaj na
  rzeczywisty koniec walki, odbierz nagrodę. Zatrzymuje się na docelowym poziomie albo po
  przekroczeniu jednego z dwóch niezależnych limitów bezpieczeństwa (czas ścienny, liczba
  ekspedycji) — bez nich zapętlony/utknięty bot działałby w nieskończoność.
- **`run.ts`** — CLI, konfiguracja przez zmienne środowiskowe (`BOT_BASE_URL`, `BOT_NAME`,
  `BOT_CLASS`, `BOT_TARGET_LEVEL`, `BOT_MAX_MINUTES`, `BOT_MAX_EXPEDITIONS`), zapisuje raport do
  `scripts/bot/reports/` (gitignored — to wynik testu, nie kod). Ostrzeżenie w konsoli, jeśli
  `BOT_BASE_URL` wygląda na produkcyjny adres.
- **`README.md`** — instrukcja użycia + jawnie spisane ograniczenia obecnej wersji (jeden bot na
  uruchomienie, brak automatycznego czyszczenia kont testowych, prosta/deterministyczna polityka).

**Dobór potworów do walki — świadomie ostrożny, po realnym teście dwóch wariantów**: pierwsza
wersja filtrowała `monster.level <= character.level` (tylko najsłabsze potwory w strefie) — dała
100% wygranych, ale bardzo wolny progres (utknięcie na poziomie 1 przez całe 5.5 min testu, 8
ekspedycji). Rozluźnienie do `<= character.level + 2` (żeby przyspieszyć) w realnym teście
odwróciło to w PRAWIE SAME PORAŻKI (0 pokonanych potworów w 7 z 9 ekspedycji) — realny sygnał, że
postać na poziomie 1 nie radzi sobie z potworami nawet 2 poziomy wyżej w tej strefie, ale zły
wynik dla samego bota (marnuje mikstury/złoto bez żadnego postępu, zaśmieca raport szumem
zamiast czystym sygnałem). Wrócono do `<= character.level` — konserwatywne, ale przewidywalne;
częste "BRAK ZWYCIĘSTW" w raporcie z tym ustawieniem samo w sobie jest wtedy realnym sygnałem
balansu wartym sprawdzenia, nie artefaktem zbyt agresywnej polityki bota.

Zweryfikowane bezpośrednio (3 uruchomienia przeciw lokalnemu dev, konta/postacie posprzątane po
teście): pełny cykl register → utwórz postać → podróż → ekspedycja (prawdziwy czas oczekiwania) →
odbiór nagrody → awans zadziałał od początku do końca bez ręcznej ingerencji; po drodze złapany i
naprawiony realny bug (puste ciało żądania z nagłówkiem `Content-Type: application/json` odrzucane
przez Fastify na endpointach bez body, np. `claim` — naprawione: nagłówek dodawany tylko gdy
faktycznie jest body); bot poprawnie ominął item zastrzeżony dla innej klasy, poprawnie zgłosił
nieudaną próbę ulepszenia (za mało złota) jako zdarzenie w raporcie, a nie awarię. Raport Markdown
wygenerował się poprawnie z tabelą per-poziom i pełnym dziennikiem.

**Nieuruchomione od razu**: bot celowo NIE został odpalony przeciw produkcyjnemu VPS-owi w tej
samej turze co implementacja — mimo że user potwierdził chęć takiego trybu, realne obciążenie
żywego serwera wymaga osobnej, jawnej zgody w momencie odpalenia, nie tylko ogólnej zgody na
architekturę. User potwierdził wprost w kolejnej wiadomości ("odpal bota na vps") — uruchomiony
przeciw `https://gra.riderx.ovh` (cel: poziom 10, limit 90 min / 300 ekspedycji), zdrowo ruszył
(rejestracja, postać, podróż, zakup mikstury, pierwsza ekspedycja) — dalszy przebieg poza zakresem
tej sesji.

### Panel admina "Serwer": obciążenie per moduł + uruchamianie botów (2026-08-20)

User poprosił o (1) narzędzie pokazujące obciążenie serwera per moduł ("co dokładnie sprawia
najwięcej problemów"), (2) opcję w panelu admina do uruchamiania N botów, (3) rozróżnienie
obciążenia TEJ aplikacji od obciążenia całego VPS-a przez inne rzeczy.

**Śledzenie per moduł** (`apps/api/src/lib/serverLoad.ts`, nowy) — globalny hook Fastify
`onResponse` (zarejestrowany jako PIERWSZY hook, żeby jego własny narzut nie obciążał losowo
wybranej trasy, i żeby łapał też żądania kończące się błędem) mierzy `reply.elapsedTime` dla
KAŻDEGO żądania, przypisuje do modułu wyliczonego z URL-a (`moduleForPath` — pierwszy segment
ścieżki, a dla `/api/admin/*` pierwsze DWA segmenty, żeby ~15 różnych ekranów admina nie zlewało
się w jeden worek). Agreguje w pamięci procesu (celowo nie w bazie — to telemetria operacyjna,
nie dane gry, restart serwera ma prawo to zerować): licznik/śr./maks. czas/błędy per moduł
(sortowalne wg ŁĄCZNEGO czasu — to jedna liczba, która realnie odpowiada na "co najbardziej
obciąża serwer", bo rzadko-ale-wolno i często-ale-szybko mogą mieć tę samą liczbę żądań a bardzo
różny wkład), plus rolling timeline co minutę (do 120 minut wstecz, per moduł).

**Proces vs cały VPS** — osobny sampler co 5s (`setInterval`, `unref()`-owany żeby nie blokował
zamknięcia procesu): `process.cpuUsage()`/`process.memoryUsage()` (WYŁĄCZNIE ten proces Node) i
`perf_hooks.monitorEventLoopDelay()` (opóźnienie event-loopa — najlepszy dostępny sygnał "czy TEN
proces jest przeciążony", niezależny od tego, co dzieje się gdzie indziej na maszynie) — obok
`os.loadavg()`/`os.freemem()` (CAŁA maszyna, wliczając wszystko inne tam działające). Panel
admina pokazuje obie kolumny osobno z wprost dopisaną instrukcją interpretacji: wysokie
obciążenie systemu + niskie CPU/event-loop-delay procesu API = winne jest coś innego na VPS-ie,
nie ta gra. `os.loadavg()` zwraca zawsze `[0,0,0]` na Windows (tylko Unix) — nieistotne w
praktyce, docelowe środowisko to Ubuntu na VPS-ie.

**Uruchamianie botów z panelu** (`apps/api/src/modules/admin/bots/`, nowy moduł) — `POST
/api/admin/bots/launch` (`LaunchBotsSchema` w `packages/shared`, limit 1-20 na wywołanie, twardy
serwerowy limit 20 działających naraz łącznie) spawnuje prawdziwe procesy potomne `npx tsx
scripts/bot/run.ts` (ten sam bot z poprzedniego zadania, bez zmian) przez `child_process.spawn`
z `shell: true` (żeby `npx`/`npx.cmd` rozwiązywało się poprawnie i na Windows dev, i na Linux
prod, bez rozgałęzień w kodzie). **Kluczowe**: `BOT_BASE_URL` spawnowanych botów to zawsze
`http://127.0.0.1:<PORT własnego procesu>` — boty odpalone z panelu ZAWSZE biją w serwer, na
którym działa panel, przez lokalny port, nigdy w zewnętrzny adres; jeśli panel działa na VPS-ie,
to jest to realne obciążenie TEGO VPS-a. Stan przebiegów (status, log stdout/stderr, kod wyjścia)
trzymany w pamięci (`Map`, nie baza — tak samo ulotne jak same boty), z limitem 1000 linii logu na
przebieg. `POST /:id/stop` zabija proces (`child.kill()`).

**Frontend**: nowa zakładka "Serwer" w `AdminSettingsPage.tsx` (`ServerAdminPage.tsx`) — sekcja
proces-vs-VPS, tabela obciążenia per moduł (z przyciskiem zerowania liczników — przydatne tuż
przed świadomym testem, żeby nie mieszać wyniku ze zwykłym ruchem sprzed testu), formularz
uruchamiania botów (liczba/klasa/docelowy poziom/limit czasu) + tabela przebiegów z rozwijanym
podglądem logu na żywo (`refetchInterval` 2-5s na wszystkich zapytaniach tej strony) i przyciskiem
zatrzymania działających.

Zweryfikowane bezpośrednio w przeglądarce (lokalny dev, konto testowe posprzątane po teście):
zakładka "Serwer" od razu pokazała realne dane (CPU/event-loop/pamięć procesu, obciążenie/wolna
pamięć systemu, tabelę modułów z prawdziwym ruchem z samej nawigacji po panelu); uruchomienie
bota z formularza faktycznie wystartowało proces potomny celujący we własny `127.0.0.1:4000`
(potwierdzone w podglądzie logu), status poprawnie przeszedł "Działa" → "Zatrzymany" po kliknięciu
"Zatrzymaj". `pnpm -r typecheck` czysto dla `shared`/`api`/`web`.

### Fix: bot padał na claim po realnym teście na VPS — clock skew (2026-08-20)

Bot uruchomiony przeciw `https://gra.riderx.ovh` faktycznie zagrał ~30 minut realnej gry (poziom
1→4, prawdziwe walki po 10-19 minut, zakupy, ulepszenia na kowadle, odblokowywanie umiejętności —
dokładnie taki raport, o jaki chodziło), po czym padł z `ApiError: Ekspedycja jeszcze trwa` (409)
na trzeciej próbie odebrania nagrody. Przyczyna: pętla oczekiwania w `runExpeditionCycle` decyduje
"czas minął" porównując `active.endsAt` (z serwera) z WŁASNYM zegarem bota (`Date.now()` na
maszynie, z której bot jest odpalony) — przy realnym rozjeździe zegarów między maszyną bota a
VPS-em (nawet ułamek sekundy) bot może uznać "koniec" chwilę PRZED tym, jak zgodzi się z tym
zegar serwera, więc `claimExpedition` odbija się o server-side'ową walidację "jeszcze nie". To
realny, spodziewany rodzaj problemu przy testowaniu przeciw prawdziwemu serwerowi z innej maszyny
— nie występuje na dev (bot i serwer na tym samym zegarze), stąd nie złapany wcześniej.

Naprawione retry z krótkim odczekaniem (do 5 prób, 500ms odstępu) WYŁĄCZNIE na 409 z
`claimExpedition` — każdy inny błąd nadal przerywa bota natychmiast (nie maskujemy prawdziwych
awarii). Zweryfikowane lokalnie (brak regresji — normalny przebieg nadal odbiera nagrodę za
pierwszym razem, retry po prostu nigdy się nie uruchamia gdy zegary się zgadzają).

### Zakładka "Serwer": drill-down w błędy per moduł (2026-08-20)

User zapytał, patrząc na tabelę modułów: skoro widać "inventory: 4 błędy (5.2%)", skąd wiadomo
CZEGO one dotyczą — tabela dotąd pokazywała tylko licznik, bez żadnych szczegółów.

**Backend** (`lib/serverLoad.ts`): nowy rolling bufor `recentErrors` (maks. 300 wpisów łącznie,
FIFO) — każdy wpis: znacznik czasu, moduł, metoda, ścieżka, kod statusu, i KOMUNIKAT wyciągnięty
z treści odpowiedzi. Hook zmieniony z `onResponse` na `onSend` — to jedyny hook Fastify, który
wciąż ma dostęp do treści odpowiedzi PRZED wysłaniem, więc dla statusów ≥400 parsuje JSON body i
wyciąga pole `error` (potwierdzone: cały ten codebase jednolicie kształtuje błędy jako `{ error:
"..." }` — globalny error handler, `requireAuth`/`requireRole`, notFoundHandler, i każdy route
rzucający własny `*Error` — więc to pokrywa praktycznie każdy błąd 4xx/5xx w aplikacji, nie tylko
niektóre). `reply.elapsedTime` dalej działa poprawnie w `onSend` (Fastify v5).

**Frontend**: liczba błędów w tabeli modułów to teraz przycisk — klik rozwija wiersz ze
szczegółową tabelką (kiedy/metoda/ścieżka/kod/komunikat) przefiltrowaną do tego jednego modułu,
najnowsze u góry.

Zweryfikowane w przeglądarce: moduł "other" (favicon/root — oczekiwany szum przeglądarki, nie
prawdziwy problem) pokazał po rozwinięciu dokładnie `GET /favicon.ico 404 Nie znaleziono`, `GET /
404`, `HEAD / 404` — dokładnie to pytanie usera ("skąd mam wiedzieć czego dotyczą") ma teraz
bezpośrednią odpowiedź w UI zamiast suchej liczby. `pnpm -r typecheck` czysto.

### Usuwanie kont z panelu admina + boty bez sztywnego limitu czasu (2026-08-20)

Dwie prośby usera, jedna z nich wywołana bezpośrednio przez to, co się właśnie stało: admin
odpalił z panelu bota celującego w poziom 50 na VPS-ie i trafił na `429 Rate limit exceeded, retry
in 6 minutes` przy REJESTRACJI — bo `/api/auth/register` ma dedykowany, ostrzejszy limit (10/10min,
`modules/auth/routes.ts`) niż globalny (200/min), a wszystkie boty odpalone z panelu łączą się z
tego samego adresu co sam serwer (`127.0.0.1`), więc dzielą jedną pulę limitu.

**Fix rate-limitu** (`plugins/security.ts`) — `allowList: ["127.0.0.1", "::1"]` na globalnym
rejestracji pluginu. Bezpieczne: prawdziwy ruch graczy zawsze idzie przez nginx, który przekazuje
prawdziwe IP klienta (`X-Forwarded-For`, honorowane przez `trustProxy: true` w `app.ts`) — więc to
NIGDY nie zwalnia z limitu realnego ruchu z internetu, tylko połączenia bezpośrednio na loopback,
czyli praktycznie wyłącznie własne narzędzia serwera (boty).

**Usuwanie kont** (`modules/admin/users/`, nowy moduł) — `GET /` (lista wszystkich kont: e-mail,
rola, liczba postaci, daty), `DELETE /:id` (natychmiastowe, trwałe — bez 30-dniowego okresu
karencji, jaki ma samoobsługowa prośba gracza w `modules/auth`). Sama operacja to
`prisma.user.delete()` — cały cascade (postacie, ekwipunek, ekspedycje, tokeny odświeżania,
zaproszenia do znajomych, polecenia) już był poprawnie zadeklarowany w schemacie
(`onDelete: Cascade` na każdej relacji wskazującej na User/Character), więc nie trzeba było ręcznie
kasować nic po kolei. Guard: admin nie może usunąć WŁASNEGO konta z tego panelu (400). Nowa sekcja
"Konta" w zakładce "Serwer" — szukajka po e-mailu (przydatna do namierzenia `@bot.test.local`),
`ConfirmModal` przed usunięciem.

**Boty bez sztywnego limitu czasu** — prawdziwy problem: bot i tak zawsze zatrzymuje się na
`targetLevel`, ale admin nie ma jak z góry zgadnąć, ile realnie zajmie dobicie do wysokiego
poziomu (obserwacja z wcześniejszego przebiegu: poziom 7→8 zajął już 30 minut), więc sztywny limit
czasu (poprzedni default: 60 min, twardy sufit: 600 min) po prostu ucinał bota w połowie drogi,
zanim doszedł do celu. `LaunchBotsSchema.maxMinutes` — teraz `min(0)` (0 = bez limitu, nowy
default), sufit podniesiony do 10080 (7 dni) dla tych, którzy jednak chcą ograniczony czas.
`scripts/bot/run.ts`: `maxMinutes > 0 ? maxMinutes * 60_000 : Infinity` — `Infinity` przechodzi
przez porównanie w pętli `policy.ts` bez żadnej specjalnej obsługi. Drugi, niezależny limit
bezpieczeństwa (`maxExpeditions`, domyślnie 200) zostaje zawsze aktywny — prawdziwy backstop
przeciwko faktycznie zapętlonemu botu, niezależnie od ustawienia czasu. Formularz w panelu: pole
liczby minut + checkbox "bez limitu" (domyślnie zaznaczony, wyłącza pole).

Zweryfikowane bezpośrednio: rejestracja z `127.0.0.1` już nie łapie 429 (potwierdzone przez realny
test lokalny); usunięcie jednorazowego konta testowego przez UI faktycznie skasowało wiersz w
bazie (`prisma.user.findUnique` po fakcie zwrócił `null`); próba usunięcia własnego konta admina
przez bezpośrednie zapytanie do API poprawnie odrzucona z 400. `pnpm -r typecheck` czysto,
standalone typecheck `scripts/bot/*.ts` czysto.

### Prawdziwa grafika zamiast CSS-owej aproksymacji ramki mapy ekspedycji (2026-08-20)

Bezpośrednia kontynuacja `docs/karty-wzor.md` (wcześniej tego dnia) — user wygenerował przez AI
narożnik wg promptu z tego dokumentu, przesłał plik, i poprosił o wdrożenie 1:1 zamiast dawnej
ręcznie rysowanej aproksymacji SVG w `OrnateCorners.tsx`.

**Problem z plikiem źródłowym**: PNG był w formacie RGBA (kanał alfa istnieje strukturalnie), ale
każdy piksel miał `alpha=255` — czyli technicznie "ma kanał alfa", ale realnie białe, w pełni
nieprzezroczyste tło (typowy efekt generatorów AI, które nie eksportują prawdziwej przezroczystości
mimo zapisu w formacie RGBA). Bez obróbki wyglądałby jako biały prostokąt na ciemnym tle gry.

**Usunięcie tła** — Python + Pillow (`pip install pillow`, brak innych zależności): próg wg
odległości koloru piksela od bieli (`dist = sqrt((255-r)² + (255-g)² + (255-b)²)`), z pasmem
przejściowym 25–85 dającym miękkie, antyaliasowane krawędzie zamiast twardego, postrzępionego
cięcia — piksele blisko białego (`dist≤25`) w pełni przezroczyste, piksele wyraźnie kolorowe
(`dist≥85`, np. jasne złote refleksy) zostają w pełni nieprzezroczyste, strefa pośrednia
interpoluje liniowo. Zadziałało czysto na obu wariantach usera bez widocznej białej obwódki —
zweryfikowane wizualnie przez złożenie na prawdziwym kolorze `ink` gry (`oklch(12% 0.02 45)`) i
przesłanie tego podglądu userowi. Następnie przycięte do faktycznego bounding-boxa treści
(`Image.getbbox()` na kanale alfa) — z 600×600 do 541×529, żeby rozmiar wizualny w kodzie
odpowiadał faktycznej zawartości, nie pustemu marginesowi.

**Integracja** — pierwszy w tym repo statyczny, budowany w kompilacji asset graficzny (`apps/web/src/assets/frames/corner-ornate.png`,
importowany przez Vite jak zwykły moduł — brak wcześniejszego precedensu, wcześniej całość grafiki
to albo ręcznie rysowane inline SVG, albo `imageUrl` wgrywane w runtime przez panel admina dla
itemów). `OrnateCorners.tsx` przebudowany z komponentu rysującego SVG na cztery `<img>` tego
samego pliku, obracane przez te same klasy CSS co poprzednio (`rotate-90`/`rotate-180`/
`-rotate-90`) — bo cały czas był to jeden wzór narożnika powielony w 4 miejscach, więc jeden plik
w pełni wystarcza na całą ramkę. `colorClassName` (tint przez `currentColor`, nie ma zastosowania
do rastrowego PNG) zastąpiony przez `opacity` — `PanelFrame.tsx` zaktualizowany analogicznie.
Rozmiar podniesiony z 36px/24px do 84px/56px (primary/secondary) — prawdziwa grafika ma dużo
więcej detalu niż poprzednia prosta linia, przy starym rozmiarze drobne zdobienia byłyby
nieczytelne.

Zweryfikowane strukturalnie w przeglądarce (zrzut ekranu niedostępny w tej sesji — pane
niewidoczny po stronie usera): wszystkie 4 `<img>` poprawnie się załadowały (`complete: true`,
`naturalWidth/Height` zgodne z przyciętym plikiem), poprawnie pozycjonowane i obracane na każdym
rogu panelu "Mapa ekspedycji". `pnpm --filter web typecheck` czysto.

### Upgrade ikon sidebaru z paczki `Tymczasowe/rpg_menu_design/` (2026-08-20)

User potwierdził chęć przejrzenia całego folderu z gotowym mockupem menu (`index.html` +
`icons/*`) i wdrożenia tym samym sposobem co narożnik mapy ekspedycji. Sidebar (`AppShell.tsx`)
już wcześniej w tej sesji dostał realną grafikę (`NavIconImg`, `/icons/nav/*.png`) dla części
linków — to zadanie to upgrade jakości tamtych plików + domknięcie jednego brakującego (Umiejętności).

**Inwentaryzacja 21 plików** (`python` skrypt, sprawdzenie wymiarów/trybu/realnej wariancji
kanału alfa dla każdego): 19 plików PNG miało już PRAWDZIWĄ przezroczystość (nie tylko format
RGBA jak przy narożniku — realnie zmienny alfa), 2 pliki `.jpg` (ranking, Handlarz potionami) nie
miały żadnego kanału alfa i wymagały usunięcia tła. 6 z 19 "przezroczystych" plików (poczta,
itemshop, targ, pulpit, wyzwania, przyjaciele — wszystkie 64×64) okazały się PUSTYMI placeholderami
(sam złoty pierścień, bez ilustracji w środku) — niegotowe do użycia, zgłoszone userowi wprost.

**Usunięcie tła z JPG-ów** — prostszy próg odległości-od-bieli (jak przy narożniku) nie wystarczał,
bo tło tych dwóch plików było jasnoszare/teksturowane, nie jednolicie białe. Zamiast tego:
`PIL.ImageDraw.floodfill` z 8 punktów startowych (rogi + środki krawędzi), tolerancja 28, wypełnienie
sentinelem, potem `alpha=0` tam gdzie sentinel — wypełnianie tylko POŁĄCZONEGO regionu tła (nie
globalny próg koloru), więc odporne na nierówne/teksturowane tło bez ryzyka ugryzienia w środek
ilustracji. Zadziałało czysto na obu plikach (zweryfikowane wizualnie na złożeniu z realnym
kolorem `ink` gry).

**Dopasowanie treści do slotów — świadome odejście od nazw plików**: `znajomi.png` okazał się
grafiką trzech portretów postaci (wojownik/mag/łotrzyk) — wizualnie dużo lepiej pasuje do
"Postacie" (lista postaci gracza) niż do "Znajomi". `postacie.png` to zaklęta księga z runami —
lepiej pasuje jako drugi kandydat na "Umiejętności" niż na "Postacie". Użyto treści zamiast nazw:
`znajomi.png` → slot `postacie.png`, dedykowany `umiejetnosci.png` (księga z kompasem) →
Umiejętności (naprawia wcześniejszy placeholder — ta zakładka używała dotąd ikony Postaci).
Link "Znajomi" w nawigacji zostawiony z dotychczasową ikoną — żaden z nowych plików nie pasował
lepiej, a `przyjaciele.png` (który mógłby być kandydatem z nazwy) to pusty placeholder.

**Kompresja** — pliki źródłowe 208×208–2048×2048, część >90KB, `ranking` przed kompresją 5MB.
Przeskalowane do maks. 300px (Pillow/LANCZOS) + `optimize=True` — `ranking.png` 5MB → 194KB,
`kowadlo.png` 600×600 → 300×300/155KB.

**Pozostałe 7 gotowych ikon reprezentujących niezbudowane jeszcze systemy** (Klan, PVP, Sklepy,
Aktywności, Misje, drugi wariant Shop, Wiadomości/poczta, plus portret "Handlarz potionami") —
świadomie NIE podpięte do żadnego nowego linku nawigacji ani nie skopiowane do `apps/web/public/`
— to by wymagało zbudowania faktycznych systemów (gildie, PVP, poczta, sklep, questy), nie tylko
ikon. Zostają w `Tymczasowe/` jako gotowy zapas na przyszłość, zgłoszone userowi wprost zamiast
ciche pominięcie albo ciche zbudowanie pustych ekranów bez pytania.

Zweryfikowane w przeglądarce: wszystkie ikony sidebaru (`nav img`) załadowały się poprawnie
(`complete: true`) z nowymi, większymi `naturalWidth` (208-300px zamiast starych 96px) —
potwierdza podmianę, nie tylko podmianę pliku pod starą nazwą. `pnpm --filter web typecheck`
czysto.

### Diagnoza: 20 botów na VPS ubite w trakcie testu, panel admina pokazał zero (2026-08-20)

User odpalił 20 botów celujących w poziom 50 — najwyższy osiągnięty poziom to 11, a panel admina
("Panel Serwer" → Boty) po fakcie nie pokazywał ŻADNEGO uruchomionego bota, mimo że część
powinna wciąż działać. Diagnoza z przeglądu kodu (bez bezpośredniego dostępu do VPS w tej
sesji): `runs`/`processes` w [service.ts](../apps/api/src/modules/admin/bots/service.ts) to
zwykłe `Map` w pamięci procesu API — z założenia (`docstring` pliku) nie przeżywają restartu
serwera. `deploy/mmo-api.service.example` to jednostka systemd z `Restart=on-failure` i
domyślnym `KillMode=control-group`, który przy restarcie zabija CAŁĄ cgroupę procesu, czyli
także wszystkie procesy-dzieci (boty) uruchomione przez `spawn()`, nawet bez `detached:true`.
Najbardziej prawdopodobny łańcuch zdarzeń: 20 równoczesnych `npx tsx scripts/bot/run.ts` to w
praktyce ~40 procesów odpalających się jednocześnie (`npx` samo w sobie tworzy osobny proces do
rozwiązania pakietu przed delegacją do `tsx`) — realny skok obciążenia CPU/RAM na skromnym VPS,
prawdopodobnie crash API → restart przez systemd → cgroup kill zabija boty razem z restartem →
`runs` Map startuje pusta w nowym procesie.

Trzy niezależne poprawki w `service.ts`, bez zmiany API/kontraktu panelu:
1. **`node_modules/.bin/tsx` zamiast `npx tsx`** — usuwa zbędny drugi proces per bota (`npx`
   resolution), realnie połowa liczby jednocześnie startujących procesów przy tym samym `count`.
2. **Stopniowanie startu** (`await sleep(250)` między kolejnymi `spawn()`) — rozkłada skok
   obciążenia zamiast odpalać N procesów w jednej klatce zdarzeń.
3. **Trwały log wyjścia bota przez `logAction`** (zapis do tabeli `GameLog`, przeżywa restart —
   w przeciwieństwie do `runs` Map) — nawet gdy cały proces API padnie i zabierze ze sobą
   pamięciowy stan panelu, w logu akcji zostaje ślad który bot wystartował i czy/jak się
   zakończył, zamiast całkowitej ciszy jak w tym incydencie.

Nie zmieniono (świadomie, poza zakresem tej poprawki): domyślny `MAX_CONCURRENT=20` — bez
dostępu do realnych specyfikacji VPS nie ma podstawy do wyboru innej liczby, a stopniowanie +
tańszy spawn powinny znacząco obniżyć szczytowe obciążenie przy tej samej liczbie botów.
Ewentualne raporty ukończonych botów sprzed crasha mogą wciąż leżeć na VPS w
`apps/api/scripts/bot/reports/*.md` (zapis na dysk, nie do pamięci procesu) — do sprawdzenia
bezpośrednio na serwerze. `pnpm --filter api exec tsc --noEmit` czysto.

### Grafiki itemów: 107 istniejących + 7 nowych, na razie tylko `dev.db` (2026-08-20)

User wygenerował 17 ikon przedmiotów (AI, prompty w [karty-wzor.md](karty-wzor.md)) — po jednej
na każdy `ItemTypeSchema`. Odkrycie po przejrzeniu realnych danych: `weapon`/`armor`/`helmet` w
tym katalogu (179 itemów, 10 stref × warianty) kodują w NAZWIE 4 różne wizualnie podtypy każdy
(np. weapon: Różdżka/Topór/Miecz/Sztylet — to nie to samo, mimo tego samego `type` w bazie), więc
jedna wygenerowana ikona pasuje tylko do JEDNEGO z tych podtypów, nie do wszystkich. Przypisano
więc obraz tylko tam gdzie nazwa faktycznie pasuje (`Miecz *`, `Ciężka Zbroja *`+`Płytowa Zbroja
*`, `Hełm Wojownika *`+`Hełm Strażnika *`) — Różdżki/Topory/Sztylety/Szaty/Skórzane
zbroje/hełmy Maga i Łotrzyka świadomie zostały bez obrazu zamiast dostać mylącą grafikę. Typy bez
podtypów w nazwie (`boots`, `necklace`, `earrings`, `ring`, `material`) dostały jedną ikonę
zbiorczo na wszystkie warianty strefowe — tu nie ma ryzyka niedopasowania. `consumable`:
przypisano czerwoną miksturę tylko do "Mikstury Życia" (kolor semantycznie = zdrowie), NIE do
"Mikstury Many"/"Eliksiru Szybkości" (błędny kolor byłby mylący, wymagają osobnych ikon).
Razem: 107 itemów z obrazem.

7 typów (`shield`, `rod`, `pickaxe`, `bait`, `catalyst`, `book`, `quest`) nie miało w bazie ANI
JEDNEGO przedmiotu — ikona nie miała się do czego przypiąć. Za zgodą usera utworzono po jednym
nowym itemie na typ, z ostrożnymi wartościami wzorowanymi na najsłabszym istniejącym tierze
(Wilcze Uroczysko, `Miecz Wilków`/`Ciężka Zbroja Wilków`/`Mikstura Życia` jako punkt odniesienia
dla rzędu wielkości statów): `Tarcza Wilków` (defense 4→6, jak inny sprzęt), `Wędka Rybaka` /
`Kilof Górnika` (5%/5% bonus do prędkości/szansy zbiórki), `Przynęta Rybacka` (5% bonus szansy,
`stackable:false` — [gathering/service.ts](../apps/api/src/modules/gathering/service.ts) już
dokumentuje że bait nie jest zużywany, tylko sprawdzany obecnościowo w aktywnym slocie),
`Iskra Kowalska` (katalizator, 5% bonus szansy ulepszenia, `stackable:true` — potwierdzone w
[inventory/service.ts:527](../apps/api/src/modules/inventory/service.ts) że katalizator JEST
zużywany przy ulepszeniu), `Podręcznik Rybaka` (`bookSkillTypeId` = realny `PassiveSkillType`
"Rybak" z bazy, `bookSuccessChance:0.7`), `Zapieczętowany Zwój` (quest, `sellPrice:0` — questowe
przedmioty nie powinny być sprzedawalne). Wszystkie oznaczone jako punkt startowy do
wyregulowania przez usera, nie finalny balans.

**Tylko `dev.db` (lokalna baza SQLite)** — sprawdzone przez `DATABASE_URL` w `.env` przed
uruchomieniem, żadna operacja nie dotknęła produkcyjnego Postgresa na VPS. Zweryfikowane w
przeglądarce: prawdziwe obrazy ładują się poprawnie w ekwipunku (`complete:true`,
`/uploads/items/...`), itemy bez przypisanej grafiki poprawnie pokazują dotychczasowy generyczny
placeholder zamiast błędu.

Do synchronizacji z produkcją: [seed-item-images.ts](../apps/api/scripts/seed-item-images.ts) —
idempotentny skrypt (pomija itemy które już mają `imageUrl`, pomija tworzenie itemu o nazwie
która już istnieje), do uruchomienia bezpośrednio na VPS po ręcznym `scp` 17 plików PNG z
`Tymczasowe/ikony/clean/` do katalogu na serwerze (patrz docstring w pliku). Nie uruchomiony
automatycznie w tej sesji — brak bezpośredniego dostępu do VPS z tego środowiska.

### Ramka kwadratów itemów: druga próba, tym razem prawdziwym assetem (2026-08-20)

Pierwsza próba: podmiana `SocketCorners` (róg gniazda itemu — sloty ekwipunku, siatka
ekwipunku, aktywne sloty, slot kowadła; ~56px kwadraty) z prostego rysowanego SVG na to samo
zdobione, grawerowane złoto co `OrnateCorners` (ramka mapy ekspedycji) — **cofnięta po
wizualnej weryfikacji w realnym rozmiarze**: gęsto rzeźbiona grafika w 20px robi się rozmazaną
plamą, dokładnie odwrotny problem niż przy mapie (tam było za dużo pustego miejsca na prosty
rysunek, tu jest za mało miejsca na gęsty detal). Test wykonany PRZED wdrożeniem —
`PIL.Image.alpha_composite` symulujący realny render 56px kwadratu z 20px rogiem, nie ocena
"na oko" ze źródłowego pliku.

User przesłał drugi, własny obraz — cieńszy, prostszy brązowo-złoty narożnik ramki z małym
zdobieniem-listkiem (nie generowany od zera na to zamówienie, użytkownik wyciął go sam z
własnej grafiki mikstury). Ten sam test przy 56px/20px wypadł czytelnie (cienkie linie, mały
zwarty ornament — inaczej niż gęsty engraving). Wdrożony jako
`apps/web/src/assets/frames/socket-corner.png` + przepisany `SocketCorners.tsx`.

Różnica techniczna względem `OrnateCorners`: narożniki tu są **odbijane lustrzanie**
(`scaleX`/`scaleY`), nie obracane — źródło to róg PROSTOKĄTNEGO obramowania z liniami
biegnącymi wzdłuż prawej i dolnej krawędzi; obrót 90°/180° skierowałby te linie w złą stronę,
odbicie zachowuje kierunek linii na każdym z 4 rogów.

Zweryfikowane w przeglądarce: 192 `<img src=".../socket-corner...">` na stronie ekwipunku,
wszystkie `complete:true`, poprawne macierze transformacji (`scaleX(-1)`/`scale(-1,-1)`/
`scaleY(-1)`). `pnpm --filter web exec tsc --noEmit` czysto.

### Bot: sprzedaje loot złej klasy zamiast bez końca próbować go założyć (2026-08-20)

Diagnoza realnego przebiegu na VPS (log jednego bota, patrz rozmowa) pokazała, że progres wcale
nie był zablokowany — jedna ekspedycja legalnie trwała 30 minut (100 potworów w kolejce, event
x10 realnie zadziałał: +15000 exp zamiast +1500). Jedyna prawdziwa nieefektywność: `equipStarterGear`
([policy.ts](../apps/api/scripts/bot/policy.ts)) co cykl na nowo próbowała założyć KAŻDY
niezałożony przedmiot pasującego typu, w tym loot innej klasy (drop nie jest filtrowany po
klasie), zawsze dostając 400 "Ten przedmiot jest dostępny tylko dla innej klasy postaci" —
nieszkodliwe dla postępu, ale zaśmiecało log błędów i trwale zajmowało miejsce w ekwipunku bez
żadnej korzyści.

Naprawione: `item.classId` (ograniczenie dotyczy tylko `weapon`/`armor`/`helmet`, patrz
`CreateItemSchema`) sprawdzane PRZED próbą equip — przy niezgodności z klasą postaci bot od razu
sprzedaje przedmiot (`POST /:characterId/sell`, nowa metoda `GameClient.sellItem`) zamiast w ogóle
próbować go założyć. Zero dodatkowych błędów equip w logu dla tego przypadku, plus realny zwrot
złota zamiast martwego balastu w ekwipunku.

Przy okazji: sprzedaż wymaga `item.sellPrice > 0` ([inventory/service.ts](../apps/api/src/modules/inventory/service.ts)
`sellItem`) — jedyny item w całej bazie z `sellPrice: 0` to nowo utworzony w tej sesji
"Zapieczętowany Zwój" (quest). Na wyraźną prośbę usera ("każdy item ma mieć ustawioną symboliczną
kwotę") poprawione na `sellPrice: 1` — zarówno w `dev.db`, jak i w
[seed-item-images.ts](../apps/api/scripts/seed-item-images.ts) (żeby produkcyjna synchronizacja
nie odtworzyła starej wartości). `pnpm --filter api exec tsc --noEmit` czysto; pełny przebieg
bota na żywo (30+ minut do napotkania pierwszego dropu złej klasy) nie uruchomiony ponownie w
tej sesji — logika zweryfikowana przeglądem kodu + już wcześniej potwierdzonym działaniem samego
endpointu sprzedaży.

### Produkcja miała itemy z sellPrice=0 — nowy skrypt naprawczy (2026-08-20)

Po odpaleniu poprawionego bota (sprzedaje loot złej klasy) na VPS, log serwera pokazał 400 "Ten
przedmiot nie ma ustalonej wartości sprzedaży" — czyli produkcyjny katalog itemów ma co najmniej
jeden przedmiot z `sellPrice <= 0`, którego `dev.db` NIE ma (lokalnie tylko jeden item miał tę
wartość, już naprawiony). Bez dostępu do bazy produkcyjnej z tej sesji nie da się ustalić który
to konkretnie item — dodany [fix-sell-prices.ts](../apps/api/scripts/fix-sell-prices.ts), prosty
idempotentny skrypt (`UPDATE items SET sellPrice=1 WHERE sellPrice<=0`, wypisuje co poprawił) do
uruchomienia na VPS: `npx tsx scripts/fix-sell-prices.ts`. Nie wymaga plików ikon (w
przeciwieństwie do `seed-item-images.ts`) — można odpalić od razu, niezależnie od kolejności z
synchronizacją grafik.

### Bug w całej apce: kolory oklch nie wspierały modyfikatora przezroczystości (2026-08-20)

Zgłoszenie "itemy w eq mają białe ramki" doprowadziło do dużo szerszego znaleziska niż same
itemy. `apps/web/tailwind.config.js` definiował kolory jako gołe stringi (`gold: { DEFAULT:
"oklch(76% 0.09 85)" }` itd.) — Tailwind 3 potrafi automatycznie wstrzyknąć kanał alfa dla
modyfikatora `/NN` (np. `border-gold/40`) tylko dla kolorów w formacie hex/rgb; dla dowolnego
innego formatu CSS (w tym `oklch()`) po prostu **cicho nie generuje żadnej reguły** dla wariantu
z `/NN` — bez błędu, bez ostrzeżenia. Efekt: KAŻDA klasa `coś-token/NN` w całej aplikacji
(`border-gold/40`, `bg-rarity-rare/10`, dziesiątki miejsc) nie miała żadnego efektu, element
padał na domyślny kolor obramowania przeglądarki/Tailwina (blady szary, stąd "białe ramki").
Niezauważone wcześniej, bo generyczna ikona typu + cienka ramka nie kontrastowały wystarczająco
żeby to rzucało się w oczy — dopiero prawdziwa, kolorowa grafika itemu to uwidoczniła.

Naprawa u źródła: każdy kolor w configu zamieniony na funkcję `({opacityValue}) =>` (oficjalny,
udokumentowany sposób Tailwina na kolory w formatach spoza hex/rgb) zamiast gołego stringa —
dotyczy WSZYSTKICH tokenów (`ink`, `panel`, `panel-raised`, `line`, `line-soft`, `gold`,
`parchment`, `hp`, `mp`, `rarity`), nie tylko tych użytych w Item Box. Naprawia to każde miejsce
w aplikacji używające tej składni, nie tylko zgłoszony przypadek.

**Ważne dla przyszłych zmian configu**: sama zmiana `tailwind.config.js` + HMR ("page reload"
w logu Vite) NIE wystarczyła — Tailwind/PostCSS trzymał stary, przeliczony config w pamięci
procesu i nie przegenerował klas mimo sygnału przeładowania strony. Wymagany był pełny restart
procesu dev servera (`preview_stop` + `preview_start`), dopiero po nim `oklch(76% 0.09 85)` w
wygenerowanym CSS zamieniło się na `oklch(0.62 0.09 250 / var(--tw-border-opacity, 1))` z
realną obsługą `/NN`. Zweryfikowane bezpośrednio w przeglądarce: `getComputedStyle` na kwadracie
itemu z realną grafiką pokazuje teraz `oklch(0.62 0.09 250 / 0.5)` (border) i
`oklch(0.62 0.09 250 / 0.1)` (tło) zamiast domyślnego `rgb(229, 231, 235)`/przezroczystego tła.
`pnpm --filter web exec tsc --noEmit` czysto.

### Podwójna ramka na mapie ekspedycji + mikstury realnie ubywają w trakcie walki (2026-08-20)

**Narożniki mapy ekspedycji niespójne z ramką** — [PanelFrame.tsx](../apps/web/src/components/common/PanelFrame.tsx)
przy `cornerStyle="ornate"` rysowało DWIE linie ramki naraz: zewnętrzną `border-gold/40` na całym
panelu ORAZ dodatkową `inset-1 border-gold/20` (osobny div, 4px w głąb) leżącą bezpośrednio pod
84px grafiką `OrnateCorners`. Ponieważ grafika narożnika ma własne przezroczyste prześwity (to nie
pełny kwadrat, tylko wycięty kształt), prosta linia CSS pod spodem przebijała się przez te
prześwity w innym miejscu niż własne linie rytego wzoru — dwie ramki nie na tej samej pozycji,
efekt "nie pasują do siebie" widoczny na screenie usera. Usunięty osobny `inset-1` div — sama
grafika narożnika + jedna zewnętrzna linia wystarczają, bez konkurującego elementu pod spodem.
Zweryfikowane w przeglądarce: `insetDivCount: 0` na panelu "Mapa ekspedycji", tylko
`border-gold/40` zostaje.

**Pasek mikstur nie ubywał w trakcie walki** — to był świadomy uproszczony stan (etykieta wprost
mówiła "mogły już zostać zużyte"), bo cała walka liczy się atomowo na starcie
([expeditions/service.ts](../apps/api/src/modules/expeditions/service.ts)), więc żywe zapytanie o
ekwipunek pokazywałoby od razu stan PO walce przez cały czas trwania ekranu "w toku". Rozwiązanie:
symulacja walki już generuje zdarzenie `potion_used` z realnym znacznikiem czasu `t`
([combat.ts](../apps/api/src/modules/expeditions/combat.ts)), a `ExpeditionPanel.tsx` już liczy
`revealedEvents` (zdarzenia odsłonięte do bieżącego, tykającego czasu — używane m.in. przez
`CombatLog`) — wystarczyło przekazać tę samą tablicę do `ActivePotionsSummary` i odjąć od
snapshotu startowego te `potion_used`, które już "się wydarzyły" wg klienckiego zegara. Zdarzenie
nie niesie `inventoryItemId` (tylko `itemName`), więc dopasowanie do slotu jest po nazwie, z
rozdzielaniem zużycia po kolejności `slotIndex` gdyby dwa sloty trzymały ten sam item (rzadki
przypadek). Pasek teraz realnie się zmniejsza w czasie rzeczywistym, znika przy 0 zamiast pokazywać
"0" pusty kafelek; etykieta zmieniona na "na bieżąco w trakcie walki". `pnpm --filter web exec tsc
--noEmit` czysto.

### Ramka mapy ekspedycji: druga poprawka — usunięta CAŁA linia obramowania (2026-08-20)

Usunięcie podwójnej linii (poprzedni wpis) nie wystarczyło — user przesłał kolejny screen,
narożniki dalej "niespójne". Prawdziwy problem: nawet JEDNA cienka linia CSS (`border-gold/40`,
1px) obok grubego, teksturowanego, rytego bractu (`corner-ornate.png`, ramiona ~84px) zawsze będzie
wyglądać jak dwa różne elementy sklejone razem — różnica w "wadze" wizualnej (gruby engraving vs
włosowa linia) jest zbyt duża, żeby to się kiedykolwiek zlało w jedną spójną ramkę, niezależnie od
pozycjonowania. Usunięty CAŁY zewnętrzny `border` dla `cornerStyle="ornate"` — panel trzyma się
teraz wyłącznie na `bg-panel` (kontrast wobec `ink` w tle) + cień + grafika narożników, bez żadnej
prostej linii do konkurowania z ornamentem. Dokładnie ten sam wzorzec ("same rogi, bez ciągłej
linii") już zaakceptowany wcześniej dla kwadratów itemów (`SocketCorners`). Zweryfikowane:
`getComputedStyle` na panelu "Mapa ekspedycji" pokazuje `borderWidth: 0px`. `pnpm --filter web
exec tsc --noEmit` czysto.

### Prawdziwa ramka 9-slice: narożnik + paski krawędzi (2026-08-20)

User przesłał paski krawędzi (2 warianty: w pełni zdobiony vs zdobione końce + gładki środek) i
teksturę wypełnienia — zbudowana prawdziwa ramka łącząca narożniki w spójną całość, zamiast
samotnych rogów na płaskim tle.

**Wybór wariantu paska**: zdobione-końce+gładki-środek (nie w-pełni-zdobiony) — narożnik
(`corner-ornate.png`) już ma bogate zdobienia na swoich ramionach, więc pasek z ornamentem na
CAŁEJ długości powielałby wzór dokładnie tam gdzie się stykają. Gładki środek to właściwy
kandydat na powtarzalny łącznik.

**Przygotowanie assetu** (skrypt roboczy w `Tymczasowe/`, nie w repo): usunięcie szachownicy z JPG
(ten sam problem co przy ikonach itemów), przycięcie do realnej zawartości (pierwsza próba dała
błędny bbox przez pojedynczy odizolowany artefakt-piksel wymuszający zbyt wysoki crop —
naprawione filtrowaniem wierszy po gęstości nieprzezroczystych pikseli, nie samym bbox). Środkowy
gładki fragment (organiczna, "brudna" tekstura metalu, nie geometryczny wzór) wygładzony technika
"offset-and-heal" (przesunięcie o połowę szerokości + liniowe blendowanie pasa wokół nowego szwu w
środku) — zmierzona różnica lewej/prawej krawędzi spadła do ~3.0/255, zweryfikowana wizualnie
kafelkiem 3x bez widocznego twardego szwu.

**Nowy komponent** [OrnateEdges.tsx](../apps/web/src/components/common/OrnateEdges.tsx) — 4 pasy
(`absolute`, pozycjonowane między narożnikami) z `background-repeat: repeat-x`/`repeat-y`.
Pionowe krawędzie używają OSOBNEGO, wstępnie obróconego o 90° pliku (`panel-edge-vertical.png`),
nie transformacji CSS na powtarzającym się tle — obrót przez CSS wymagałby znajomości
wyrenderowanej wysokości kontenera w czasie budowania stylu, obrócony plik działa niezależnie od
wysokości panelu. **Ważne dla przyszłych zmian**: pozycjonowanie zależne od `cornerSize` jest przez
inline `style`, NIE przez dynamiczne klasy Tailwind (`left-[${cornerSize}px]`) — skaner Tailwinda
nie widzi dynamicznie budowanych stringów szablonowych i po cichu nie wygeneruje żadnego CSS,
dokładnie ta sama klasa błędu co naprawiony wcześniej problem z kolorami oklch.

**Tekstura wypełnienia — NIEwdrożona**: plik przesłany przez usera, wcześniej zweryfikowany
pikselowo jako bezszwowy (`0.0` różnicy na krawędziach), okazał się przy faktycznym użyciu
zawierać zupełnie inny obrazek (fiolkę mikstury) — narzędzie usera do usuwania tła nadpisało ten
sam plik (powtarzalna nazwa UUID) między momentem weryfikacji a momentem kopiowania do repo.
Złapane PRZED wysłaniem do usera dzięki złożeniu testowego mockupu całej ramki w Pillow przed
zgłoszeniem gotowości — mockup pokazał powielone fiolki zamiast kamienia. `PanelFrame.tsx` w
międzyczasie zostaje przy płaskim `bg-panel`; import tekstury i jej wpięcie do stylu inline
świadomie wycofane (nie tylko zakomentowane) żeby build nie zależał od brakującego pliku.
Zweryfikowane: mockup Pillow z narożnikami+paskami na płaskim tle (bez błędnej tekstury) wygląda
spójnie — rogi płynnie łączą się z paskami, ta sama grubość linii. W przeglądarce: panel "Mapa
ekspedycji" ma 10 dzieci (4 paski + 4 narożniki + nagłówek + treść), wszystkie 3 nowe pliki
(`panel-edge.png`, `panel-edge-vertical.png`) ładują się 200 OK. `pnpm --filter web exec tsc
--noEmit` czysto.

### Tekstura wypełnienia: dogrywka po nadpisanym pliku, z korekcją winiety (2026-08-20)

User wskazał ten sam plik, który wcześniej flagowałem jako nienadający się do kafelkowania
(wyraźna winieta: jasny środek, ciemne rogi — zmierzone wcześniej jako różnica jasności środek
vs róg ~19/255). Zamiast prosić o kolejny plik, spróbowano naprawić ten — **korekcja pola
płaskiego** (flat-field): podzielenie obrazu przez jego własną, mocno rozmytą kopię
(`GaussianBlur(radius=120)`, przechwytuje tylko powolną zmianę oświetlenia, nie fakturę kamienia),
przywrócone do docelowej jasności. Winieta spadła do różnicy ~3/255 między środkiem a rogami —
potwierdzone liczbowo i wizualnie. Dopiero POTEM wycięty kafelek (800×800) i wygładzony tą samą
techniką offset-and-heal co pasek krawędzi (na obu osiach tym razem, nie tylko poziomej) — różnica
lewa/prawa i góra/dół krawędzi ~3.0/255, zweryfikowana wizualnie kafelkiem 3×3 (brak widocznego
szwu ani powtarzającego się "gorącego punktu").

Wpięte do `PanelFrame.tsx` (`backgroundImage` inline style, `background-repeat: repeat`,
analogicznie do `bg-panel` które zastępuje tylko dla `cornerStyle="ornate"`). Zweryfikowane PRZED
wysłaniem — kolejny mockup Pillow (narożnik + paski + prawdziwa tekstura razem) tym razem pokazał
poprawną fakturę kamienia, nie pomyłkowy plik jak poprzednio. W przeglądarce: `background-image`
panelu wskazuje na `panel-fill.png`, request 200 OK. `pnpm --filter web exec tsc --noEmit` czysto.

### Limit jednoczesnych botów: ze stałej w kodzie na ustawienie admina (2026-08-21)

User poprosił o podniesienie limitu z 20 na 100, potem doprecyzował: lepiej jako ustawienie, które
admin może sam zmieniać, niż kolejna sztywna liczba w kodzie wymagająca redeploya za każdym razem.

Nowy klucz w istniejącym mechanizmie `Settings` (ten sam wzorzec co
`expedition.defaultDurationMinutes`/`gathering.settings`/`referral.settings`) —
`bots.maxConcurrent` w [settings/service.ts](../apps/api/src/modules/settings/service.ts),
domyślnie 20 (bez zmiany zachowania dla kogoś kto nigdy tego nie ustawi), z twardym pułapem 500
w walidacji (zabezpieczenie przed przypadkowym wpisaniem absurdalnej liczby, w świetle
wcześniejszego incydentu przeciążenia VPS przy 20 botach). `modules/admin/bots/service.ts`
(`launchBots`) czyta ten limit dynamicznie zamiast stałej `MAX_CONCURRENT=20` — jedyna zmiana w
logice uruchamiania. `LaunchBotsSchema.count` (walidacja Zod, statyczna z natury) poluzowana z
`max(20)` na `max(500)` żeby móc w ogóle wysłać wyższą wartość do backendu — rzeczywisty limit
i tak wymuszany dynamicznie w serwisie, nie w schemacie.

Panel admina (Serwer → Boty): nowe pole "Limit jednoczesnych botów" z przyciskiem Zapisz obok
formularza uruchamiania, `max` na polu "Liczba botów" i opis "Maks. N działających naraz" czytają
teraz wartość z ustawienia zamiast sztywnej liczby. Zweryfikowane w przeglądarce: zmiana 20→100,
zapis, natychmiastowe odświeżenie opisu na "Maks. 100 działających naraz" (round-trip PUT→GET
przez React Query invalidation). `pnpm --filter shared build` (dist musi być przebudowany, api/web
importują skompilowany JS, nie źródło TS) + `tsc --noEmit` czysto na `shared`/`api`/`web`.

### Tło strony ujednolicone do neutralnego #1d1d1d wszędzie (2026-08-21)

Panel admina i reszta gry miały RÓŻNE kolory tła strony: gra używała ciepłego `ink`
(`oklch(12% 0.02 45)`, część "Torchlit Arena Ledger"), admin miał osobny override w
`index.css` (`.admin-scope { background-color: oklch(12% 0 0) }`, neutralna szarość — to co
user nazwał "#1d1d1d"). User poprosił o ujednolicenie tła NA CAŁEJ stronie do wariantu admina —
dopytany wprost czy to ma też objąć karty (`panel`/`bg-panel`, cieplejsze i jaśniejsze), odpowiedź:
nie, tylko tło strony, karty zostają jak są (osobny temat na przyszłość).

Zmiana: `ink` w `tailwind.config.js` zmieniony z `oklch(12% 0.02 45)` na `oklch(12% 0 0)` —
skoro to JEDEN token używany wszędzie przez `bg-ink` (AppShell), zmiana u źródła ujednoliciła tło
automatycznie na każdej stronie/zakładce bez dotykania pojedynczych komponentów. Usunięty stał się
zbędny osobny override w `.admin-scope` dla `ink`/`bg-ink` (ta sama wartość co nowy globalny
token) — zostawiony tylko override dla `.panel`/`.bg-panel` (karty, świadomie nietknięte).
Zweryfikowane w przeglądarce: `.bg-ink` liczy się teraz na `oklch(0.12 0 0)` wszędzie (sprawdzone
na elemencie spoza panelu admina). Wymagał pełnego restartu dev servera (ta sama przyczyna co
poprzednia poprawka kolorów — Tailwind trzyma przeliczony config w pamięci procesu). `pnpm
--filter web exec tsc --noEmit` czysto.

### Nowe moduły: Poczta, tickety wsparcia, changelog (2026-08-22)

User poprosił o trzy niezależne moduły w jednym zgłoszeniu: prywatne wiadomości między graczami,
system ticketów do administracji (zgłaszanie bugów, pełna obsługa z odpowiedziami i statusem po
stronie admina), oraz changelog widoczny dla graczy. Dopytane i ustalone przed implementacją:
changelog nie ma żadnego mechanizmu automatyzacji z gita (w repo brak `.github/workflows` i
aktywnych `.git/hooks`) — "automatycznie" oznacza w praktyce prosty formularz w panelu admina,
który ja (Claude) uzupełniam po każdej większej zmianie w tej i przyszłych sesjach; to manualny
krok, nie pipeline. Panel ticketów w adminie użył tego samego wzorca rozwijanego wiersza co log
bota w Serwer → Boty (`ServerAdminPage.tsx`), zamiast osobnego widoku/modala.

**Model danych** (`Message`, `SupportTicket`+`SupportTicketReply`, `ChangelogEntry` — nowe
modele w obu plikach schematu na raz, jak zawsze): `Message` ma miękkie usuwanie
(`deletedBySender`/`deletedByRecipient` osobno, żeby usunięcie z jednej strony nie ukryło
wiadomości drugiej stronie) zamiast twardego kasowania. `SupportTicket.status` to zwykły
`String @default("open")` (ten sam wzorzec co `role`/`FriendRequest.status` w tym projekcie) —
poprawność wartości pilnuje `TicketStatusSchema` w Zod, nie enum w Prisma.

**Backend** — trzy nowe moduły wzorowane na już istniejącym `modules/friends`: `modules/mail`,
`modules/support` (gracz), `modules/admin/support` (admin, `requireRole("admin","moderator")`),
`modules/admin/changelog` (CRUD, `requireRole("admin")`) + `modules/changelog` (publiczny odczyt,
`requireAuth`, limit 50 najnowszych). Wyszukiwanie odbiorcy poczty po nazwie postaci identyczne
jak przy wysyłaniu zaproszenia do znajomych (`prisma.character.findUnique`, 404/400 analogicznie).
Każda mutacja woła `logAction` jak reszta modułów. Pięć nowych rejestracji w `app.ts`
(`/api/mail`, `/api/support`, `/api/admin/support`, `/api/changelog`, `/api/admin/changelog`).

**Frontend** — `MailPage.tsx` (Odebrane/Wysłane, kompozycja, klik = oznacz jako przeczytane),
`SupportPage.tsx` (zgłoszenie + wątek + odpowiedź, ukryta gdy status="closed"),
`ChangelogPage.tsx` (chronologiczna lista publiczna), `admin/SupportAdminPage.tsx` (rozwijany
wiersz z wątkiem + odpowiedź admina + zmiana statusu, wzorem loga bota), `admin/ChangelogAdminPage.tsx`
(CRUD wzorem `EventsAdminPage.tsx`, `ConfirmModal` przed usunięciem). Odznaka liczby
nieprzeczytanych wiadomości w `AppShell.tsx` — osobny lekki `useQuery` z `refetchInterval: 30000`
(30s, świadomie rzadziej niż 2-5s polling dashboardu admina, bo to działa dla każdej zalogowanej
sesji gracza, nie tylko admina).

**Tymczasowe ikony nawigacji**: dla Poczty/Zgłoś problem/Co nowego nie ma jeszcze dedykowanej
grafiki w paczce `Tymczasowe/rpg_menu_design/icons/` (`poczta.png` to pusty placeholder) —
na razie reużyte istniejące ikony (`znajomi.png`, `npc.png`, `ranking.png`) jako tymczasowe
zamienniki, oznaczone komentarzem w kodzie, do podmiany gdy user dostarczy właściwe assety.

Zweryfikowane w przeglądarce end-to-end dwoma świeżo zarejestrowanymi kontami testowymi: wysłanie
wiadomości między postaciami + odczyt w Odebrane/Wysłane + zniknięcie odznaki nieprzeczytanych po
otwarciu; zgłoszenie ticketu jako gracz → widoczny w panelu admina → odpowiedź admina + zmiana
statusu na "Rozwiązany" → widoczne z powrotem po stronie gracza z odpowiedzią; dodanie wpisu
changelogu w adminie → widoczny na publicznej stronie "Co nowego" → edycja → usunięcie z
potwierdzeniem. `tsc --noEmit` czysto na `shared`/`api`/`web`.

### Fix: nadawanie itemu przez panel admina czasem "udawało się" bez dodania itemu do EQ (2026-08-23)

User zgłosił: stworzył nowy item ("sztaba1", materiał ze statami losowymi i wymaganiami
ulepszenia), spróbował nadać go postaci przez Testowanie → panel nie pokazał żadnego błędu, ale
item nie trafił do ekwipunku. Dla porównania granting prostego itemu ("kilof") zadziałał od razu.

Przyczyna: [addLootToInventory](../apps/api/src/modules/inventory/service.ts) (funkcja dodająca
loot do EQ, współdzielona przez wszystkie źródła przedmiotów — granty admina, sklep NPC, skrzynie,
starter itemy, ekspedycje, zbieractwo) jest CELOWO zaprojektowana, by przy `allowPartial: true`
nie rzucać wyjątku gdy nie może czegoś dodać (np. plecak pełny) — zamiast tego cicho zwraca
`{granted, overflow}`, żeby np. reszta nagrody z ekspedycji nie przepadła przez jeden zły
wiersz loota. Problem: [grantToCharacter](../apps/api/src/modules/admin/characters/service.ts)
(panel admina, `allowPartial: false` domyślnie) w ogóle NIE sprawdzał zwróconej wartości —
transakcja i tak kończyła się sukcesem (bo `character.update` na exp/gold się wykonywał), więc
front dostawał 200 OK i pokazywał "Wykonano." mimo że w tabeli `InventoryItem` nic nie przybyło.
`quantity <= 0` jest już zablokowane wcześniej przez Zod (`AdminGrantItemSchema.quantity.min(1)`,
widoczny błąd "Nieprawidłowe dane"). Pierwsza hipoteza (nieistniejący `itemId` w momencie
transakcji, druga gałąź `if (!item...)`) okazała się błędna po sprawdzeniu produkcyjnych logów z
userem: item "sztaba1" istniał przez cały czas, a `InventoryItem` z tym itemem FAKTYCZNIE powstał
w bazie (quantity zgadzała się dokładnie z sumą wielokrotnych prób grantu). Prawdziwa przyczyna —
osobna, poważniejsza — opisana niżej w osobnym wpisie ("Ekwipunek: backend pozwalał..."). Ta
sekcja (`overflow` check) zostaje jako wartościowe zabezpieczenie ogólne (patrz decyzja o `!item`
poniżej), ale NIE była źródłem zgłoszonego zdarzenia.

Fix: `grantToCharacter` teraz sprawdza `{granted, overflow}` z każdego wywołania
`addLootToInventory` i rzuca `AdminCharacterError` (co robi rollback całej transakcji, łącznie z
exp/gold) jeśli `overflow > 0` — zamiast cichego "sukcesu" admin dostanie teraz widoczny błąd.
Ten sam brakujący check istniał identycznie w trzech innych miejscach wołających
`addLootToInventory` bez `allowPartial` (czyli tam gdzie brak wyjątku = realny, cichy błąd, nie
świadomy tryb "best effort"): [npcShop/service.ts](../apps/api/src/modules/npcShop/service.ts)
(gracz płaci złoto, może nie dostać przedmiotu — najpoważniejszy z trzech, realna strata gracza),
[characters/service.ts](../apps/api/src/modules/characters/service.ts) (przedmioty startowe przy
tworzeniu postaci), [inventory/service.ts:617](../apps/api/src/modules/inventory/service.ts)
(otwieranie skrzyni — skrzynia by się zużyła bez przyznania nagrody). Wszystkie trzy dostały ten
sam wzorzec (`if (overflow > 0) throw ...`). Zweryfikowane w przeglądarce: normalny grant nadal
działa (3× "Kilof Górnika" trafiło do EQ), tworzenie nowej postaci nadal działa (przedmioty
startowe bez zmian). `tsc --noEmit` czysto.

### Ekwipunek: backend pozwalał na 500 slotów, front pokazywał tylko 140 — item "gubił się" bez błędu (2026-08-23)

Prawdziwa przyczyna zdarzenia z "sztaba1" opisanego wyżej, znaleziona dopiero po analizie logów
produkcyjnych razem z userem (payload `GameLog` pokazał 4 identyczne próby grantu tego samego
itemu pod rząd — ślad kogoś, kto klika "Wykonaj", sprawdza EQ, nic nie widzi, próbuje ponownie —
a `InventoryItem` w bazie miał dokładnie sumę tych prób: dowód, że backend za każdym razem
faktycznie zapisywał item poprawnie).

`findNextFreeSlotIndex` w [inventory/service.ts](../apps/api/src/modules/inventory/service.ts)
szukał wolnego slotu aż do `MAX_SLOTS = 500` (stała lokalna, nigdzie niepowiązana z resztą gry).
`EquipmentTab.tsx` renderuje i pozwala przełączać tylko `INVENTORY_TABS = 4` zakładek × 35 slotów
(`INVENTORY_GRID_COLS`×`INVENTORY_GRID_ROWS`) = **140 widocznych slotów** — też stała lokalna,
zdefiniowana niezależnie, w ogóle nieznana backendowi. Te dwie liczby nigdy nie były tym samym
źródłem prawdy. Postać z incydentu miała już ok. 297 zajętych slotów (dużo testowania) — backend
poprawnie znalazł "wolne miejsce" na slocie 297, ale UI nie ma żadnej kontrolki żeby dotrzeć do
zakładki poza czwartą, więc item stał się faktycznie, trwale niewidzialny mimo że istniał w
bazie. "Kilof" nie miał tego problemu, bo trafia w dedykowany slot ekwipunku (zawsze widoczny),
nie do siatki inwentarza.

Dopytany wprost, czy podnieść widoczną pojemność (front pokazuje więcej zakładek, dopasowane do
istniejącego limitu 500 w backendzie) czy przyciąć backend do obecnych 4 zakładek — wybór:
**przyciąć backend**, żeby przy prawdziwym zapełnieniu 4 zakładek gracz dostawał realny błąd
"Ekwipunek jest pełny" zamiast cichego przepełnienia w niewidzialne sloty; pojemność EQ zostaje
bez zmian.

Fix: nowa stała `MAX_INVENTORY_SLOTS` (= `INVENTORY_TABS × INVENTORY_GRID_SLOTS_PER_TAB` = 140) w
[packages/shared/src/schemas/inventory.ts](../packages/shared/src/schemas/inventory.ts) — jedno
źródło prawdy. `findNextFreeSlotIndex` używa jej zamiast lokalnego `MAX_SLOTS = 500`.
`EquipmentTab.tsx` importuje `INVENTORY_TABS` z `@mmo/shared` zamiast trzymać własną kopię;
`TAB_LABELS` (rzymskie cyfry na przyciskach zakładek) teraz generowane z `INVENTORY_TABS` zamiast
sztywnej tablicy `["I","II","III","IV"]`, żeby ten sam rodzaj rozjazdu (stała vs. tablica) nie
mógł się powtórzyć przy przyszłej zmianie pojemności.

Sprzątanie istniejących "osieroconych" przedmiotów (już zapisanych na slotach ≥140 na produkcji,
sprzed tego fixu): dodatkowy jednorazowy skrypt, tym razem od razu we wzorcu tych już istniejących
w tym projekcie (`prisma/scripts/*.ts`, wpięte na stałe w `deploy/deploy.sh` jako "dodatkowe,
addytywne, idempotentne poprawki danych — bezpieczne przy każdym deployu, no-op gdy już
zastosowane") —
[apps/api/prisma/scripts/relocate-orphaned-inventory-slots.ts](../apps/api/prisma/scripts/relocate-orphaned-inventory-slots.ts),
wywoływany automatycznie z `deploy.sh` od tego wdrożenia. Znajduje wszystkie `InventoryItem` ze
slotem ≥140, dla każdej postaci próbuje przenieść je na pierwszy wolny widoczny slot (ta sama
logika co `findNextFreeSlotIndex`, żeby zachować spójność z `gridWidth`); jeśli naprawdę brak
miejsca (4 zakładki faktycznie pełne), zostawia bez zmian i wypisuje do ręcznej decyzji zamiast
czegokolwiek nadpisywać. Przetestowany lokalnie na sztucznie spreparowanym przypadku (item
ręcznie przesunięty na slot 250) — poprawnie wrócił na slot 0, zweryfikowany też w przeglądarce
(poprawił się licznik przedmiotów w zakładce I).

`tsc --noEmit` czysto na `shared`/`api`/`web`, `pnpm --filter shared build` (dist przebudowany).

**Dogrywka tego samego dnia**: po wdrożeniu powyższego fixu user zgłosił, że problem nadal
występuje — sprawdzone wspólnie na produkcji: `slotIndex` dla "sztaba1" nadal 297, ale `quantity`
urosła z 8 do 10 (dwa kolejne granty PO deployu). Przyczyna: `addLootToInventory` najpierw szuka
**istniejącego stosu** tego itemu (`tx.inventoryItem.findMany` bez filtra na `slotIndex`) i dokłada
do niego, zanim w ogóle rozważy szukanie nowego wolnego slotu — a istniejący stos siedział właśnie
na osieroconym slocie 297. Poprzedni fix pilnował tylko ścieżki "znajdź NOWY slot", nie dotykał
ścieżki "dołóż do ISTNIEJĄCEGO stosu", więc każdy kolejny grant tego samego itemu po prostu
powiększał ten sam niewidzialny stos zamiast kiedykolwiek wylądować w widocznym miejscu.

Fix: zapytanie o `existingStacks` w `addLootToInventory` (gałąź `stackable`) dostało warunek
`OR: [{slotIndex: null}, {slotIndex: {lt: MAX_INVENTORY_SLOTS}}]` — pozwala nadal dokładać do
stosu w aktywnym slocie (potiony, `slotIndex: null`) i do widocznego stosu w siatce, ale **nie**
do osieroconego stosu ≥140. Taki stos jest teraz ignorowany jako cel merge'a, więc kolejny grant
poprawnie trafia do `nextFreeSlot` — albo znajdzie widoczne miejsce, albo (jeśli 4 zakładki
faktycznie pełne) rzuci "Ekwipunek jest pełny", zamiast dalej cicho tuczyć niewidzialny stos.

Zweryfikowane lokalnie: sztucznie osierocony stos (item przesunięty na slot 200) + nowy grant tego
samego itemu przez panel admina → w bazie powstał DRUGI, osobny wiersz na widocznym slocie 0,
oryginalny osierocony wiersz pozostał nietknięty (dowód, że merge faktycznie go pomija). Skrypt
`relocate-orphaned-inventory-slots.ts` uruchomiony ponownie poprawnie przeniósł ten testowy
osierocony wiersz na wolny widoczny slot. Dla postaci z produkcji z oryginalnego zgłoszenia:
jeśli po tym fixie i ponownym uruchomieniu skryptu migracyjnego nadal zostanie zgłoszone
"BRAK MIEJSCA", oznacza to, że jej 140 widocznych slotów jest naprawdę zapełnione (stąd w ogóle
doszło do sięgania po slot 297 wcześniej) — trzeba zrobić miejsce (wyrzucić/sprzedać coś w
widocznych zakładkach) zanim ten konkretny osierocony stos "sztaba1" będzie mógł wrócić do EQ.

### Skala problemu na produkcji: 17488 osieroconych przedmiotów na 113 postaciach + zabezpieczenie na przyszłość (2026-08-23)

Po wdrożeniu powyższych fixów user uruchomił `deploy.sh` na produkcji — skrypt migracyjny zgłosił
"Przeniesiono: 24, bez miejsca (bez zmian): 17488". Zanim cokolwiek ruszono dalej, zweryfikowano
wspólnie z userem czy to nie błąd w moim kodzie (np. `MAX_INVENTORY_SLOTS` źle się wczytujące na
produkcji, przez co skrypt oznaczałby prawie WSZYSTKO jako osierocone) — bezpośrednie zapytanie SQL
(`SELECT COUNT(*) WHERE "slotIndex" >= 140`) potwierdziło dokładnie 17488, czyli liczba jest
prawdziwa, nie artefakt buga. 113 dotkniętych postaci, po dopytaniu usera, to konta botów
testowych (load-testing z wieloma jednocześnie działającymi botami przez wiele dni — patrz
"Bot gracza — playtesting balansu..." 2026-08-20) — potwierdzone jako bezpieczne do usunięcia.

**Sprzątanie**: nowy jednorazowy skrypt (NIE wpięty w `deploy.sh` — w przeciwieństwie do
`relocate-orphaned-inventory-slots.ts`, który tylko przenosi-albo-zostawia, ten kasuje, więc musi
być uruchamiany świadomie, ręcznie)
[apps/api/scripts/_delete_orphaned_inventory_items.ts](../apps/api/scripts/_delete_orphaned_inventory_items.ts)
— usuwa wszystko co nadal ma `slotIndex >= MAX_INVENTORY_SLOTS` po tym jak skrypt relokujący już
dostał szansę przenieść co się dało, z wypisaniem podsumowania per-postać przed skasowaniem i
wpisem do `GameLog` (`module: "inventory"`, `action: "orphaned_items_purged"`) jako trwały ślad co
i kiedy zostało usunięte. Przetestowany lokalnie (utworzenie sztucznego osieroconego wiersza →
usunięcie → potwierdzenie że drugi przebieg jest no-opem).

**Zabezpieczenie na przyszłość** — user zażądał wprost: zanim gra "odbierze" graczowi przedmiot
który nie mieści się w EQ, gracz musi dostać szansę zrobić miejsce (funkcja discard/sell już
istnieje) zamiast cichej utraty. Zdecydowano na prostszy z dwóch wariantów: całkowicie zablokować
akcję czytelnym błędem (zamiast budować UI do wyboru "co odrzucić").

- **Ekspedycje** ([expeditions/service.ts](../apps/api/src/modules/expeditions/service.ts),
  `applyExpeditionReward`): wcześniej `allowPartial: true` cicho gubił loot który się nie zmieścił
  (raportowane tylko w `overflowLoot` — pole ISTNIAŁO w UI od dawna, `ExpeditionPanel.tsx` pokazywało
  "Ekwipunek był pełny — zgubiono część łupu", ale PO fakcie, nagroda i tak była już utracona).
  Teraz: jeśli cokolwiek się nie mieści, cała transakcja (exp/gold/loot) rzuca `ExpeditionError`
  409 i robi rollback atomowo — gracz nic nie traci, dostaje czytelny błąd, może zrobić miejsce i
  odebrać nagrodę ponownie. Martwy kod usunięty: pole `overflowLoot` (nigdy już niepuste w praktyce)
  wycięte z powrotu funkcji, `ExpeditionPanel.tsx`, `expeditionsApi.ts` i bota (`bot/client.ts`).
- **Zbieractwo** ([gathering/service.ts](../apps/api/src/modules/gathering/service.ts)) — INNA
  architektura niż ekspedycje: `resolveGatherSession` leniwie "dogania" WIELE zaległych faz naraz
  w pętli (mogło zebrać się np. 20 cykli od ostatniego sprawdzenia), z istniejącym już wcześniej
  komentarzem-ostrzeżeniem "a full bag must not crash the lazy phase-resolution loop" — rzucenie
  zwykłego błędu tutaj rozwaliłoby całą pętlę dogrywania (i prawdopodobnie samo ładowanie zakładki
  Zbieractwo) zamiast tylko jednej akcji gracza. Rozwiązanie zamiast prostego throw: nowy wewnętrzny
  sygnał `GatherInventoryFullSignal` — rzucany WEWNĄTRZ transakcji danej fazy (rollback tej jednej
  fazy atomowo, nic nie ginie), złapany przez pętlę dogrywania w `resolveGatherSession`, która
  PAUZUJE sesję dokładnie na tej fazie (bez usuwania sesji — inaczej niż istniejący wcześniej
  mechanizm `maxCyclesPerResolve`, który sesję kasuje) i loguje `auto_paused_inventory_full`. Gdy
  gracz zrobi miejsce, kolejne leniwe rozwiązanie sesji poprawnie dokończy dokładnie tę fazę.
- **Poleceni** ([referralRewards.ts](../apps/api/src/lib/referralRewards.ts)) — świadomie
  WYŁĄCZONY z blokowania: ta nagroda to efekt uboczny działania INNEJ postaci (poleconego LUB
  polecającego), więc rzucenie błędu tutaj zablokowałoby całkowicie niepowiązane żądanie gracza
  (np. odbiór ekspedycji) z powodu pełnego EQ osoby trzeciej. Zostaje `allowPartial`, ale teraz
  przynajmniej zalogowane (`module: "referral"`, `action: "reward_overflow"`) zamiast ginąć bez
  śladu.
- **Boty testowe** ([bot/policy.ts](../apps/api/scripts/bot/policy.ts)) — skoro `claimExpedition`
  teraz 409-uje na pełnym EQ, a boty właśnie to (masowe nazbieranie lootu bez zarządzania
  ekwipunkiem) robiły najczęściej — dodano `BotStopSignal`: istniejąca pętla retry (dla wyścigu z
  zegarem serwera przy "Ekspedycja jeszcze trwa") rozróżnia teraz ten konkretny komunikat
  ("Ekwipunek jest pełny") i od razu zatrzymuje bota tym samym, już istniejącym, eleganckim
  mechanizmem co limit czasu/liczby ekspedycji (`report.log("stop", ...)` + zakończenie), zamiast
  wyczerpywać 5 prób i crashować cały przebieg bota niezłapanym wyjątkiem.

`tsc --noEmit` czysto na `api`/`web`. Zweryfikowane w przeglądarce dla ścieżki adminowego grantu
(ten sam kontrakt `addLootToInventory`/`overflow`, patrz wpis wyżej) — pełna weryfikacja UI klawiu
"Odbierz nagrody" na naprawdę zapełnionym EQ nie została wykonana (wymagałoby ręcznego zapełnienia
140 slotów), fix opiera się na tej samej, już zweryfikowanej ścieżce.

### Ikony dla drzewka umiejętności (ClassSkill + SkillTreeNode) (2026-08-23)

User poprosił o możliwość dodawania ikon do drzewka umiejętności. W repo są dwa systemy nazywane
"umiejętnościami" — `PassiveSkillType` (płaska lista, bez zależności/kosztu, zbieractwo/książki)
i `ClassSkill`+`SkillTreeNode` (prawdziwe drzewo z `pointCost`/`maxLevel`/`requiresNodeId`,
panel Klasy → edycja klasy). Tylko ten drugi pasuje do opisu "drzewko" — i tylko on ma już
placeholder gotowy pod prawdziwe ikony: `SkillSygil.tsx` (jeden generyczny SVG-glif dla każdego
kafelka drzewka, korzeń i węzły jednakowo), z komentarzem w kodzie wprost mówiącym że czeka na
podmianę na per-skill artwork.

Zaimplementowane 1:1 na wzorcu `Item.imageUrl` (jedyny działający upload obrazków w projekcie,
`modules/admin/items`) — ten sam katalog uploadów (`uploads/skills/`, wspólny dla obu encji, bo
każdy cuid jest unikalny), ta sama mapa `EXT_BY_MIME` (PNG/JPEG/WEBP/GIF), ten sam wzorzec nazwy
pliku (`${id}-${Date.now()}`, unika stale cache po ponownym wgraniu), to samo `fs.rm` starego
pliku przy nadpisaniu.

**Backend**: `imageUrl String?` dodane do OBU modeli (`ClassSkill` i `SkillTreeNode` — root gałęzi
i węzły upgrade'ów renderują się identycznym kafelkiem w `SkillsPanel.tsx`, więc obsłużenie tylko
jednego z nich zostawiłoby połowę drzewka na zawsze z placeholderem). `packages/admin/classes/service.ts`:
wspólny prywatny helper `saveIcon()` (zapis na dysk + usunięcie poprzedniego) używany przez dwie
publiczne funkcje `setClassSkillImage`/`setSkillNodeImage` — obie zwracają CAŁĄ nadrzędną klasę
(`classInclude`), żeby formularz admina mógł odświeżyć stan bez drugiego zapytania. Dwa nowe
endpointy: `POST /api/admin/classes/skills/:skillId/image`, `POST /api/admin/classes/nodes/:nodeId/image`.
`app.ts`: dopisany `fs.mkdirSync(uploads/skills)` obok istniejącego dla `items` — jeden wspólny
`fastifyStatic` na całym `uploads/` już serwuje nowy podkatalog bez dodatkowej rejestracji.

**Frontend — trudność nie do końca oczywista z góry**: formularz `ClassesAdminPage.tsx` operuje
na "form state" bez `id`/`imageUrl` (`CreateCharacterClassInput` — węzły identyfikowane po nazwie,
upsertowane po `[classSkillId, name]`, patrz Etap wcześniejszy o drzewku). Upload wymaga
prawdziwego `id`, którego formularz nie ma. Rozwiązanie: cross-reference po nazwie do
`classesQuery.data` (żywe dane z serwera) — `editingClass?.skills.find(s => s.name === skill.name)`
daje `skillDto` z prawdziwym `id`/`imageUrl`; analogicznie `skillDto?.nodes.find(n => n.name === node.name)`
dla węzłów. Dokładnie ten sam wzorzec "zapisz najpierw, potem wgraj" co w Itemach — dla NOWEGO,
jeszcze niezapisanego węzła/umiejętności pokazuje się `"Zapisz klasę, żeby móc wgrać ikonę..."`
zamiast pola uploadu.

`SkillsPanel.tsx` (`Tile()`): nowy prop `imageUrl`, renderowany jako `<img>` zamiast `<SkillSygil>`
gdy ustawiony — ale TYLKO gdy `!locked` (zablokowany kafelek zawsze pokazuje `<LockGlyph>`,
niezależnie czy ma własną ikonę, żeby stan "zablokowane" zostawał jednoznacznie czytelny).
Ponieważ publiczny endpoint `/api/classes` używa dokładnie tego samego `classInclude`/serwisu co
panel admina, `imageUrl` przepływa do gracza automatycznie, bez żadnej dodatkowej zmiany po
stronie odczytu.

Zweryfikowane w przeglądarce end-to-end: wgranie ikony dla umiejętności-korzenia (odpowiedź 200,
plik poprawnie serwowany pod `/uploads/skills/...`, `<img>` faktycznie renderuje się w formularzu
zamiast "brak"), dodanie nowego węzła → zapis klasy → ikona dla NOWEGO węzła (potwierdza że
cross-reference po nazwie działa też tuż po utworzeniu, nie tylko dla już istniejących encji).
Stan zablokowany w `SkillsPanel.tsx` (świeża postać, level 1, brak wydanych punktów) poprawnie
nadal pokazuje kłódkę zamiast ikony — potwierdza że warunek `locked` nie został przypadkiem
ominięty. `tsc --noEmit` czysto na `shared`/`api`/`web`.

### Nowy styl wyboru i tworzenia postaci, wzorowany na projekcie z Claude Design (2026-08-23)

User poprosił o zaimplementowanie stylu z zewnętrznego projektu Claude Design (`claude.ai/design`,
"MMO RPG Website mockups", plik `MMO Website.dc.html`) — mockup dark-fantasy strony ("Ironveil")
z osobnymi widokami "character select" i "classes". Odczytane przez `DesignSync` (`get_project`/
`list_files`/`get_file`), NIE skopiowane 1:1 — mockup używa własnej palety (#14100d/#e9dfc9/
#c9a24a) i fontu EB Garamond na treść, ale gra ma już bardzo zbliżony, własny system (token `gold`
niemal identyczny z mockupu #c9a24a, `ink`/`panel`/`parchment`, i **Cinzel jest już fontem
display** w `tailwind.config.js`) — użyto WŁASNYCH tokenów zamiast wprowadzać drugą, konkurencyjną
paletę/font tylko dla jednej strony (co zepsułoby spójność z resztą gry, szczególnie po niedawnym
ujednolicaniu tła — patrz wpis "Tło strony ujednolicone..." 2026-08-21).

[CharactersPage.tsx](../apps/web/src/pages/CharactersPage.tsx) przepisana od zera, łącząc DWIE
sekcje mockupu w jedną spójną stronę (mockup miał je jako osobne zakładki nawigacji):
- **Wybór postaci** (gdy istnieje i jest zaznaczona postać) — wzorem mockupowej "CHARACTER SELECT
  PAGE": duży panel-"portret" (dekoracyjne ukośne pasy zamiast prawdziwej grafiki postaci, w tym
  samym duchu co `ItemTypeIcon`/`SkillSygil` — uczciwy placeholder, nie fałszywy obrazek), pływający
  panel STATYSTYKI (`PanelFrame emphasis="secondary"`, cztery paski `ProgressBar` dla
  siła/witalność/zręczność/inteligencja — mockup miał sztywną skalę 0-100, u nas staty rosną bez
  górnej granicy z poziomem, więc paski skalowane względem umownego "miękkiego" pułapu czysto
  wizualnie, nie prawdziwego capa), dolny gradientowy pasek z nazwą/klasą/poziomem i przyciskiem
  "WEJDŹ DO GRY" (ta sama akcja co dotychczasowe kliknięcie karty postaci — `setActiveCharacterId`
  + nawigacja).
- **Tworzenie postaci** — mockup miał to jako gołe pole na nazwę (klasa była na sztywno w kodzie
  mockupu, nie prawdziwym wyborem). U nas wybór klasy jest realną decyzją, więc połączono z drugą
  sekcją mockupu ("CLASSES PAGE"): poziomy pasek zakładek klas, portret-placeholder + opis +
  główny atrybut, lista umiejętności klasy (`ClassDto.skills`, z odznaką Pasywna/Aktywna) jako
  podgląd "co odblokujesz", i pasek na dole z polem nazwy + przyciskiem "UTWÓRZ POSTAĆ" (zamiast
  mockupowej nawigacji między stronami).

Sidebar (lista postaci) dostał też ulepszenie względem starej wersji: pokazuje teraz nazwę klasy
przy poziomie (wcześniej tylko poziom/exp/złoto), zgodnie z mockupowym "Lv. X ClassName".

Świadomie POMINIĘTE względem mockupu: pełny wizualny "full-bleed" układ (strona nadal żyje
wewnątrz `AppShell`'owego `max-w-5xl`, żeby zachować spójną nawigację/chrome z resztą gry — zmiana
tego wymagałaby ingerencji w `AppShell.tsx`, poza zakresem tego zadania), font EB Garamond (treść
zostaje na dotychczasowym sans, żeby nie różnicować jednej strony od reszty apki), panel "UNLOCKED
ABILITIES" dla WYBRANEJ (nie tworzonej) postaci — pokazywałby odblokowane umiejętności, ale
wymagałoby to dodatkowych zapytań (`getCharacterSkills`+`getPlayerClass`) tylko dla tej jednej
sekcji; uznano że nie jest kluczowe dla "stylu wyboru i tworzenia" i pominięto dla zwięzłości.

Zweryfikowane w przeglądarce end-to-end: przełączanie między istniejącymi postaciami (poprawne
staty/nazwa/klasa w panelu), przełączanie zakładek klas w trybie tworzenia (opis/umiejętności się
aktualizują), pełne utworzenie nowej postaci (nazwa + wybrana klasa → postać pojawia się na liście
i w widoku wyboru), brak przelewania poziomego na desktopie i na mobile (375px — panel statystyk
świadomie ukryty poniżej `sm:`, żeby nie kolidował z wąskim portretem). `tsc --noEmit` czysto na
`web`.

### Styl zakładki Znajomi, wzorowany na sekcji "FRIENDS PAGE" z tego samego projektu Claude Design (2026-08-23)

Ten sam projekt "MMO RPG Website mockups" dostał później nową sekcję "FRIENDS PAGE" (nieobecną
przy poprzednim odczycie — patrz wpis wyżej o `CharactersPage.tsx`). Ta sama zasada co poprzednio:
własne tokeny (gold/parchment/ink, Cinzel) zamiast literalnej palety/fontu mockupu, ale tym razem
mockup miał już polskie etykiety ("Znajomi", "LISTA ZNAJOMYCH", "WYSŁANE ZAPROSZENIA") — prosto do
przeniesienia. [FriendsPage.tsx](../apps/web/src/pages/FriendsPage.tsx) przepisana: układ
dwukolumnowy (1.3fr lista znajomych / 1fr zaproszenia+dodawanie, jak w mockupie), awatary "pierwsza
litera nazwy" z kropką statusu (ten sam placeholder co roster postaci w `CharactersPage.tsx` —
świadomie spójny język wizualny między dwoma listami graczy w apce), licznik "N online" w nagłówku
panelu.

Jedna realna funkcjonalna zmiana poza czystym restylem: mockupowy przycisk "WYŚLIJ WIADOMOŚĆ" przy
każdym znajomym dostał prawdziwe działanie — link do `/mail?to=NazwaPostaci`.
[MailPage.tsx](../apps/web/src/pages/MailPage.tsx) czyta teraz `?to=` z URL (`useSearchParams`,
odczytane raz przy montowaniu, nieaktualizowane przy przełączaniu zakładek Odebrane/Wysłane) i
otwiera compose z gotowym odbiorcą zamiast pustej skrzynki — bez tego link byłby kosmetyczny
(prowadziłby do Poczty, ale user musiałby ręcznie wpisać nazwę postaci ponownie).

Dane z mockupu (status online/offline/zajęty jako trzy kolory, "3h temu" dla offline) uproszczone
do tego co realnie zwraca `FriendEntryDto` (`online: boolean`, bez `lastSeenAt`) — status pokazuje
"Online"/"Offline" + klasę i poziom zamiast trójstanowego koloru i czasu od ostatniej sesji, którego
backend nie śledzi.

Zweryfikowane w przeglądarce end-to-end dwoma kontami testowymi: wysłanie zaproszenia →
"Wysłane zaproszenia" u nadawcy → "Przychodzące zaproszenia" u odbiorcy → akceptacja → obaj widzą
się na liście znajomych z poprawnym statusem online i klasą/poziomem → kliknięcie "Wiadomość"
przechodzi do `/mail?to=TestAdmin` z automatycznie otwartym, wypełnionym formularzem. Brak
przelewania na mobile (375px). `tsc --noEmit` czysto na `web`.

### Przycisk "Odpowiedz" w Poczcie

Rozwinięty widok wiadomości w skrzynce Odebranych miał tylko treść i "Usuń" — brak jakiegokolwiek
sposobu odpowiedzenia nadawcy poza ręcznym otwarciem "Nowa wiadomość" i przepisaniem jego nazwy
postaci od zera. [MailPage.tsx](../apps/web/src/pages/MailPage.tsx) dostał `startReply(message)`:
otwiera compose (`setComposeOpen(true)`), wypełnia odbiorcę z `message.counterpartCharacterName`,
temat prefiksuje `"Re: "` (bez dublowania, jeśli temat już nim zaczyna), czyści treść i płynnie
przewija do formularza (`composeRef.current?.scrollIntoView`). Przycisk "Odpowiedz" pokazuje się
tylko przy wiadomościach w zakładce Odebrane (odpowiadanie na własną wysłaną wiadomość nie ma
sensu) i tylko gdy `counterpartCharacterName` istnieje.

Zweryfikowane end-to-end przez dwa świeże konta testowe (utworzone i usunięte w ramach testu):
wiadomość wysłana przez API od B do A → w przeglądarce jako A otwarcie wiadomości → klik
"Odpowiedz" → pole odbiorcy poprawnie ustawione na "MailTestB", temat na "Re: Test tematu" →
wysłanie → potwierdzone przez API, że odpowiedź dotarła do skrzynki B z poprawnym tematem i
treścią. `tsc --noEmit` czysto na `web`.

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
