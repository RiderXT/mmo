# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Szeroka, nieznana publiczność graczy przeglądarkowych/idle MMO i fanów stylistyki Metin2 —
gracze wysyłają postać na ekspedycję i wracają po pewnym czasie po nagrody, bez konieczności
ciągłej, aktywnej uwagi (auto-farm). Osobna, mniejsza grupa użytkowników to administratorzy/
moderatorzy zarządzający całą treścią gry (krainy, potwory, przedmioty, klasy, NPC, eventy)
przez panele administracyjne oraz przeglądający logi/statystyki balansu.

## Product Purpose

Przeglądarkowe MMO w stylu Metin2 z automatycznym expieniem/zbieraniem itemów: gracz zakłada
postać, wybiera krainę i wysyła postać na ekspedycję; postać walczy automatycznie przez
skonfigurowany/wyliczony czas i wraca z expem, złotem i itemami do odebrania. Sukces = gracz
regularnie wraca sprawdzić postęp, ulepszać ekwipunek (Kowadło), handlować z NPC i wysyłać
kolejne ekspedycje — pętla progresji bez wymogu ciągłej, aktywnej rozgrywki.

## Positioning

Wynik każdej ekspedycji (walki, loot, exp) jest w pełni wyliczany od razu w momencie jej
rozpoczęcia, a następnie ujawniany stopniowo po stronie klienta zgodnie z upływem czasu
rzeczywistego — gra "czuje się" żywo bez odpytywania serwera ani procesów w tle. Cała treść gry
(krainy, potwory, przedmioty, dropy, klasy postaci, NPC-handlarze, eventy czasowe) jest tworzona
wyłącznie przez panele administracyjne, bez zmian w kodzie.

## Operating Context

- Gracz: logowanie/rejestracja → lista postaci → gra właściwa z zakładkami w lewym menu: Postać
  (staty/umiejętności/ekwipunek), Ekspedycje (wybór krainy, podróż, walka, odbiór nagród),
  Kowadło (ulepszanie przedmiotów, dostępne tylko w mieście), NPC (handel z NPC, dostępne tylko
  w mieście).
- Krainy dzielą się na dzikie (walka z potworami) i miasta (`isTown`) — tylko w mieście działa
  handel i kowadło; podróż między krainami/miastem trwa realny, wyliczony czas.
- Niektóre dzikie krainy mają dodatkowo łowisko i/lub kopalnię — alternatywna, pasywna aktywność
  obok walki: gracz zakłada wędkę/kilof i uruchamia auto-pętlę łowienia/wydobywania (podobnie jak
  ekspedycja, bez klikania po każdym cyklu), zbierając surowce zamiast expu z potworów.
- Admin/moderator: osobny panel (`/admin/*`, bez wspólnego layoutu z grą) do zarządzania
  krainami, potworami, przedmiotami, klasami postaci, NPC, eventami czasowymi, ustawieniami,
  przeglądu logów akcji i statystyk balansu, oraz do ręcznego rozwiązywania ekspedycji
  oflagowanych przez wykrywanie nieprawdopodobnych nagród (anti-cheat).
- Wdrożenie: własny VPS (OVH, Ubuntu), HTTPS pod domeną, bez Dockera/zewnętrznych usług na tym
  etapie (SQLite lokalnie).

## Capabilities and Constraints

- Stack: React + Vite + Tailwind (frontend), Fastify + Prisma + SQLite (backend), Zod (współdzielone
  schematy) — monorepo pnpm.
- Zmiany schematu bazy muszą być addytywne (pola nullable / z `@default`) — nigdy nie wolno
  wymuszać resetu produkcyjnej bazy danych ani utraty danych graczy.
- Role: player / moderator / admin z RBAC na endpointach admina.
- Wbudowany prosty anti-cheat: ekspedycje z nieprawdopodobną nagrodą są oflagowane i czekają na
  ręczną decyzję admina — nie blokuje to jednak dalszej gry posiadacza ekspedycji.
- Mobile-first już dziś (README), z planem na natywną appkę w przyszłości — stąd platforma
  zapisana jako `adaptive`; obecnie brak jeszcze natywnej implementacji iOS/Android, projektowanie
  ma jednak od teraz uwzględniać różnice per-platformę.
- Nazwa/marka gry nie jest jeszcze ustalona — w kodzie i tytule strony widnieje robocze "MMO";
  ekran logowania po ostatnim restylingu wizualnym używa nazwy "FIGHT CLUB" ze szkicu
  wizualnego dostarczonego przez użytkownika (Claude Design), ale to nie jest potwierdzona,
  docelowa nazwa marki — przyszła praca nie powinna zakładać, że to ostateczna nazwa.

## Evidence on Hand

- Pełna dokumentacja architektury: `docs/architecture.md` (bardzo obszerna, aktualizowana po
  każdym etapie prac).
- Instrukcja wdrożenia: `docs/deployment.md`.
- Zasiane dane startowe: 10 tier'ów krain (poziomy 1-99, każdy z ~5 potworami i dropami), 4 klasy
  postaci (Mag, Strażnik, Wojownik, Łotrzyk) z umiejętnościami i przedmiotami startowymi.
  Obecnie **brak** jakiejkolwiek krainy oznaczonej jako miasto (`isTown: true`) w danych
  bazowych — trzeba ją skonfigurować ręcznie przez panel admina, żeby handel/kowadło były
  dostępne w rozgrywce.
- Brak dotąd potwierdzonych realnych zrzutów ekranu/testimoniali/case studies — projekt na
  wczesnym etapie rozwoju, bez opublikowanej, publicznej wersji.

## Product Principles

1. Rozgrywka nie wymaga ciągłej uwagi — postęp dzieje się "w tle" na czas ekspedycji, gracz
   wraca po nagrody.
2. Cała treść gry jest danymi tworzonymi przez adminów, nie kodem — nowa kraina/przedmiot/klasa
   nie wymaga deployu.
3. Dane graczy są nienaruszalne — zmiany backendu nigdy nie mogą wymagać resetu produkcyjnej
   bazy ani utraty postępu.
4. Uczciwość rozgrywki jest pilnowana automatycznie (anti-cheat), ale nigdy kosztem możliwości
   dalszej gry przez uczciwego gracza.
