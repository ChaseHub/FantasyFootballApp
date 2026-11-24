# THE CLUBHOUSE — Complete UI Style Specification
## Visual identity: Porcelain / Graphite / Jade

### 0. Project directive
Completely redesign the fantasy-football Angular application using this specification as the single source of visual truth. Do not use the previous interface, layouts, colors, or component treatments as reference. Preserve actual app functionality and data accuracy, but replace the presentation system. Design for a private fantasy league using Sleeper API data; the result should feel like a premium, bespoke sports-intelligence product rather than a generic statistics dashboard, gaming overlay, or component-library demo.

**North star:** editorial restraint + architectural bento composition + tactile precision + athletic energy. The interface must feel engineered, elegant, calm, fluid, and occasionally dramatic. Impress with craft, not decoration.

**Visual adjectives:** polished, premium, crisp, inviting, quiet, confident, modern, tactile, deliberate, distinctive. **Anti-adjectives:** gamer neon, casino, crypto dashboard, glassmorphism overload, default SaaS template, plastic 3D, excessive gold, cluttered widgets.

### 1. Design concept and hierarchy
- Use a **light-first warm-mineral identity**, not conventional pure white or the former near-black dashboard. Pair a porcelain canvas with deep graphite typography, low-relief raised cards, and a small amount of dark cinematic contrast.
- The canvas is calm; the data supplies the excitement. Each screen gets **one featured dark panel** that anchors the hierarchy. Everything else is light, quiet, and precise.
- Use asymmetric, editorial bento grids with consistent card spacing and deliberate spans. Avoid an undifferentiated grid of equally prominent cards.
- Use neumorphism as **micro-materiality**, not as the primary information hierarchy. Soft relief should make segmented controls, inset stat wells, and selected surfaces feel beautifully machined. Every actionable element still needs a visible label, contrast, and focus state.
- Premium treatment comes from spacing, composition, precise alignment, tabular numbers, and thoughtful states. No random decoration.

### 2. Color system — exact values

**Foundations**
| Token | Value | Usage |
|---|---|---|
| `--canvas` | `#F4F2ED` | Global warm porcelain background |
| `--surface` | `#FFFEFB` | Default raised cards and menus |
| `--surface-soft` | `#F7F7F2` | Nested groups, table headers, quiet sections |
| `--surface-recessed` | `#EBEDE7` | Pressed controls, empty chart tracks |
| `--border` | `#D8DDD7` | Dividers, input borders, outlines |
| `--border-strong` | `#B8C5BD` | Interactive borders and active outlines |
| `--ink` | `#172322` | Primary copy and headings |
| `--ink-secondary` | `#4F615C` | Supporting copy and descriptions |
| `--ink-muted` | `#617069` | Metadata and labels; not lower opacity |

**Identity + contrast**
| Token | Value | Usage |
|---|---|---|
| `--jade` | `#205D50` | Brand accent, active states, chart focus, links |
| `--jade-hover` | `#174A40` | Active hover |
| `--jade-soft` | `#E4EFE9` | Soft selection/active backgrounds |
| `--graphite` | `#1B2926` | Sidebar, one feature panel per page |
| `--graphite-raised` | `#2A3A35` | Nested tiles inside a dark panel |
| `--on-graphite` | `#F9F8F2` | Primary text on dark |
| `--on-graphite-muted` | `#B9C9C1` | Secondary text on dark |
| `--signal` | `#D8EA94` | Rare high-energy highlight inside a dark featured panel only |
| `--brass` | `#B38D59` | Optional decorative micro-accent, max one detail per screen; never small text |

**Semantic**
| Token | Value | Usage |
|---|---|---|
| `--positive` | `#206846` | Win, positive movement, success |
| `--positive-soft` | `#E6F2E9` | Positive background |
| `--negative` | `#A63D36` | Loss, negative movement, error |
| `--negative-soft` | `#F8E9E5` | Negative background |
| `--warning` | `#8B5A22` | Questionable, alert, caution |
| `--warning-soft` | `#F6EEDF` | Warning background |
| `--neutral-soft` | `#E9ECE7` | Neutral pills and placeholders |

