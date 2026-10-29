# SpinSense Dark Interface Design Guide

**Revision:** 2026-10-27

This guide defines the target visual language for SpinSense web dashboards and the operator PWA. Its reference is the [Pi gateway dashboard](../pi5/dashboard/index.html): charcoal surfaces, restrained coral, system typography, small corners, readable measurements, and quiet data tables. Navy is an approved addition for structural regions.

This is a documentation specification, not evidence that the applications have adopted the theme. The Pi reference currently uses custom CSS; future web implementations translate its appearance into Tailwind utilities. Native Flutter implementation is outside this styling contract.

**Current adoption:** The Phase 1 web landing and authentication screens now implement this shared theme with Tailwind utilities and the native system-font stack. Operational web screens remain prototype code behind a temporary access gate. This partial adoption does not establish full application accessibility, PWA or hardware acceptance.

The [PRD](PRD.md) owns permissions, behavior, measurements, thresholds, and data semantics. [AGENTS.md](../AGENTS.md) owns development workflow. This guide must not introduce alternate business rules, simulated success paths, or new runtime APIs.

## 1. Visual principles

- Keep the main canvas charcoal. Use navy on navigation, selected structural regions, and secondary controls; do not turn every panel blue.
- Let one useful reading or operational finding lead. Use a larger fuel reading or an incident requiring attention rather than several competing oversized metrics.
- Use coral sparingly for the SpinSense mark, focus indicators, selected underlines, and a main data series. Destructive actions use the negative token, not the brand accent.
- Keep ordinary panels flat and shadow-free. Use a surface step and optional decorative border; reserve shadows for dialogs, menus, and other genuinely floating elements.
- Use one system font, sentence-case labels, moderate weight, and tabular numbers. Avoid tracked uppercase metadata, decorative icon containers, gradients, glass, glows, and flashing alarms.
- Separate surface hierarchy, operational status, data provenance, and connectivity. Navy does not mean running, coral does not mean fault, and a reachable API does not prove sensor health.
- Preserve the reference's space: a small corner radius does not require cramped padding. Peer panels can repeat when they represent peer assets; balance the grid against actual content rather than forcing identical empty tiles.

Navy supplements the reference in selected structural regions. Preserve the reference's charcoal ground, composition, and restrained use of color across the wider operator interface.

## 2. Tailwind v4 theme contract

### 2.1 Allowed customization

Application-owned component presentation must use Tailwind utility classes and standard variants. The isolated Leaflet renderer has the narrowly scoped vendor exception in Section 2.4. A single shared Tailwind v4 theme defines **colors and font families only**. Preserve Tailwind's default spacing, sizing, font-size, weight, radius, breakpoint, shadow, and motion scales.

The following is a documented target for the shared web stylesheet, not an instruction to change application files as part of this documentation update:

```css
@import "tailwindcss";

@theme {
  --color-canvas: #171719;
  --color-surface: #131217;
  --color-raised: #212023;

  --color-navy: #14243a;
  --color-navy-hover: #1b304b;
  --color-navy-selected: #223d5b;

  --color-ink: #f2f2f3;
  --color-muted: #b4b4ba;
  --color-faint: #94949d;

  --color-line: #2c2b30;
  --color-rule: #242328;
  --color-control: #8c8a93;

  --color-accent: #ef6268;
  --color-positive: #79c5a6;
  --color-warning: #dfb463;
  --color-negative: #ef8798;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}
```

Do not reset the entire theme namespace: standard Tailwind scales remain available. Do not add custom typography sizes, radii, spacing, breakpoints, durations, or keyframes. The only application-authored CSS exception is this shared import/theme definition; there are no custom component selectors, global body rules, or utility aliases. Section 2.4 separately permits unmodified library-owned map styles.

Use semantic utilities generated from these tokens, such as `bg-canvas`, `bg-surface`, `bg-navy`, `text-ink`, `border-control`, and `font-sans`. Define palette values once rather than repeating raw colors in component markup.

### 2.2 Palette roles

| Tokens | Use |
|---|---|
| `canvas` / `surface` / `raised` | Page ground, primary data panels, nested wells and subtle neutral selection |
| `navy` / `navy-hover` / `navy-selected` | Navigation and limited structural regions; secondary-control hover and selected/pressed fills |
| `ink` / `muted` / `faint` | Primary text, supporting text, tertiary metadata on permitted surfaces |
| `line` / `rule` | Decorative panel outlines and row separators; never the sole boundary of an interactive control |
| `control` | Meaningful input/button boundaries and row interaction outlines |
| `accent` | Brand mark, selected underline, focus outline, restrained data emphasis |
| `positive` / `warning` / `negative` | Explicit positive, pending/warning, and failure/critical/destructive meaning |

