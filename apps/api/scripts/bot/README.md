# Bot gracza (playtesting + load testing)

Boty grają w prawdziwą grę przez to samo REST API co przeglądarka — realne żądania HTTP, prawdziwe
konto, prawdziwa postać, prawdziwe ekspedycje (z ich rzeczywistym czasem trwania). To celowe: tylko
tak wychwycimy realne problemy z balansem i realne obciążenie serwera, nie tylko poprawność logiki
service'ów.

## Uruchomienie

Z katalogu `apps/api`, przy uruchomionym serwerze API:

```bash
npx tsx scripts/bot/run.ts
```

Konfiguracja przez zmienne środowiskowe (wszystkie opcjonalne):

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `BOT_BASE_URL` | `http://localhost:4000` | Adres API. **Nigdy nie ustawiaj na produkcyjny VPS bez świadomej decyzji** — to prawdziwe obciążenie żywego serwera i prawdziwe konto w bazie produkcyjnej. |
| `BOT_NAME` | `Bot<timestamp>` | Nazwa postaci i podstawa loginu (`<nazwa>@bot.test.local`). |
| `BOT_CLASS` | `Wojownik` | Musi dokładnie pasować do nazwy klasy z `GET /api/classes`. |
| `BOT_TARGET_LEVEL` | `10` | Bot kończy po osiągnięciu tego poziomu. |
| `BOT_MAX_MINUTES` | `60` | Twardy limit czasu — zabezpieczenie przed zapętleniem. |
| `BOT_MAX_EXPEDITIONS` | `200` | Drugi, niezależny limit bezpieczeństwa. |

Przykład: przetestuj Łotrzyka do poziomu 15, maks. 2h:

```bash
BOT_NAME=BalanceRunRogue BOT_CLASS=Łotrzyk BOT_TARGET_LEVEL=15 BOT_MAX_MINUTES=120 npx tsx scripts/bot/run.ts
```

## Co robi bot

W pętli, aż do celu: wydaje punkty statystyk (w główny stat klasy) i punkty umiejętności (najpierw
odblokowuje nowe umiejętności, potem inwestuje w węzły drzewka), zakłada wolny ekwipunek pasujący do
pustych slotów, odwiedza miasto po mikstury gdy zapas jest niski (i wkłada jedną do aktywnego slotu),
próbuje ulepszyć założone przedmioty na kowadle gdy stać na materiały+złoto, wybiera najsilniejszą
krainę do jakiej się kwalifikuje i walczy z potworami do +2 poziomów powyżej własnego, czeka na
realne zakończenie walki (nie przyśpiesza czasu) i odbiera nagrody.

## Raport

Po zakończeniu zapisuje `scripts/bot/reports/<nazwa>-<timestamp>.md` (czytelny) i `.json`
(surowe dane) — oba gitignorowane, to wynik testu, nie kod źródłowy. Raport zawiera: całkowity
czas, złoto zarobione/wydane, zużyte mikstury, próby ulepszeń, tabelę czas/koszt per poziom, oraz
sekcję "Anomalie" — poziomy które trwały ponad 2× medianę pozostałych (nie zgaduje przyczyny, tylko
wskazuje gdzie zajrzeć).

## Ograniczenia obecnej wersji

- Jeden bot na uruchomienie — do testów obciążeniowych odpal kilka instancji równolegle
  (różne `BOT_NAME`), np. w osobnych terminalach albo przez prosty skrypt uruchamiający N procesów.
- Polityka jest celowo prosta/deterministyczna (nie "inteligentna") — dobiera zawsze najsilniejszą
  dostępną krainę i potwory do +2 poziomów, inwestuje punkty umiejętności zachłannie od najtańszych.
  To wystarcza do pomiaru tempa progresji, ale nie modeluje różnych stylów gry.
- Brak automatycznego czyszczenia kont testowych — konta boty zostają w bazie
  (`<nazwa>@bot.test.local`) po zakończeniu; usuń je ręcznie z bazy jeśli to lokalny dev, albo
  poproś o skrypt czyszczący, jeśli będziesz odpalać to regularnie.