**Allocation:** ~75% porcelain and light surfaces, ~18% graphite and text, ~6% jade, ~1% signal/brass/semantic highlights, adjusted as content requires. Avoid rainbow-colored teams, gradients in each card, colored card borders, and using signal lime on ordinary white surfaces. Team branding/colors may appear only in tiny logos or optional identity marks without overriding system typography or semantic colors.

### 3. Typography
- **Primary font:** `Manrope`, variable weights 400–800; fallback `Inter`, `Segoe UI`, sans-serif. Use one clear sans family for the whole interface.
- **Data font:** `IBM Plex Mono`, fallback `SFMono-Regular`, Consolas, monospace; reserve for precision stats, ranks, scores, points, times, records, and small data labels. Apply `font-variant-numeric: tabular-nums` to all numerical surfaces, including when using Manrope.
- **Fluid scaling (`clamp()`):** Page headings, hero metrics, and section headings must scale continuously via `--text-*` `clamp()` tokens rather than fixed pixel sizes with discontinuous jump overrides.
- **Display/hero metric:** `clamp(2.25rem, 6vw, 4.25rem)` (36px compact mobile to 68px desktop); 700–800 weight; line-height 1.0; letter spacing `-0.055em`. Use large type for ONE number or matchup per region, not every statistic.
- **Page heading:** `clamp(1.625rem, 3.6vw, 2.5rem)` (26px mobile to 40px desktop); 750 weight; line-height 1.12; letter spacing `-0.045em`.
- **Section heading:** `clamp(1.125rem, 1.8vw, 1.375rem)` (18–22px); 700; line-height 1.25; tracking `-0.025em`.
- **Card title:** 15–17px; 700; line-height 1.35; tracking `-0.015em`.
- **Body:** 14px–15px; 450–500; line-height 1.55. Note: mobile interactive `<input>` / search fields stay `>=16px` or avoid viewport zoom hazards where appropriate.
- **Metadata:** 12–13px; 600; line-height 1.4; sentence or title case by default. Avoid uppercase except occasional 11px overlines with `0.09em` tracking.
- **Numeric table cells:** 13–14px, 500–600; right-aligned; tabular numerals; consistent decimal precision.
- Never fake hierarchy with ultra-low-contrast text. Do not use all-caps labels everywhere, thin decorative fonts, or letter spacing on body copy.