All reference colors are preserved except its original interactive boundary, which is strengthened for the added navy surfaces. The navy colors are new additions. Ordinary dark panels may be darker than the canvas, as in the Pi reference; avoid adding shadows to simulate elevation.

Primary buttons invert the dark theme: `bg-ink text-surface`. Secondary controls may use navy. Never use light text on the bright coral, mint, amber, or rose fills; inverted labels on those fills use `text-surface` and a measured pairing.

### 2.3 Styling restrictions

- No application-authored inline styles, arbitrary-value utilities, arbitrary-property utilities, custom selectors, component CSS, or `@apply`. The Leaflet vendor-rendering exception below does not authorize application overrides.
- Do not recreate the Pi's class names as CSS rules. Express layout, border, focus, selection, motion, and responsiveness directly through utilities.
- Use complete literal class strings in state maps. Do not construct color, span, or size classes from fragments at runtime.
- For dynamic visualizations, SVG drawing attributes such as path coordinates and bar geometry may describe data. Use utilities for color, stroke appearance, layout, and sizing; do not write inline CSS to set a percentage width.
- Keep SVG icons on `currentColor` using `fill-none stroke-current` or `fill-current` as appropriate. Use the existing outline icon set; do not add a new icon dependency for a visual refresh.

### 2.4 Isolated Leaflet vendor-style exception

The approved interactive map uses Leaflet. Its unmodified vendor stylesheet and library-generated tile/pane/marker positioning are allowed **only for the map renderer**. Those library-owned classes and generated positioning styles are not an application component styling pattern.

- Keep Leaflet's vendor stylesheet unmodified and its rendered DOM within the map integration; do not repurpose vendor classes elsewhere.
- App-owned map containers, surrounding panels, filters, branch lists, buttons, accessible names, typography and colors still use the theme and standard Tailwind utilities.
- Do not add custom CSS overrides, arbitrary-value classes, hand-written inline styles or a second palette for app-owned map UI under this exception.
- Provider tiles and library controls need their own rendered accessibility/contrast review; the palette measurements in Section 5.3 do not cover map imagery or vendor internals.
- Preserve required attribution. Follow the PRD's online tile and submitted-search restrictions; do not cache/prefetch map tiles in the PWA for offline use.

Leaflet's [official setup](https://leafletjs.com/examples/quick-start/) requires its stylesheet. This exception documents that integration requirement; it does not install Leaflet or change the Pi dashboard.

## 3. Typography, spacing, and responsive layout

### 3.1 Type recipes

| Role | Complete class recipe |
|---|---|
| Default text context | `font-sans text-sm leading-normal text-ink` |
| Page title | `text-2xl font-semibold leading-tight tracking-tight text-ink` |
| Section title | `text-base font-semibold leading-normal text-ink` |
| Leading measurement | `text-4xl font-medium leading-tight tracking-tight text-ink tabular-nums` |
| Supporting measurement | `text-2xl font-medium leading-tight text-ink tabular-nums` |
| Labels and explanations | `text-sm leading-normal text-muted` |
| Secondary metadata on charcoal | `text-xs leading-normal text-faint` |
| Metadata on navy hover/selected | `text-xs leading-normal text-muted` |
| Units beside a measurement | `ml-1 text-sm font-normal tracking-normal text-muted` |
| Numeric table cell | `px-4 py-3.5 text-right text-sm text-ink tabular-nums whitespace-nowrap` |

Use the same precision and unit conventions for the same metric. Numeric zero is a real reading; missing data is not zero. Use a readable smaller dash for unavailable values rather than a large numeric-looking placeholder.

The Pi's 26px title maps to `text-2xl`, and its 13px metadata maps to `text-xs` or `text-sm` according to purpose. These are deliberate standard-scale adaptations. The 36px leading reading maps to `text-4xl`. Do not introduce custom font sizes to reproduce every pixel.

The web application uses the **Manrope** geometric sans-serif variable typeface (`wght@200..800`) across all workspace views. Titles (`h1`–`h6`, `[role="heading"]`) receive the heaviest font weight (`800` / ExtraBold), while body copy, metadata, and general content use normal/light weights (`400`).

