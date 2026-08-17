---
name: MMO (working title — see PRODUCT.md)
description: Browser-based idle Metin2-style MMO with a torchlit, gold-on-ink guild-hall aesthetic
colors:
  ink: "oklch(12% 0.02 45)"
  panel: "oklch(19% 0.025 45)"
  panel-raised: "oklch(24% 0.03 45)"
  line: "oklch(40% 0.035 45)"
  line-soft: "oklch(48% 0.035 45)"
  gold: "oklch(76% 0.09 85)"
  gold-bright: "oklch(80% 0.14 85)"
  parchment: "oklch(92% 0.01 60)"
  parchment-dim: "oklch(65% 0.02 50)"
  parchment-faint: "oklch(60% 0.02 55)"
  hp: "oklch(48% 0.16 25)"
  hp-bright: "oklch(58% 0.16 25)"
  mp: "oklch(48% 0.13 250)"
  mp-bright: "oklch(62% 0.13 250)"
  rarity-common: "oklch(60% 0.02 50)"
  rarity-uncommon: "oklch(68% 0.09 145)"
  rarity-rare: "oklch(62% 0.09 250)"
  rarity-epic: "oklch(50% 0.12 300)"
typography:
  display:
    fontFamily: "Cinzel, Cambria, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
    fontWeight: 700
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace"
    fontSize: "12px"
rounded:
  none: "0px"
  sm: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  button-primary-hover:
    backgroundColor: "{colors.gold-bright}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.parchment-dim}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-raised}"
  panel-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
    padding: "16px"
  item-slot:
    backgroundColor: "{colors.panel-raised}"
    rounded: "{rounded.none}"
    size: "56px"
  input-field:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: MMO (working title)

## Overview

**Creative North Star: "The Torchlit Arena Ledger"**

