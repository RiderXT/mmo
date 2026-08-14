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