### 3.2 Shell and panel recipes

| Element | Complete class recipe |
|---|---|
| Page root | `min-h-screen bg-canvas font-sans text-sm leading-normal text-ink scheme-dark` |
| Shared content width | `mx-auto w-full max-w-360 px-4 md:px-6 xl:px-10` |
| Main vertical spacing | `py-6 md:pt-9 md:pb-7` |
| Header region | `border-b border-line bg-navy` |
| Header inner layout | `mx-auto flex min-h-16 w-full max-w-360 items-center justify-between gap-4 px-4 md:min-h-19 md:px-6 xl:px-10` |
| Page heading/action row | `mb-6 flex flex-wrap items-start justify-between gap-4` |
| Overview grid | `mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-7` |
| Leading panel | `min-w-0 rounded-md bg-surface px-5 py-4 md:p-7 xl:col-span-3` |
| First supporting panel | `min-w-0 rounded-md bg-surface px-5 py-4 md:p-7 xl:col-span-2` |
| Second supporting panel | `min-w-0 rounded-md bg-surface px-5 py-4 md:col-span-2 md:p-7 xl:col-span-2` |
| Navy structural panel | `min-w-0 rounded-md border border-line bg-navy px-5 py-4 md:p-7` |
| Panel heading row | `mb-5 flex flex-wrap items-center justify-between gap-3` |
| Related readings grid | `grid grid-cols-2 gap-5` |
| Wrapping metadata/actions | `flex flex-wrap items-center gap-3` |

The seven-track desktop grid approximates the reference's leading-panel proportions without a custom grid template. At `md` the third panel spans the two columns; at `xl` the spans become three, two, and two. On mobile every panel occupies the full row.

The maximum content width is 1440px at Tailwind's default spacing scale. Mobile side padding is 16px, tablet padding 24px, and large-screen padding 40px. Panel padding becomes 28px on larger screens; mobile panels use 20px horizontal and 16px vertical padding. The previous guide's blanket prohibition on larger padding and 24px gaps is retired.

Use standard mobile-first `sm`, `md`, `lg`, and `xl` variants, not the Pi's custom 1100px/340px media queries. The documented overview changes at `md` and `xl`. At intermediate widths, wrap controls and metadata before they collide. If a product screen has sidebar navigation, fold it on small screens; the Pi's top-bar layout does not require introducing a sidebar.

### 3.3 Primary layout margins, padding, and spacing system

Extracted directly from the established workspace implementations in `frontend-web/app/branches/page.tsx` and `frontend-web/app/personnel/page.tsx`, the following spacing, margins, and padding rules constitute the authoritative standard across all operator views in the web workspace.

#### Layout Spacing Reference Table