### 4. Grid, spacing, geometry
- Author styles **mobile-first** (`base < 768px` -> `md >= 768px` -> `lg >= 1024px` -> `xl >= 1280px` -> `2xl >= 1680px`), backed by CSS container queries (`@container`) inside cards and bento regions.
- Global desktop shell: 240px dark graphite navigation rail + flexible main canvas; main content width `min(100%, 1480px)` with fluid gutters via `clamp()` (`14px–16px` mobile, `24px–28px` tablet, `32px–40px` desktop).
- Keep page content visually centered inside available main space; don't allow cards to stretch to absurd widths on ultrawide monitors.
- Bento grid: 1 column base (`<768px`), 6 columns tablet (`768–1279px`), 12 columns desktop (`>=1280px`). Gaps scale cleanly (`12–14px` mobile, `16px` tablet, `18px` desktop). Cards span purposefully at `md`/`xl` (`span-md-*`, `span-xl-*`) rather than relying on fragile `max-width` overrides.
- Card padding: fluid `clamp(16px, 2.2vw, 26px)` (headline feature panels `clamp(18px, 2.6vw, 32px)`). Internal content spacing: `8/12/16/24px`.
- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px` (or fluid `clamp()` steps between those anchors). Prefer alignment between neighboring panels to adding new decorative spacing.
- Border radii: `8px` small pills or compact controls, `12px` buttons/inputs, `16px` nested tiles, `22px` main bento panels, `28px` featured hero. Never make every component pill-shaped.
- Minimum controls: 40px high desktop; **mandatory `>=44px` touch targets on `<768px` and tablet touch contexts**. Dense tables are allowed on wide screens, while phone views must promote touchable card lists or pinned-column comparative views.
- Use consistent baselines and align data edges, not just centers. Left-align descriptive text; right-align numeric comparisons.

### 5. Materials, shadow, and restrained neumorphism
- **Standard card:** warm ivory fill, faint `1px` neutral edge, natural ambient shadow. Shadow: `0 2px 4px rgba(23,35,34,.025), 0 14px 34px rgba(23,35,34,.055)`.
- **Feature card:** solid graphite, subtle inner highlight (`inset 0 1px 0 rgba(255,255,255,.08)`), deep ambient shadow. No flashy gradient overlay, fluorescent glow, glass blur, or starfield.
- **Raised micro-control:** two-sided soft relief, e.g. `3px 3px 8px rgba(23,35,34,.08), -3px -3px 8px rgba(255,255,255,.86)` **on the porcelain canvas**, not on every card.
- **Recessed control/well:** `inset 2px 2px 5px rgba(23,35,34,.07), inset -2px -2px 5px rgba(255,255,255,.82)` with visible outline and text.
- Limit neumorphism to segmented-control tracks, filter wells, subtle score wells, or selected tactile buttons. Never let shadows alone indicate selected/disabled/focused state.
- Shadows are quiet at rest and modestly lift on interactive hover; avoid dramatic parallax or floating-card theatrics.
- Borders are structural, not decoration. No golden outlines, chrome bevels, outer glows, or gradients on routine components.

### 6. Navigation and page frame
- **Mobile (`<768px`) — Mobile-First Frame:** Compact sticky top utility bar (brand + league quick-switch pill, quick search trigger, theme/settings shortcut) paired with a fixed 5-slot bottom dock (`Overview`, `Matchups`, `Watch`, `Standings`, `More` Hub Sheet) with safe-area padding (`env(safe-area-inset-bottom)`). Tapping `More` opens a **categorized visual Hub Bottom Sheet** (pinned My Team card, League/Season pickers, and grouped destination tiles—never an unorganized plain link dump).
- **Tablet (`768–1279px`):** Collapse sidebar cleanly into a `72px` graphite icon rail (`md`) with accessible labels/tooltips and touch-safe `48px` targets. Secondary controls and pickers use clean floating popovers.
- **Desktop (`>=1280px`):** Fixed/sticky `240px` graphite sidebar with compact wordmark, league identity block, custom `<app-picker>` season selector, and navigation groups (**Overview, Matchups, Watch Party, NFL Games, Standings, Playoffs, Draft, Teams, Players, Trades, History, Recaps, Insights, Settings, About**).
- Sidebar item: 42–46px desktop target (35–42px compact list item when spacious); 12px corner radius; left icon + text. Default text muted warm gray; active has a visible lighter graphite backing, bright ivory text, and a 3px signal accent bar. No large filled accent pills for each item.
- **Shared Page Header (`<app-page-header>`):** Overline, fluid `clamp()` page title, concise context line (collapsing secondary timestamps on small phones), and a disciplined action slot (at most 1–2 immediate triggers on `<768px`; overflow or secondary filters open in a clean bottom sheet).
- Preserve location and filter context across routes. Always expose the current week and season where important.

### 7. Page compositions — purposeful bento, not generic cards
**Overview / League HQ**
1. **Top featured panel (7/12 columns):** current matchup, or a league-wide featured weekly matchup if no user's team is identified. Include the two teams, subdued marks, large aligned scores, live/final/upcoming state, week, and one context line. Signal lime may highlight one single key live figure inside this graphite panel, never the full background. Never invent win probabilities.
2. **League pulse (5/12):** compact bento of highest scorer, closest matchup, biggest swing, or another actually computable league insight. Show useful empty states if an insight is unavailable.
3. **Standings snapshot (5/12):** top five with rank, avatar, name, record, points-for, and a clear link to full table.
4. **Scoring trend (7/12):** elegant chart of league weekly scoring or selected team's scoring, clearly labeled with a legend if multiple series.
5. **Optional bottom row:** playoff picture / recent results / league records, only if populated with meaningful data. No placeholder cards merely to fill a symmetrical grid.

**Matchups**
- Make matchups the visual product, not repetitive long score tables. One featured live/current matchup; others in clean, consistent compact cards with scores, record context, status, and projection only if trustworthy data exists.
- Show week navigation as a small recessed segmented control. Make the entire matchup card navigable if appropriate, but maintain visible affordance and keyboard access.
- On detail: separate starter lineup comparisons, bench, and scoring summary; opposing players align in stable columns; show projected vs actual clearly and never blend them into one figure.

**Standings**
- A single strong full-width sortable table is preferable to twelve individual team cards. Rows: rank, team mark/name, W–L–T, PF, PA, streak, playoff position when determinable. Allow user-controlled sort and show the active sort.
- Playoff cutoff = thin labeled separation or subtle bracket, not a random colored line. Distinguish clinched, in contention, and eliminated only when officially derivable.
- Pair main standings with one narrow visual summary or playoff snapshot on large screens; stack on mobile.

**Teams**
- Team directory: concise portrait tiles in a 3–4 column layout, with consistent mark sizing and key record stats.
- Team detail: featured identity panel, season record, points trend, roster, matchup history. Keep actual athlete headshots contained and unfiltered; use placeholders when missing.

**Players / Insights**
- Searchable, filterable, sortable player table. Prefer rows over huge trading-card layouts for information-dense exploration.
- Highlight key stats with a small compact trend chart only if the data supports it. Do not invent advanced metrics, predictions, or rankings from Sleeper API fields without documenting the calculations.

### 8. Component language
- **Buttons:** Primary = graphite fill + ivory text; Secondary = warm white fill + strong border + graphite text; Tertiary = text/icon only. Jade is primarily for active, links, selected filters, and chart focus—not every button. Heights: `>=44px` base mobile/touch / `40px` desktop / `34px` desktop compact. Radius 12px. Hover adjusts contrast and may lift 1px.
- **Custom Pickers (`<app-picker>` replacing native `<select>`):** Raw browser `<select>` elements are disallowed in app UI. Use `<app-picker>`: a structured trigger pill (`>=44px` mobile) displaying optional team avatar, current selection, subtitle/record, and chevron. On `<768px`, tapping opens an accessible `<app-bottom-sheet>` with optional search input and touch-friendly rows; on `>=768px`, it opens a crisp floating menu popover.
- **Bottom Sheets & Popovers (`<app-bottom-sheet>`):** Anchored bottom drawer on `<768px` (top drag handle, backdrop scrim, safe-area inset bottom padding, Escape & backdrop dismissal, focus containment) transitioning to a floating centered dialog or anchored popover on `>=768px`.
- **Segmented controls:** recessed neutral track, clearly selected raised ivory segment with subtle shadow, 12px radius. On `<768px`, multi-option segments render as a smooth `scroll-snap-type: x proximity` horizontal pill rail (never wrapping clumsily into 2–3 jagged rows). Selection must be visible without relying on hue alone.
- **Week Steppers (`<app-week-stepper>`):** Unified `← Week X →` pill switcher whose center label opens a `<app-picker>` week sheet on phone rather than rendering 18 cramped `W1..W18` buttons.
- **KPI / Stat Strips (`<app-kpi-rail>`):** Horizontal snap-scroll rail (`~68%` to `46%` card width with edge peek affordance) or crisp 2x2 grid on `<768px` so top hero metrics never stack 4-tall above the fold; expands cleanly to 2x2 or 4-up bento tiles at `md`/`xl`.
- **Inputs/search:** white or lightly recessed fill, border `--border`, graphite text, real placeholder, focus ring `2px solid --jade` with 3px neutral offset. Clear buttons and accessible labels.
- **Tabs:** quiet text tabs with underline or soft active backing. No oversized rounded tabs across the entire page.
- **Chips:** compact 24–28px, neutral for categories, tinted semantic backgrounds for actual states; use full labels like “Final”, “Live”, “Questionable”. No decorative rainbow tags.
- **Avatars/team marks:** 32px lists, 40–48px cards, 64px featured; consistent containment and clipping, no aggressive logo treatments. Use deterministic initials fallback on missing assets.
- **Tables & Mobile Card Transforms:** Dense precision tables (`48–56px` rows desktop, muted header band, sorted indicator + `aria-sort`) apply on `>=768px` or `>=1024px`. On `<768px`, wide multi-column tables (`>3–4` columns) must transform into scannable **Card Feeds** or **Sticky-Identity + Stat Strip** rows via `@container` / mobile-first rules so decisive metrics remain readable without squinting or endless horizontal scrolling.
- **Charts:** thin strokes (2–2.5px), no heavy grid, restrained neutral reference lines, clear labels, visible point hover/focus, compact tooltip with numbers/units and context. Do not use chart decorations to fill empty space.
- **Tooltips/popovers:** warm white or graphite surface; 12px radius; subtle shadow; concise content; keyboard, touch, and dismissal behavior.
- **Skeletons:** exact layout proportions matching the active breakpoint (mobile vs tablet vs desktop) with muted pulse or static placeholder; no jarring shimmer walls. Empty/error/no-season-data states are designed, not left blank.
- **Toast/status:** short, non-blocking and semantic; positioned above the mobile bottom dock (`bottom: calc(var(--mobile-dock-h) + var(--space-3) + env(safe-area-inset-bottom))`).

### 9. Visualization and sports-data rules
- Primary chart series: `#205D50`; secondary `#91AB9D`; reference `#B8C5BD`; optional third `#B38D59` only if easily distinguishable. Semantic win/loss colors reserved for their meaning.
- Distinguish chart series with line shapes/dashes/labels when needed, not just color. Use direct labels where possible.
- In scores, distinguish **live points**, **projected points**, and **final totals** by explicit text and formatting, not color alone.
- Format fantasy points consistently (usually two decimal places for scores, depending on league conventions); use tabular numerals. Percentages, rank and streak must have clear units/meanings.
- Use a real status: Upcoming, Live, Final, Bye, or data unavailable. Provide “Updated X ago” from real refresh metadata; don't fake real-time updates.
- Handle ties, absent avatars, missing rosters, postseason transitions, partial live data, and API-loading states gracefully.
- Large metrics should convey actual meaning, not just fill a card.

