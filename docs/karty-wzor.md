# Jak przygotować kartę do wdrożenia 1:1

Wzór do wypełniania za każdym razem, gdy projektujesz nowy element UI (karty przedmiotów, karty
klas, całe zakładki). Pełna, sformatowana wersja: [Artifact](https://claude.ai/code/artifact/69690b03-3499-47d1-b452-da49d26e6f55).

## Język

Cała gra (nazwy, opisy, przyciski, komunikaty, panel admina) jest po **polsku** — karty też.
Kod/nazwy plików/komponentów zostają po angielsku (istniejąca konwencja repo).

## Zrzut ekranu ≠ plik do wdrożenia

Screenshot to spłaszczony render — bez dostępu do warstw/wektorów/tekstury da się go tylko
**przybliżyć** w CSS (tak powstała obecna ramka mapy ekspedycji — podobna, nie identyczna).
Żeby dostać dokładnie tę samą grafikę, potrzebny jest osobny plik: **PNG z przezroczystym tłem**
(min. 2× rozmiar wyświetlania) albo **SVG**, zawierający wyłącznie sam element (np. jeden
narożnik ramki), nie cały zrzut ekranu. Gra ma już mechanizm wgrywania takich plików dla itemów
(panel admina → Itemy → wgraj grafikę) — można go rozszerzyć na inne typy kart.

Skąd wziąć taki plik: generator AI grafiki (prompt niżej), gotowy asset pack fantasy/RPG UI
(itch.io, Kenney.nl), wycięcie z istniejącego obrazka w Photopea (photopea.com, darmowy),
albo zlecenie grafikowi.

## Wzór do wypełnienia

```
Nazwa karty/ekranu: …
Cel: do czego służy, gdzie w grze się pojawia
Najbliższy istniejący wzorzec: np. "jak ItemBox, ale większe" / "jak PanelFrame" / "nowy układ"

Tekst (po polsku):
  Tytuł: …
  Opis: …
  Przycisk(i): …
  Inne etykiety: …

Wymiary: np. "56×56px" / "pełna szerokość panelu" / "240×320px"
Kolory (tylko jeśli inne niż domyślne złoto/ciemne tło gry): …

Własna grafika:
  [ ] Brak — użyj samych kolorów/CSS z systemu gry
  [ ] Tak, załączam plik(i): [nazwa/link], PNG (przezroczyste tło) lub SVG

Referencja wizualna: screenshot/link jako INSPIRACJA, nie źródło do wycięcia
Stany: hover / disabled / zaznaczone / błąd — jeśli dotyczy
Responsywność: czy ma się inaczej zachowywać na telefonie
```

## Prompt startowy do generatora AI grafiki

Styl gry — "Torchlit Arena Ledger": przygaszona kuźnia/sala gildii, złote akcenty w blasku
pochodni, styl grawerowanej tabliczki muzealnej.

```
ornate [engraved gold corner bracket / ornamental frame border],
dark fantasy RPG UI element, museum brass plaque engraving style,
warm torchlit gold on near-black stone, intricate but restrained linework,
no text, no characters, isolated on transparent background,
game asset, clean vector-style edges
```

Podmień fragment w nawiasach na konkretny element. "transparent background" — najczęściej
pomijany, najważniejszy fragment.

## Prompty do ikon przedmiotów (broń, zbroja, itd.)

Ten sam styl gry, ale inny układ niż ramka — pojedynczy przedmiot wyśrodkowany, widziany lekko
z ukosa (3/4), jak ikona w ekwipunku, nie płaska ramka. Baza wspólna dla wszystkich typów:

```
single [ITEM], dark fantasy RPG game icon, 3/4 view centered on transparent background,
museum brass plaque engraving style, warm torchlit gold and aged bronze/steel tones on
near-black stone backdrop removed, dramatic rim lighting, intricate but restrained detail,
no text, no hands, no character, isolated game inventory icon, clean silhouette,
square composition
```

Podmień `[ITEM]` wg typu. Kolejność poniżej = dokładnie kolejność `ItemTypeSchema` w
`packages/shared/src/schemas/enums.ts` — generuj po kolei w tej kolejności, wtedy nazwa pliku
(1, 2, 3…) jednoznacznie mapuje się na typ, bez zgadywania po wyglądzie później. `bait` i
`catalyst` to dwie różne rzeczy w grze (przynęta wędkarska vs. ulepszacz kowadła) — rozdzielone
na dwa różne opisy, żeby nie wyszły jak ten sam przedmiot.

| # | Typ w grze | `[ITEM]` do promptu |
|---|---|---|
| 1 | `weapon` | ornate one-handed sword with engraved crossguard |
| 2 | `armor` | segmented plate chest armor, battle-worn |
| 3 | `helmet` | horned steel helmet with etched visor |
| 4 | `boots` | reinforced leather greaves with steel buckles |
| 5 | `shield` | round kite shield with engraved gold rim emblem |
| 6 | `necklace` | gold pendant necklace with a single dark gemstone |
| 7 | `earrings` | pair of ornate gold dangling earrings |
| 8 | `ring` | thick engraved gold signet ring with a gem |
| 9 | `consumable` | glowing red healing potion in a round glass vial with cork |
| 10 | `material` | rough uncut ore crystal cluster |
| 11 | `quest` | sealed wax-stamped parchment scroll tied with cord |
| 12 | `chest` | ornate iron-bound treasure chest, closed |
| 13 | `rod` (wędka) | wooden fishing rod with brass fittings and reel |
| 14 | `pickaxe` | mining pickaxe with worn wooden handle and steel head |
| 15 | `bait` (przynęta) | small cork-topped glass jar of glistening fishing lures and bait |
| 16 | `catalyst` (ulepszacz kowadła) | small vial of swirling molten-gold forge essence with a rune-stamped stopper |
| 17 | `book` | closed leather-bound spellbook with a gold clasp |

Jedna generacja = jeden konkretny przedmiot (np. "krótki miecz z rubinem w rękojeści", nie cały
wiersz tabeli naraz) — im bardziej szczegółowy opis w `[ITEM]`, tym bliżej finalnej grafiki,
reszta promptu (styl/oświetlenie/transparent background) zostaje bez zmian dla spójności całego
zestawu ikon.

**Format wyjściowy generatora**: jeśli generator nie umie zapisać prawdziwej przezroczystości
(np. eksport tylko do JPG), często rysuje szachownicę bezpośrednio w pikselach zamiast realnego
kanału alfa — to trzeba wtedy usunąć osobno przed wdrożeniem (nie jest to błąd promptu).

## Checklista przed wysłaniem

1. Tekst po polsku, w tonie reszty gry.
2. Własna grafika (jeśli jest) to prawdziwy plik PNG/SVG z przezroczystym tłem, nie screenshot.
3. Wzór wyżej wypełniony.
4. Wskazany najbliższy istniejący element gry jako punkt odniesienia.

Realne tokeny kolorów/fontów: `apps/web/DESIGN.md`.