| Structural Layer | Element / Role | Tailwind Utility Recipe | Visual Purpose & Proportions |
|---|---|---|---|
| **Viewport & Shell** | Max Content Constraint | `mx-auto w-full max-w-360` | Centers content up to 1440px desktop ceiling |
| | Horizontal Gutter | `px-4 md:px-6 xl:px-10` | Responsive gutters: 16px (mobile), 24px (tablet), 40px (desktop) |
| | Shell Vertical Spacing | `py-6 md:pt-9 md:pb-7` | 24px mobile vertical rhythm, 36px top / 28px bottom on larger screens |
| | Header Layout Bounds | `min-h-16 md:min-h-19` | 64px mobile header, 76px tablet/desktop header with 16px row gap (`gap-4`) |
| | Footer Layout Bounds | `px-4 py-6 md:px-6 xl:px-10` | 24px vertical padding with border-t line separator |
| **Page-Level Rhythm** | Primary Section Stack | `space-y-8` | 32px vertical gap separating page header and top-level sections |
| | Context / Breadcrumb Bar | `mb-6 flex items-center gap-2 text-xs` | 24px bottom margin preceding page content |
| | Page Heading Row | `flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between` | Responsive header row stacking on mobile and bottom-aligning on tablet/desktop |
| | Page Title Typography | `text-2xl font-semibold tracking-tight text-ink` | Standalone primary page or view heading (no eyebrow kicker or narrative blurb) |
| **Sections & Panels** | Standard Section Card | `rounded-md border border-line bg-surface p-5 md:p-6` | Primary surface panel with 20px mobile / 24px tablet+ desktop padding |
| | Narrative / Reading Card | `rounded-md border border-line bg-surface px-5 py-4 md:p-7` | Spacious card for high-level operations or empty state messaging |
| | Section Header Row | `flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3` | Divided card title row with 12px bottom padding before the divider |
| | Section Header Title | `text-base font-semibold text-ink` | Primary section label (standalone, without explanatory subtitle paragraphs) |
| | Section Content Offset | `mt-4` | 16px top margin establishing consistent spacing from section header to body |
| **Nested Wells & Cards** | Compact Metric Stat Tile | `flex flex-col justify-between rounded-md border border-line bg-surface p-3` | 12px padding for dense grid metrics |
| | Metric Grid Spacing | `grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6` | 10px grid gap for quick numerical KPI scannability |
| | Entity / Request Well | `flex flex-col justify-between rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60` | 16px padding within nested wells and secondary cards |
| | Nested Card Grid Spacing | `grid gap-3 md:grid-cols-2` | 12px grid gap between sibling entity cards |
| **Data Tables & Rows** | Table Container | `overflow-x-auto rounded-md border border-rule` | Responsive scroll container with 1px outer rule border |
| | Table Header Cell | `px-4 py-3 border-b border-rule bg-raised/30 text-xs font-normal text-muted` | 16px horizontal, 12px vertical padding on subdued header row |
| | Table Body Cell | `px-4 py-3.5` | 16px horizontal, 14px vertical cell rhythm |
| | Numeric Table Cell | `px-4 py-3.5 text-right tabular-nums whitespace-nowrap` | Right-aligned numeric data cells |
| | Divided List Row | `divide-y divide-rule py-3` | 12px vertical padding on divided list items |

#### Spacing Implementation Rules

1. **Page Containers Must Not Artificially Restrict Width**: Pages hosted within `<WorkspaceShell>` must use `<div className="space-y-8">` without introducing arbitrary narrow wrappers (e.g. `max-w-3xl`) unless explicitly designed for focused single-column wizards (such as auth forms). Full-width structured layouts allow multi-column responsive scaling (`lg:grid-cols-2` or `lg:grid-cols-4`).
2. **Clean Standalone Page Headings**: Top-level page and view headers must render only the primary heading (`text-2xl font-semibold tracking-tight text-ink`) and any relevant action controls—never prepend an eyebrow kicker span above the title or append an instructional narrative paragraph below it.
3. **Divided Section Headers**: When a section contains a title and filter/action controls, wrap them in a flex container without adding filler subtitle descriptions below the section title.
4. **Nested Wells Use `bg-raised/40`**: Nested wells and detail cards within a `bg-surface` panel use `rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60`.

### 3.4 Strictly excluded design elements (never include when implementing pages)

Whenever implementing or modifying any page, view, card, or modal, **strictly exclude** all of the following visual clutter and boilerplate text patterns:

1. **No Page Eyebrow / Kicker Labels Above Page Titles**:
   - Never place a small category/context span above the primary page or view heading.
   - **Prohibited pattern**:
     ```tsx
     // ❌ NEVER DO THIS
     <span className="text-xs font-medium text-muted">
       Customer Support &amp; Maintenance Portal
     </span>
     ```
2. **No Verbose Explanatory / Narrative Paragraphs Below Page Titles**:
   - Never add multi-clause instructional descriptions explaining what a page is for below the page heading.
   - **Prohibited pattern**:
     ```tsx
     // ❌ NEVER DO THIS
     <p className="mt-1 max-w-2xl text-sm text-muted">
       Review customer-submitted machine and facility observations, log investigation notes, coordinate maintenance crew action, and inspect resolved report history.
     </p>
     ```
3. **No Section Header Subtitles / Filler Descriptions (or Redundant Section Count Pills)**:
   - Never add explanatory subtitle paragraphs underneath section titles (e.g., under `Ongoing Reports` or `Report History`), and do not attach redundant count pills next to section headings when filter buttons or KPI cards already convey counts.
   - **Prohibited patterns**:
     ```tsx
     // ❌ NEVER DO THIS
     <span className="rounded border border-rule bg-raised px-2 py-0.5 text-xs font-semibold text-ink tabular-nums">
       {allOngoingReports.length}
     </span>
     <p className="text-xs text-muted">
       Active customer issues requiring initial triage or ongoing maintenance investigation.
     </p>
     <p className="text-xs text-muted">
       Completed support tickets, recorded maintenance outcomes, and dismissed reports.
     </p>
     ```