### 10. Motion and interaction
- Default easing: `cubic-bezier(.22, 1, .36, 1)` for entrances; `ease-out` for tiny hovers.
- Hover/focus transitions: 120–160ms; tabs/segments/menus: 180–220ms; page/panel entrances: 240–320ms. Transform only opacity/translate on entrances, not layout scale.
- Cards may lift **1–2px** on hover only if clickable. Non-clickable cards stay fixed. Never animate every card continuously.
- Staggered entrance: at most 30–45ms per panel for the first meaningful render, capped at ~200ms total. Don't repeat the entrance on every polling refresh.
- Score updates can briefly highlight the changed value with a restrained background fade, but avoid casino-style count-up on live changes.
- Loading indicators should not make the whole page jitter; reserve fixed heights for charts and matchup panels.
- Respect `prefers-reduced-motion: reduce`: disable nonessential transforms, stagger, and shimmer; interactions remain usable.

### 11. Responsive behavior
- **`<768px` (Phone — Mobile-First Base):**
  - Compact sticky top utility bar (brand/league switch pill + search + quick theme/settings) + 5-item bottom navigation dock (`Overview`, `Matchups`, `Watch`, `Standings`, `More` Hub Sheet) with `env(safe-area-inset-bottom)` clearance.
  - Fluid compact page headers: single primary title row (`clamp(24px, 6vw, 32px)`), collapsible context/timestamp badge, max 1–2 primary action controls visible; secondary filters/tools move into a bottom **Filter/Action Sheet**.
  - Feature dark panel stacks cleanly at top; 4-up metric strips become horizontal snap-scroll KPI rails (`1.3–2.1` cards visible with edge peek) or crisp 2x2 grids so the fold is never buried under vertical stacks of boxes.
  - Native `<select>` dropdowns are banned from mobile surfaces — use shared `<app-picker>` trigger pills backed by an accessible **Bottom Sheet** picker.
  - Wide `<table>` matrices transform into mobile-native **Card Feeds** or **Sticky-Identity + Horizontal Stat Strip** views — never raw shrunk desktop spreadsheets.
  - Score layouts remain legible down to `320px` width; team names wrap gracefully inside `minmax(0, 1fr)` without ever colliding with tabular scores.
