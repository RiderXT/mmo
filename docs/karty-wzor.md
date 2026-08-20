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

## Checklista przed wysłaniem

1. Tekst po polsku, w tonie reszty gry.
2. Własna grafika (jeśli jest) to prawdziwy plik PNG/SVG z przezroczystym tłem, nie screenshot.
3. Wzór wyżej wypełniony.
4. Wskazany najbliższy istniejący element gry jako punkt odniesienia.

Realne tokeny kolorów/fontów: `apps/web/DESIGN.md`.