4. **No Inline Dot-Separated Timestamps or Redundant `Simulated` Badges in Card Metadata Rows**:
   - Do not append inline middle-dot timestamps (`· {formatDate(...)}`) or `Simulated` badges to card status/badge headers.
   - **Prohibited patterns**:
     ```tsx
     // ❌ NEVER DO THIS
     <span className="rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
       Simulated
     </span>
     <span className="text-faint tabular-nums">
       · {formatDate(isHistory ? report.updated_at : report.created_at)}
     </span>
     ```
5. **No Internal PRD / Spec Requirement IDs in UI Markup**:
   - Never display internal specification or requirement codes (such as `CR-02`, `CR-03`, `FM-01`, `FE-04`, `S-27`, etc.) inside cards, form headers, or modals. Requirement IDs belong in code comments, tests, and documentation—never in user-facing JSX.
   - **Prohibited patterns**:
     ```tsx
     // ❌ NEVER DO THIS
     <span className="text-[11px] text-faint">CR-02</span>
     <span className="text-[11px] text-faint">CR-03</span>
     ```

## 4. Component recipes

The recipes are visual fragments, not functional implementations. Connect controls to real behavior and authorization from the PRD. Keep a visible label or accessible name; an icon alone is not sufficient.

### 4.1 Navigation, brand, and selection

Use `inline-flex items-center gap-3 text-lg font-semibold tracking-tight text-ink` for the SpinSense wordmark row. Its mark uses `size-7 shrink-0 text-accent` on the base navy background.

A navigation link on the base navy region:

```html
<a href="/branches"
   class="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted transition-colors duration-150 hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none">
  Branches
</a>
```

The active link uses this complete alternative recipe:

```html
<a href="/branches" aria-current="page"
   class="inline-flex min-h-11 items-center rounded-md bg-navy-selected px-3 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
  Branches
</a>
```

The router chooses the appropriate complete class string and sets `aria-current="page"` only on the active destination. A boolean ARIA utility does not match that enumerated value. Use primary/secondary text on navy hover/selected fills. Coral may remain an underline or focus outline, not small text on those fills. Do not reintroduce a colored left rail and coral-filled selection on every navigation item.

### 4.2 Buttons

Use one main filled action per view. All three recipes retain a minimum 44px touch height, readable disabled colors, a focus outline, and a reduced-motion fallback. Use the actual `disabled` attribute when unavailable.

**Primary:**

```html
<button type="button"
  class="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none">
  Refresh now
</button>
```

**Secondary/navy:**

```html
<button type="button"
  class="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none">
  View details
</button>
```

**Destructive:**

```html
<button type="button"
  class="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none">
  Remove assignment
</button>
```

Use negative styling on both a destructive trigger and its confirmation. For asynchronous work, prevent duplicate submission, expose `aria-busy`, and change the visible label to the real pending operation. Loading is not success and does not require decorative animation.

### 4.3 Inputs and selects

```html
<div class="grid gap-2">
  <label for="branch-label" class="text-sm font-medium text-ink">Branch label</label>
  <input id="branch-label" name="branch_label" type="text"
    class="min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none">
</div>
```

A native select uses the same complete class string as the input, without the `placeholder:text-faint` utility. Keep native selection behavior; do not add custom select CSS. Set `aria-invalid="true"` on validation failure and attach a visible `text-sm text-negative` explanation through `aria-describedby`. Keep required format/validation instructions visible; placeholders do not replace labels. Disabled fields retain a label and a reason.

### 4.4 Tabs and filters

Use plain underline filters on charcoal panels rather than filled coral pills:

```html
<div class="flex min-w-0 gap-6 overflow-x-auto border-b border-line">
  <button type="button" aria-pressed="true"
    class="min-h-11 shrink-0 whitespace-nowrap border-b-2 border-transparent py-3 text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:text-ink motion-reduce:transition-none">
    All records
  </button>
  <button type="button" aria-pressed="false"
    class="min-h-11 shrink-0 whitespace-nowrap border-b-2 border-transparent py-3 text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:text-ink motion-reduce:transition-none">
    Pending
  </button>
</div>
```

These are filter buttons, not ARIA tabs. A true tabbed interface must implement tab semantics, selected state, and keyboard behavior. Keep filters inside their scroll region without causing page-wide horizontal overflow or clipping focus indicators.