- **`768–1023px` & `1024–1279px` (Tablet Portrait & Landscape):**
  - `72px` graphite icon rail (`md`) expanding cleanly or staying compact until `1280px` (`xl`), with tooltips and accessible labels.
  - Purposeful `6-column` bento layout (`3+3` symmetrical splits for rosters/comparisons, `6` for hero/featured tables) instead of half-cramped `5/7` or `4/8` desktop splits.
  - Custom pickers open as clean anchored **Popover Menus** rather than bottom sheets; split master-detail views (`Players`, `Teams`, `Matchups`) stack cleanly in `768–1023px` and split side-by-side at `>=1024px`.
- **`>=1280px` (`xl` Desktop & `>=1680px` `2xl` Ultrawide):**
  - `240px` graphite sidebar, `12-column` bento (`7/5`, `8/4`, `4/4/4`), `40px` main gutters, desktop dense table scanning alongside rich interactive sidebars.
- Safe-area padding for bottom navigation and notched viewports (`env(safe-area-inset-*)`); zero hover-only affordances anywhere in the app.

### 12. Accessibility and finish quality
- Aim for WCAG 2.2 AA. Normal text >= 4.5:1 contrast and large text >= 3:1; critical non-text UI boundaries and state indicators >= 3:1. Treat brass as decoration, not small light-on-light text.
- All controls have labels; clear `:focus-visible` treatment; proper keyboard order; no action available solely via hover; don't communicate injury or wins only through color.
- Semantic headings, buttons, links, table headers, tooltips; announcements for meaningful score/status updates without aggressive screen-reader noise.
- Give refresh and live-status indicators honest timestamps. Use proper pluralization, local time zones, numbers and skeleton states.
- Keep layout shifts small with reserved image aspect ratios and chart/container heights.
- Check full desktop, small laptop, tablet, and phone views. Hover, focus, selected, loading, empty, error, and disabled states are part of the design—not afterthoughts.