The system reads as a fighting guild's war-room after hours: a near-black stone-and-ink
ground, warm gold torchlight picking out the edges of ledgers, plaques, and equipment sockets,
and a carved-serif hand (Cinzel) for anything that would have been chiseled or gilt-lettered —
the arena's name, a character's title, a price tally. Everything else — the actual reading and
doing — runs in a plain, high-legibility grotesque (Inter), because the player is farming and
managing inventory far more often than they are admiring a plaque. The defining motif is the
engraved corner bracket on every panel (`.panel`'s gold `::before`/`::after` L-brackets): the
game borrows the visual grammar of a museum label or a ledger page corner, not a game-UI card.
Item and equipment sockets stay sharp-edged dashed rectangles — a deliberate contrast with the
softly rounded chrome around them — reading as physical slots you drop something into, not
just another rounded card.

The palette was carried over near-verbatim from a user-supplied visual sketch ("Fight Club")
built in Claude Design; it is the confirmed source of truth for color and type, not a
placeholder. The game's own name is still undecided (see PRODUCT.md) — "FIGHT CLUB" appears on
the login screen as the sketch's working title, not a confirmed brand name, so treat that
wordmark as provisional.

**Key Characteristics:**
- Near-black warm-neutral ground (`oklch` hue 45) with a single gold accent used sparingly for
  action and emphasis, never as a fill color for large surfaces.
- Cinzel for anything ceremonial or numeric-emphatic (headers, prices, the character's name,
  the brand wordmark); Inter for everything read at length or interacted with.
- Every structural card carries the gold corner-bracket motif; nothing else on the page
  competes with it for attention.
- Item/equipment sockets are sharp dashed rectangles; every other surface (cards, buttons,
  inputs, badges) is softly rounded. The contrast is the point — don't round the sockets to
  match.
- Semantic combat colors (HP crimson-orange, MP blue) are reserved for vitals and combat-log
  narration; they never substitute for the gold accent elsewhere.

## Colors

A near-monochrome warm-black ground carries the whole system; gold is the single accent, and
two combat-semantic hues (HP, MP) exist only inside vitals and combat narration.

### Primary
- **Torch Gold** (`oklch(76% 0.09 85)`, token `gold`): the one accent. Primary buttons, active
  nav state, panel corner-brackets, headings that need emphasis (prices, level badges, the
  brand wordmark). **The One Torch Rule.** Gold never fills a surface larger than a button or a
  badge — it always reads as a highlight caught by torchlight, never as a background wash.
- **Torch Gold Bright** (`oklch(80% 0.14 85)`, token `gold-bright`): hover/active state for gold
  elements, and the "highlighted stat changed" color in comparison tables (Kowadło's
  before/after, upgrade level badges).

### Secondary
- **Ember Crimson** (`oklch(48% 0.16 25)` / bright `oklch(58% 0.16 25)`, token `hp`): health —
  vitals bar fill, damage-taken lines in the combat log, the "character died" line. Never used
  outside combat/vitals context.

### Tertiary
- **Arcane Blue** (`oklch(48% 0.13 250)` / bright `oklch(62% 0.13 250)`, token `mp`): mana —
  mana bar fill, and (currently) the header's XP progress bar fill, which borrows this hue
  rather than gold so the XP bar doesn't compete visually with gold accents nearby in the same
  header.

### Neutral
- **Ink** (`oklch(12% 0.02 45)`, token `ink`): page background; also the text color on filled
  gold buttons/badges.
- **Panel** (`oklch(19% 0.025 45)`, token `panel`): the standard card/panel surface — deliberately
  a wide lightness gap from `ink` (was a near-invisible 2 points; widened this session so cards
  read as distinct surfaces at a glance, not a wash of the same near-black).
- **Panel Raised** (`oklch(24% 0.03 45)`, token `panel-raised`): one step brighter — item
  slots, stat-card fills, secondary-button hover, avatar badge gradients.
- **Line** (`oklch(40% 0.035 45)`, token `line`) / **Line Soft** (`oklch(48% 0.035 45)`,
  token `line-soft`): borders, from structural (panel edges, table rules) to interactive
  (input/button outlines, item-slot dashed borders). Line Soft is tuned to clear WCAG 1.4.11's
  3:1 non-text contrast minimum against `ink` specifically — the case that matters, since input
  fields sit directly on `ink` with no background-color cue marking their boundary. `line` sits
  on backgrounds that are already differentiated by tone (panels, dividers), so it's improved but
  not pushed to the same strict bar — see Elevation & Depth for why that's an intentional,
  reasoned tradeoff rather than an oversight.
- **Parchment** (`oklch(92% 0.01 60)`) / **Parchment Dim** (`oklch(65% 0.02 50)`) /
  **Parchment Faint** (`oklch(60% 0.02 55)`): body text, from primary reading text down to the
  faintest captions and placeholder-state copy. Parchment Faint is tuned to clear 4.5:1 (WCAG AA
  for normal-size text) against both `ink` and `panel` — it was 50% lightness (only ~3.1:1)
  before this session's accessibility pass, since it's used for genuinely small (9–11px) caption
  text throughout inventory/equipment UI, not just large decorative text.

### Item rarity scale (semantic, not brand)
Four additional hues gate item quality across tooltips, borders, and admin item cards —
**Common** (`oklch(60% 0.02 50)`, neutral grey), **Uncommon** (`oklch(68% 0.09 145)`, green),
**Rare** (`oklch(62% 0.09 250)`, blue — shares Arcane Blue's hue by design), **Epic**
(`oklch(50% 0.12 300)`, violet). These are a closed, ordered scale; don't reassign a rarity hue
to an unrelated UI role.

### Named Rules
**The One Torch Rule.** (see Primary, above.)
**The Semantic-Only Rule.** HP crimson and MP blue only ever appear inside combat/vitals
context (bars, combat-log lines, potion effects). They are not general-purpose secondary/
tertiary brand colors for non-combat UI.

## Typography

**Display Font:** Cinzel (fallback Cambria, Iowan Old Style, Palatino Linotype, Georgia, serif)
**Body Font:** Inter (fallback -apple-system, Segoe UI, Roboto, sans-serif)
**Label/Mono Font:** SFMono-Regular (fallback Consolas, Liberation Mono, Menlo, monospace)

**Character:** A carved serif capital paired with a plain, efficient grotesque — the pairing
reads as "gilt lettering over a working ledger," formal only where it needs to command
attention, functional everywhere the player is actually scanning or acting.

### Hierarchy
- **Display** (Cinzel, 700, all `h1`–`h3` plus explicit uses): page/panel titles, the brand
  wordmark, a character's name in the equipment view, price numerals in shop cards. Always
  paired with generous letter-spacing (`0.01em` baseline, up to `0.08em`–`0.1em` on wordmarks
  and section eyebrows) — Cinzel reads worst set tight.
- **Body** (Inter, 400–700 by weight utility): everything else — labels, stat values, buttons,
  descriptions, table cells.
- **Label/Mono** (SFMono, 12px): reserved for technical/machine strings only — currently just
  admin log request IDs. Don't reach for it as a stylistic accent elsewhere.

### Named Rules
**The Ceremony Rule.** Cinzel is for things that would have been engraved or gilt-lettered:
titles, names, prices, the wordmark. It never carries a sentence of prose or a button's default
label — buttons stay Inter even when gold-filled.

## Layout

No formal grid system; layout is composed ad hoc with Tailwind flex/grid utilities at a
consistent, informal spacing rhythm: `gap-2`/`gap-3` (8–12px) inside a component,
`gap-4`/`mt-4` (16px) between sibling sections, `p-4` (16px) as the default panel/card
internal padding, tightening to `p-3`/`p-3.5` for denser item-grid cards. Two-column layouts
(the NPC tab's inventory-vs-shop split, the combat log's player-vs-enemy columns) use
`grid lg:grid-cols-2 gap-4`, collapsing to a single stacked column below `lg`. The equipment
view's three-column layout (equip slots / portrait / equip slots) is the one deliberately
symmetric composition in the system and should stay that way — it's read as a shrine, not a
form.

The left sidebar is a fixed `w-56`–`w-60` rail on desktop, collapsing to a full-width slide-in
drawer below `md`; the top header bar is sticky and persists across both breakpoints rather
than only appearing on mobile.

## Elevation & Depth

Mostly flat by design — the primary depth cue is still the `ink` → `panel` → `panel-raised`
tonal ladder (each step ~5–7% lighter in `oklch`), not cast shadows. `.panel` itself also carries
a soft `0 4px 14px rgba(0,0,0,0.4)` shadow (added alongside the contrast widening above) as a
second, redundant boundary cue — useful precisely because `line`'s border-only contrast on a
panel doesn't reach the strict WCAG non-text minimum on its own (see Neutral, above); the shadow
plus the tonal step together carry the boundary. `shadow-lg` remains reserved for genuinely
floating overlays (the item context menu, the item tooltip, the login card). Modals add a flat
`bg-black/60` backdrop rather than a shadow to separate themselves from the page beneath.

### Named Rules
**The Tonal-Not-Cast Rule.** Reach for the next step up the `ink`/`panel`/`panel-raised` ladder
before reaching for a `box-shadow`. `shadow-lg` is reserved for genuinely floating elements
(menus, tooltips, the login card); `.panel`'s own soft shadow is a fixed, quieter exception that
exists specifically to back up border contrast, not a precedent for shadows on ordinary
card-on-page separation elsewhere.

## Shapes

Two deliberately different corner languages coexist on purpose. Structural chrome — panels,
buttons, inputs, avatar/level badges, shop item cards — rounds softly: `rounded-md` (6px) for
buttons and inputs, `rounded-lg` (8px) for small icon boxes, `rounded-xl` (12px) for panels and
cards, `rounded-full` for pill buttons, avatar frames, and status dots. Item and equipment
sockets (`GridSlot`, `EquipSlotBox`, `ActiveItemSlotBox`, `AnvilSlotBox`) stay perfectly square
with **no** radius and a **dashed** border — they read as a physical cutout, not a card.

The signature panel treatment is the gold engraved corner-bracket: two 2px-thick, 10px-long L
brackets in `gold`, placed at the panel's top-left and bottom-right corners only (not all four —
that would read as a full frame instead of an engraved detail). Every top-level panel in the
game (not modals, not floating menus) carries this.

### Named Rules
**The Socket-vs-Surface Rule.** If it's something an item gets dropped into, it's a sharp
dashed square. If it's something that holds UI, it's a soft-rounded solid surface. Never round
a socket to match its surroundings.
**The Two-Corner Rule.** Panel corner-brackets appear only at top-left and bottom-right. Four
corners reads as a border, not an engraving.

## Components

### Buttons
- **Shape:** `rounded-md` (6px) on the current, restyled surfaces (login, NPC tab, buy modal,
  header). Note: several older, not-yet-revisited buttons in `ExpeditionPanel.tsx`,
  `CharacterTab.tsx`, and `AnvilTab.tsx` still ship with sharp corners (no radius class) from
  before the restyle — treat `rounded-md` as the standard going forward and bring those into
  line opportunistically rather than reading them as an intentional second style.
- **Primary:** solid `gold` fill, `ink` text, `font-medium`/`font-bold`, `px-4 py-1.5` (or
  `py-3` for the full-width login CTA). Hover moves to `gold-bright`.
- **Secondary/Ghost:** transparent fill, `border-line-soft` outline, `parchment-dim` text.
  Hover fills `panel-raised`. Used for "cancel," "back," and non-committal navigation actions.
- **Disabled:** `opacity-50`, `cursor-not-allowed`, no hover state change.
- **Icon-only / pill toggles** (NPC-selector pills, inventory tab switcher): `rounded-full` or
  small `rounded` square, active state is a `gold`-bordered `gold/10`-filled variant of the same
  shape rather than a different shape.

### Cards / Containers (`.panel`)
- **Corner Style:** `rounded-xl` (12px), plus the gold two-corner bracket motif (see Shapes).
- **Background:** `panel` (`oklch(19% 0.025 45)`).
- **Border:** 1px `line`.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Internal Padding:** `p-4` (16px) standard; denser item-grid cards use `p-3`–`p-3.5`.

### Item Slots (signature component)
Dashed-border sockets used throughout inventory, equipment, active-item, and Kowadło UI
(`GridSlot`, `EquipSlotBox`, `ActiveItemSlotBox`, `AnvilSlotBox`). Square, `56px` (`80px` for
the single Kowadło anvil slot), 1px dashed `line-soft` border at rest (all four socket components
share this token now — `GridSlot` used the weaker `line` until this session's accessibility pass,
since sockets are interactive drop targets, not decorative panel chrome), switching to `gold-bright`
border with a `gold/10` wash the instant a dragged item is over a valid target
(`dnd-kit`'s `isOver`). No radius. A small `parchment-faint` caption sits below the socket
(equip slot name, "Kowadło").

### Item Cards (`ItemBox`, signature component)
Square item tiles that live inside the sockets above. Border and background tint by item type
at low opacity (`border-{type}/60 bg-{type}/10` — weapon/consumable lean crimson, armor/helmet/
boots lean rare-blue, jewelry leans gold, material leans common-grey, quest leans epic-violet,
chest leans gold-bright). Selected state is a `ring-2 ring-gold-bright`; dragging drops to
`opacity-40`. An upgrade-level badge (`+N`, `gold-bright`) sits top-left; a stack-quantity badge
sits bottom-right. Hover-reveals a full-stat tooltip (see Tooltips below) without needing a
click.

### Inputs / Fields
- **Style:** `ink` background, 1px `line-soft` border, `rounded-md`, `px-3 py-2` (`py-2.5` on
  the login screen's larger fields).
- **Focus:** border shifts to `gold`. No glow/ring.
- **Label:** `parchment-dim`, sits above the field, not inline/floating.

### Modals
Centered overlay pattern (`MonsterPickerModal`, `BattleTacticsModal`, `BuyItemModal`): full-
screen `fixed inset-0` wrapper, flat `bg-black/60` backdrop (click-to-dismiss), a `panel` box
capped at `max-w-sm`–`max-w-lg` and scrollable past `85vh`. Footer is always a right-aligned
button pair: secondary "Anuluj"/"Wstecz" first, primary gold action last. All three also dismiss
on Escape via the shared `useEscapeKey` hook (`hooks/useEscapeKey.ts`), matching the item context
menu's own dismiss behavior below — use that hook for any future modal instead of re-implementing
the keydown listener inline.

### Floating Menus & Tooltips
Two lighter-weight overlay patterns that intentionally skip the modal backdrop and the panel
corner-bracket: the right-click item context menu (`fixed`, positioned at the cursor, `w-44`,
sharp corners, `shadow-lg`, dismiss on outside-click/Escape) and the item hover tooltip
(pure-CSS `group-hover` reveal, `w-56`, sharp corners, `shadow-lg`, no JS state). Both stay
sharp-cornered rather than `rounded-xl` — they're momentary overlays, not panels, and shouldn't
borrow the panel's ceremony.

### Navigation (sidebar)
Section headers are a small rotated-diamond bullet (`rotate-45`, 1.5px `gold/40` border) plus a
`gold/15` bottom rule and an uppercase, letter-spaced (`0.14em`) `parchment-faint` label — never
just a bare label. Each nav link carries a circular icon badge (`rounded-full`, gradient
`panel-raised`→`panel`, 1px border) with a small solid color dot inside, distinct per
destination (not a semantic color system — decorative variety), plus a `border-l-2` accent on the
row itself (`transparent` at rest, `gold-bright` when active) — a restrained active-state
indicator, not the generic per-card side-stripe the "AI slop" pattern usually refers to. Active
state: `gold/60` badge border + `gold/10`-filled, `gold/60`-bordered row background. Disabled/
gated links (Kowadło and NPC outside a town) render as a non-interactive, `50%`-opacity row with
the same badge shape, carrying a `title` tooltip explaining the gate rather than being hidden.

### Header (signature component)
Sticky bar spanning the full page, present on both desktop and mobile (not a mobile-only
pattern). When a character is active it shows: a `rounded-lg`, `gold/60`-bordered avatar square
with the character's initial in Cinzel; the character name (Inter, bold) plus a small
`gold`-bordered, `gold/10`-filled level pill; a thin (`h-1.5`, `rounded-full`) XP progress bar
in the `panel-raised` track filled with the Arcane Blue gradient (not gold — see Tertiary); and
a right-aligned gold-dot gold-numeral gold count.

## Do's and Don'ts

### Do:
- **Do** keep gold to buttons, active states, badges, and the panel corner-bracket — never a
  full-surface fill (**The One Torch Rule**).
- **Do** use Cinzel only for titles, names, prices, and the wordmark; keep body copy, labels,
  and button text in Inter (**The Ceremony Rule**).
- **Do** give every top-level panel the two-corner gold bracket at top-left/bottom-right only
  (**The Two-Corner Rule**).
- **Do** keep item/equipment sockets sharp-cornered and dashed even as everything around them
  rounds softly (**The Socket-vs-Surface Rule**).
- **Do** reach for the `ink`/`panel`/`panel-raised` tonal ladder before adding a `box-shadow`
  (**The Tonal-Not-Cast Rule**).
- **Do** pair every disabled/gated nav item with a `title` explaining the gate, rather than
  hiding it outright (established pattern for "Kowadło"/"NPC" outside a town).

### Don't:
- **Don't** introduce a second accent color alongside gold for ordinary emphasis — reach for
  `gold-bright`, weight, or size instead.
- **Don't** use the HP/MP semantic colors outside combat/vitals context (**The Semantic-Only
  Rule**).
- **Don't** round item/equipment sockets to match surrounding cards — the contrast with the
  soft-rounded chrome is the point, not an inconsistency to fix.
- **Don't** add the panel corner-bracket to modals, floating menus, or tooltips — that motif is
  reserved for top-level page panels.
- **Don't** treat the sharp-cornered buttons still present in `ExpeditionPanel.tsx`/
  `CharacterTab.tsx`/`AnvilTab.tsx` as the intended style — `rounded-md` (as shipped in the
  login, NPC tab, header, and buy-modal buttons) is the standard.
- **Don't** assume "FIGHT CLUB" is the final game name when writing new copy — it's the visual
  sketch's working title, not a confirmed brand (see PRODUCT.md).