### 4.5 Notices and operational states

| Presentation | Complete class recipe |
|---|---|
| Neutral/freshness notice | `rounded-md border-l-2 border-control bg-raised px-4 py-3 text-sm text-muted` |
| Warning notice | `rounded-md border-l-2 border-warning bg-raised px-4 py-3 text-sm text-ink` |
| Error/critical notice | `rounded-md border-l-2 border-negative bg-raised px-4 py-3 text-sm text-ink` |
| Positive status | `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-positive` |
| Pending/warning status | `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-warning` |
| Failed/quarantined status | `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-negative` |
| Unknown/offline/provenance label | `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-muted` |

Every mark has words: for example, Synced, Pending, Quarantined, Unknown, Offline, or Simulated. These are separate meanings, not interchangeable states. Do not color normal zero counts as warnings or render a failure label merely because a machine is offline. Running/paused labels use their actual state wording; the design does not infer machine state from a palette color.

### 4.6 Tables and tight container restraint

- Wrapper: `max-h-120 w-full overflow-auto rounded-md bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`. Give an independently keyboard-scrollable wrapper an accessible name and a keyboard focus stop where needed.
- Long diagnostic table: `w-full min-w-220 border-collapse text-sm`. Ordinary short tables use `w-full border-collapse text-sm` instead.
- Header: `sticky top-0 z-10 bg-surface px-4 py-3.5 text-left text-sm font-normal text-muted whitespace-nowrap`. Numeric headers replace `text-left` with `text-right tabular-nums`.
- Row: `border-t border-rule hover:outline hover:outline-1 hover:outline-control hover:-outline-offset-1`.
- Text cell: `px-4 py-3.5 text-sm text-ink whitespace-nowrap`. Numeric cells use the recipe in Section 3.1.
- Cell subline: `mt-0.5 block text-xs text-faint`.
- Optional pinned identity cell: `sticky left-0 z-10 bg-surface px-4 py-3.5 text-sm text-ink whitespace-nowrap`. At the header intersection use `z-20`.
- Footer: `flex flex-wrap justify-between gap-3 border-t border-line px-5 py-3.5 text-xs text-faint md:px-7`.

Keep headers on the same surface as rows: no zebra stripes or saturated header bands. Numerical headers and values share the same right edge. Pin identity only where horizontal scrolling is genuinely needed, and keep all required diagnostic fields available. A selectable row uses `bg-navy-selected` with `text-ink` or `text-muted` throughout; replace faint sublines in that selected state.

**Tight container restraint and cell alignment:**
- **No redundant placeholder messages**: Never clutter tight elements (such as table cells or compact controls) with redundant placeholder text or italic messages (e.g. do not add `"No branch assigned yet"` or `"None"` next to interactive buttons). When an interactive trigger already displays an informative placeholder (such as `"Assign branches…"`), any additional message is redundant, bloats vertical cell height, and causes row misalignment across sibling columns.
- **Single-purpose, vertically aligned cells**: Keep table cells compact and focused. When a cell hosts an interactive control (such as a dropdown), maintain a single uniform baseline matching neighboring action cells.
- **Portaling for dropdowns & floating menus in scrollable tables**: Any dropdown menu, popover, or floating select rendered inside an `overflow-x-auto` or `overflow-auto` table container must be portaled to `document.body` (using React Portals) with fixed viewport positioning. Never allow dropdown popovers to render inline within scrollable table containers, as CSS overflow clipping will cut them off or trap them inside the table boundary.

### 4.7 Fuel, environment, and delivery panels

```html
<section aria-labelledby="fuel-heading"
  class="min-w-0 rounded-md bg-surface px-5 py-4 md:p-7 xl:col-span-3">
  <h2 id="fuel-heading" class="mb-5 text-base font-semibold text-ink">Fuel reading</h2>
  <dl class="grid gap-4">
    <div>
      <dt class="mb-2 text-sm text-muted">Gross mass</dt>
      <dd class="text-4xl font-medium leading-tight tracking-tight text-ink tabular-nums">
        <span aria-label="Unavailable" class="text-2xl text-faint">—</span>
        <span class="ml-1 text-sm font-normal tracking-normal text-muted">kg</span>
      </dd>
    </div>
  </dl>
  <p class="mt-5 text-xs text-faint">No validated mass reading available.</p>
</section>
```