### 13. Hard visual constraints / quality bar
**Do**
- Give each page one unambiguous focal point, then let the eye discover precise supporting detail.
- Leave breathing room. Use purposeful asymmetry and a coherent 12-column grid.
- Apply the same radius, text scale, label tone, spacing, and numeric formatting across the product.
- Prefer actual content and insightful comparisons over decorative charts and widgets.
- Make dark/light surfaces feel like one material family, not unrelated themes.

**Never**
- Reuse the existing obsidian palette or near-black everywhere.
- Use giant glowing gradients, glassmorphic sheets, heavy borders, neon rainbow accents, ornamental icons, or card-after-card of identical weight.
- Use neumorphism on ordinary paragraph text, dense tables, or actionable items whose boundaries become ambiguous.
- Animate noninteractive cards, use spinning logos, or put an effect on every element.
- Hide data, make up metrics, or trade legibility for aesthetics.

### 14. Implementation acceptance criteria
A successful implementation should immediately read as a coherent, custom-designed premium sports product: warm mineral canvas; disciplined graphite rail; one memorable dark highlight; beautifully composed asymmetric bento cards; subtle dimensionality; fluid microinteractions; legible precision stats; intuitive navigation; tasteful emerald accents; fully intentional responsive and error states. It should not look like the previous dark dashboard, a generic Tailwind admin kit, or a gaming-themed fantasy site.

**Technical note:** Implement as reusable Angular components (`src/app/shared/ui/`) powered by the modular `@use` SCSS partial architecture (`src/styles/`) and CSS custom properties, not individually invented colors, duplicated `.page-head` hacks, or native `<select>` elements per view. Preserve real Sleeper/ESPN API data and compute any derived insights explicitly and defensively.

---

### 15. Mobile-First Architecture, Shared UI Primitives & Modern SCSS System

#### 15.1 Breakpoint System & Container Queries
All styles are written **mobile-first** (`base` for `0–767px`, enhancing upward via `@include mq($bp)`). Desktop-first `@media (max-width: ...)` rules are prohibited in new or rebuilt code except isolated print/mobile-only helpers.

| Token | Min Width | Layout Target | Navigation Chrome | Bento Columns |
|---|---|---|---|---|
| `base` | `0px` | Phones (`320–479px` narrow, `480–767px` standard) | Sticky slim top bar + 5-tab bottom dock + Hub sheet | `1` col (plus snap-scroll rails & 2x2 metric grids) |
| `sm` | `480px` | Large phones / landscape phones | Sticky slim top bar + bottom dock | `1` col (`2` col allowed inside card grids) |
| `md` | `768px` | Tablet portrait & small touchscreens | `72px` graphite icon rail (tooltips + accessible labels) | `6` cols (`span-md-3`, `span-md-6`) |
| `lg` | `1024px` | Tablet landscape & compact laptops | `72px` icon rail or split workspace | `6` or `12` cols (`span-lg-*`) |
| `xl` | `1280px` | Standard desktop | Full `240px` graphite sidebar | `12` cols (`span-xl-4/5/7/8/12`) |
| `2xl` | `1680px` | Ultrawide desktop | `240px` sidebar + centered `1480px` content frame | `12` cols (`min(100%, 1480px)`) |

- **Container Queries (`@container`):** Bento panels and reusable widgets (`.ch-card`, `.ch-feature`, team tiles, matchup cards, roster tables) declare `container-type: inline-size` where layout depends on allocated span width rather than viewport width. A `span-4` card on desktop behaves cleanly like a compact card even on a 1440px screen.
- **Logical Properties:** Prefer `padding-inline`, `margin-block`, `inset-inline`, and `gap` over left/right directional hacks.

#### 15.2 Modern SCSS Partial Architecture (`src/styles/`)
Global styling is modularized under `src/styles/` (registered via `angular.json` `stylePreprocessorOptions.includePaths`) using explicit CSS Cascade Layers:
`@layer reset, tokens, themes, base, layout, surfaces, controls, tables, utilities;`

- **`_tokens.scss`:** Spacing, z-index (`shell: 40`, `dock: 50`, `sheet: 70`, `popover: 80`, `toast: 90`), radii, safe-area inset tokens (`--mobile-dock-h`), and fluid `clamp()` scales (`--gutter`, `--card-pad`, `--hero-pad`, `--text-hero`, `--text-title`, `--text-section`).
- **`_themes.scss`:** Centralized `[data-theme]` CSS custom-property definitions (Porcelain default + dark/editorial variants) keeping component SCSS 100% theme-agnostic.
- **`_mixins.scss`:** Single source of truth for `@mixin mq($bp)`, `@mixin cq($width, $name: null)`, `@mixin touch-target($min: 44px)`, `@mixin focus-ring`, `@mixin scroll-rail`, `@mixin stack($gap)`, `@mixin row($gap)`, and `@mixin hide-scrollbar`. Component SCSS files **must `@use 'mixins' as *;`** instead of repeating `display: flex; flex-direction: column;` selector walls or custom media queries.
- **`_layout.scss`, `_surfaces.scss`, `_controls.scss`, `_tables.scss`:** Slim, clean primitives. Page stylesheets under `src/app/pages/` stay scoped strictly to genuinely page-unique compositions (`<=180` lines target per component).