Use the same panel shell and `grid grid-cols-2 gap-5` for temperature/humidity. Use `text-2xl font-medium text-ink tabular-nums` for supporting values and `text-sm text-muted` for unit/label text. Keep raw gas readings distinct from a validated physical concentration; use the provider's units and validity metadata.

Delivery panels show confirmed sync state with a text label and associated count. Summary counts must identify their scope, such as the returned recent-record window rather than the whole backlog. Use `grid grid-cols-2 gap-x-6 gap-y-2.5` for label/value pairs, `text-sm text-muted` for labels, and `text-right text-sm text-ink tabular-nums` for counts.

Native/data-driven SVG may visualize a valid measurement without inline styles. Keep the raw value visible; do not turn missing or out-of-range data into a plausible bounded gauge. Follow the PRD for calibration, capacity, validity, and incident evaluation.

### 4.8 Machine cards, incident rows, and dialogs

| Element | Complete class recipe |
|---|---|
| Machine card | `flex min-w-0 flex-col gap-4 rounded-md bg-surface px-5 py-4 md:p-7` |
| Machine identity row | `flex min-w-0 flex-wrap items-start justify-between gap-3` |
| Machine reading grid | `grid grid-cols-2 gap-x-6 gap-y-3` |
| Machine action row | `flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4` |
| Incident row on charcoal | `flex min-w-0 flex-col gap-3 border-t border-rule py-4 md:flex-row md:items-start md:justify-between` |
| Incident summary | `min-w-0 flex-1 space-y-1` |
| Dialog surface | `m-auto max-h-dvh w-11/12 max-w-xl overflow-y-auto rounded-md border border-control bg-surface p-6 text-ink shadow-xl backdrop:bg-canvas/80` |
| Dialog actions | `mt-6 flex flex-wrap justify-end gap-3` |

Machine cards retain washer/dryer separation, type-appropriate fields, source/freshness labels, and confirmed-versus-pending action state. Use real action buttons instead of an unlabeled clickable container. Incident rows identify the affected asset and condition with words; the action belongs next to the incident that needs attention. Descriptions and errors wrap; do not truncate essential diagnosis or service instructions.

Dialog styling assumes a semantically correct modal implementation: label it, move focus into it, contain keyboard focus, support dismissal where allowed, and restore focus to its trigger. A native dialog may use `showModal()`; its open-state presentation does not establish those behaviors were tested.

## 5. States and accessibility

### 5.1 Required states

| State | Presentation and behavior |
|---|---|
| Default | Readable text, stable layout, correct semantic role |
| Hover | Subtle approved surface/border/text change; do not depend on hover to reveal the only action |
| Focus | Visible coral outline with an offset on a permitted dark background; do not remove it without an equivalent |
| Active | Standard pressed fill or small press translation; reduced-motion users keep the state without travel |
| Disabled | Actual disabled behavior, readable muted text, visible reason; avoid fading the entire control |
| Loading | Stable frame, visible pending wording and busy state, duplicate action prevented |
| Error | Inline explanation with a retry/correction action where appropriate; retain and label previously fetched values |
| Selected | Correct semantic attribute and distinct ink/underline/navy state; do not use color alone |

Fields require error styling; selectable controls require selected styling. Apply the applicable states rather than inventing unsupported interactions. Loading placeholders use flat neutral blocks without shimmer. Color changes use `transition-colors duration-150 motion-reduce:transition-none`; press movement uses `motion-safe:enabled:active:translate-y-px`, so it is absent when reduced motion is requested. Do not rely on resetting only the transform property to cancel Tailwind v4's individual translate property. No entrance-animation requirement applies to these working dashboards.

Use semantic headings, tables, labels, links, and buttons. One screen has one primary heading. Icon-only actions need accessible names; decorative icons are hidden from assistive technology. Keep touch targets at least `min-h-11`, with `min-w-11` for icon-only buttons. Provide a skip link and a reachable primary content region. Do not announce every polled metric through a live region; announce meaningful status changes without repetitive chatter.

### 5.2 Truthful data presentation

| Data condition | Required presentation |
|---|---|
| Valid zero | Show zero with its unit and normal precision |
| Missing/invalid/unconfigured/warming | Show unavailable wording or a subdued dash with its reason; never a fabricated zero or healthy state |
| Stale/offline | Retain last-known values when available, with timestamps and the actual freshness/connectivity label |
| Request failure | State which request/view failed, preserve prior data with last-update context, and offer retry |
| Simulated/estimated | Show provenance explicitly; an API failure must not switch silently to successful fixture data |
| Pending/unknown command | Show pending/unknown wording until actual execution evidence exists |
| Active incident during replacement | Preserve its condition and scope; this guide does not alter maintenance suppression or resolution rules |