#### 15.3 Core Shared UI Primitives (`src/app/shared/ui/`)
Pages must compose shared standalone UI primitives rather than copying markup:
1. `<app-page-header>` — Standardized fluid header supporting `overline`, `title`, collapsible mobile `context` line, primary CTA slot, and automatic mobile overflow / filter sheet trigger.
2. `<app-bottom-sheet>` — Shared modal sheet rendered as a thumb-reachable bottom drawer (`env(safe-area-inset-bottom)`) on `<768px` and dialog/popover on `>=768px`.
3. `<app-picker>` — Replaces every native `<select>` across Shell, Settings, Trades, History, Draft, Games, Insights, Teams, and Overview. Supports team avatars, record subtitles, optional search filtering, keyboard navigation, and `<app-bottom-sheet>` presentation on mobile.
4. `<app-kpi-rail>` — Horizontal swipeable peek strip (`scroll-snap-type: x mandatory`) on phone viewports that automatically promotes to a multi-column tile strip at `md`/`lg+`.
5. `<app-week-stepper>` — Touch-safe `← Week X →` control integrated with `<app-picker>` for rapid week jumping without wrapping `W1..W18` button rows.
6. `<app-filter-bar>` — Collapses multi-control desktop filter toolbars (position segments + ownership chips + sort selectors) into inline **Search + Active Filters Chip + `"Filters (N)"` Sheet button** on `<768px`.

#### 15.4 Page-Specific Mobile & Tablet Composition Standards
- **Shell & Navigation:** Mobile `More` button opens a structured **Clubhouse Hub Sheet** (Pinned My Team card -> League & Season pickers -> categorized 2-column icon tiles).
- **Overview:** Single compact header -> Featured Matchup Scorebug (`320px`-safe flex/grid) -> Horizontal Swipe League Pulse KPI rail -> Top 5 Standings Card list -> Responsive Scoring Trend chart.
- **Matchups & Watch Party:** Top horizontal matchup switcher ticker -> Sticky compact scorebug on Watch Party -> Slot-by-slot stacked **Head-to-Head Player Duel cards** on phone (`<768px`) instead of cramped side-by-side multi-column lineups.
- **NFL Games:** Horizontal time-slate game ticker + `<app-picker>` week switcher -> stacked Box Score & Scoring Drive feed on mobile.
- **Standings:** Mobile renders interactive **Team Classification Cards** (Rank badge, Avatar, Record, PF bar, Playoff % chip, Cutoff divider banner) sorted via `<app-picker>`; full 13-column sortable matrix & SoS table appear from `md`/`lg` upward.
- **Teams & Team Detail:** Directory scales via `@container` (`1` col narrow -> `2` col phone-lg/tablet -> `3–4` col desktop). Roster & Start-Sit optimizer rows become tappable **Player Action Cards** on phone highlighting bench swap differentials clearly.
- **Players (Scouting & Compare):** Mobile (`<1024px`) uses a true **Master -> Detail Sheet/Subview flow** so users don't scroll past 50 directory rows to reach the spotlight breakdown or 2-column Player Compare card. Waiver Radar displays as a horizontal snap carousel.
- **Playoffs & Draft:** Playoffs uses a **Round Stepper (`Quarterfinals` | `Semis` | `Finals`)** on `<768px` with centered touchable bracket cards (vital for Interactive Sandbox picking). Draft defaults to a **Round Accordion / Pick Feed** on `<768px` and restores the 12-column board on `>=1024px`.
- **Trades & Sandbox:** All team/filter pickers use `<app-picker>`. Mobile Sandbox uses a vertical **Give / Get Asset Stack** + `+ Add Player` bottom sheet + sticky bottom **Verdict Delta Bar**.
- **History, Insights, Recaps, Settings, About:** Careers/All-Play/Median/Hindsight matrices render as scannable **Franchise Metric Cards** on phones; H2H comparison becomes a vertical Tale-of-the-Tape duel; Recaps uses `<app-week-stepper>` + horizontal Week Champion cards; Settings uses a sticky horizontal category pill rail on mobile instead of a side rail above the form; About groups glossary formulas into progressive disclosure accordions (`<details>`).