Styling does not calculate gas concentration, decide alarm thresholds, unlock machines, or define polling intervals. Use the current PRD/provider contracts. The local diagnostic monitor's capabilities are distinct from the broader target platform.

### 5.3 Measured palette contrast

The following ratios were calculated from the documented opaque sRGB colors using relative luminance on 2026-10-26. They describe these color pairs only, not whole-screen accessibility or browser testing. Normal text pairings must reach 4.5:1; meaningful control boundaries/focus indicators must reach 3:1 against their adjacent backgrounds.

| Foreground | Canvas | Surface | Raised | Navy | Navy hover | Navy selected |
|---|---:|---:|---:|---:|---:|---:|
| Ink | 16.00 | 16.66 | 14.49 | 13.97 | 11.95 | 9.95 |
| Muted | 8.68 | 9.03 | 7.86 | 7.58 | 6.48 | 5.40 |
| Faint | 5.95 | 6.20 | 5.39 | 5.20 | 4.44 | 3.70 |
| Accent | 5.64 | 5.87 | 5.11 | 4.93 | 4.21 | 3.51 |
| Positive | 8.82 | 9.19 | 7.99 | 7.71 | 6.59 | 5.49 |
| Warning | 9.25 | 9.63 | 8.37 | 8.07 | 6.90 | 5.75 |
| Negative | 7.32 | 7.62 | 6.63 | 6.39 | 5.47 | 4.55 |
| Control boundary | 5.26 | 5.48 | 4.76 | 4.59 | 3.93 | 3.27 |

- Faint and coral text are allowed on canvas, surface, raised, and base navy. On navy hover/selected backgrounds, use ink or muted text instead. Coral remains suitable as a non-text focus indicator on the six dark backgrounds.
- The inverted primary button uses surface text on ink: **16.66:1**. Its hover uses surface text on muted: **9.03:1**. The destructive fill uses surface text on negative: **7.62:1**.
- Disabled muted text on raised measures **7.86:1**. Do not reduce its opacity.
- Decorative line/rule tokens are not approved interactive boundaries. The original Pi control boundary on base navy measures **2.09:1**; the replacement control token measures **4.59:1**.
- These results do not cover arbitrary opacity modifiers, images, gradients, mixed backgrounds, or focus clipping. Recalculate new combinations rather than assuming that a named token always passes.

## 6. Developer verification and references

Before adopting these recipes in an application:

1. Use the shared theme once at the web root; keep standard Tailwind defaults and avoid a second per-page palette.
2. Compile every complete recipe against the installed Tailwind version, including responsive, semantic, pseudo-element, and reduced-motion variants. Verify every used utility produces CSS.
3. Check actual text/background, hover, active, selected, disabled, and focus pairings. Token arithmetic alone does not prove correct rendered contrast.
4. Inspect representative views at 390px, 768px, and 1440px, plus the product's smallest supported width. Confirm no page-wide horizontal scrolling, hidden actions, clipped focus, or collapsed chips; tables scroll within their own region.
5. Check keyboard navigation, modal focus, selected/filter behavior, loading/error recovery, meaningful data labels, and number alignment.
6. Preserve the PRD's role, provenance, sensor quality, freshness, incident, and command semantics while changing presentation.
7. Report only checks actually run. Document-only compilation/contrast checks do not establish that an application passed browser, hardware, or full accessibility acceptance.

For this document-only change, validate theme/class consistency, generated utilities, measured opaque color pairings, links, Markdown structure, and diff scope. Rendering gates apply when these recipes are implemented in a screen; do not run a restyle or change application files merely to validate this guide.

References:

- [Pi gateway dashboard](../pi5/dashboard/index.html): visual source, still using its original CSS.
- [SpinSense PRD](PRD.md): behavior, measurements, states, permissions, and acceptance.
- [Development instructions](../AGENTS.md): commands, repository structure, and source verification.
- [Tailwind theme variables](https://tailwindcss.com/docs/theme): centralized color/font tokens and generated utilities.
- [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design): standard mobile-first variants.
- [Tailwind class detection](https://tailwindcss.com/docs/detecting-classes-in-source-files): complete, statically detectable class strings.
