# UI/UX Design System & Specifications

## Brand & Aesthetic Vision
The dashboard follows the corporate identity of Management & Science University (MSU Malaysia — `msu.edu.my`). The visual language pairs rich MSU Crimson/Maroon with slate neutrals and pure white surfaces, producing a high-contrast, clean industrial IoT monitoring interface.

---

## 1. Color Palette & Design Tokens

### 1.1. Core Brand Colors
- **MSU Crimson (Primary):** `#8B0000` (Deep Maroon / Primary Brand Accent)
  - `msu-crimson-dark`: `#660000` (Header accents, hover state for primary buttons)
  - `msu-crimson-light`: `#FDF2F2` (Active sidebar items, subtle badge backgrounds)
  - `msu-crimson-border`: `#F87171` (Selected card borders, alert badges)
- **MSU Gold Accent (Tertiary):** `#D4AF37` / `#B8860B` (Used sparingly for highlights, secondary badges)

### 1.2. Surface & Layout Neutrals
- **App Background (Canvas):** `#F8FAFC` (Tailwind `slate-50`)
- **Card / Surface Background:** `#FFFFFF` (Pure White)
- **Border / Divider:** `#E2E8F0` (Tailwind `slate-200`)
- **Text Primary:** `#0F172A` (Tailwind `slate-900`)
- **Text Secondary / Muted:** `#64748B` (Tailwind `slate-500`)

### 1.3. State & Sensor Indicators
- **Idle / Available / Safe:**
  - Background: `#DCFCE7` (Tailwind `green-100`)
  - Text: `#15803D` (Tailwind `green-700`)
  - Dot: `#22C55E` (Tailwind `green-500`)
- **Running / Active Cycle:**
  - Background: `#DBEAFE` (Tailwind `blue-100`)
  - Text: `#1D4ED8` (Tailwind `blue-700`)
  - Dot: `#3B82F6` (Tailwind `blue-500`)
- **Warning / Low Gas (<15%) / High Heat:**
  - Background: `#FEF3C7` (Tailwind `amber-100`)
  - Text: `#B45309` (Tailwind `amber-700`)
  - Dot: `#F59E0B` (Tailwind `amber-500`)
- **Error / Gas Leak / Machine Offline:**
  - Background: `#FEE2E2` (Tailwind `red-100`)
  - Text: `#B91C1C` (Tailwind `red-700`)
  - Dot: `#EF4444` (Tailwind `red-500`)

---

## 2. Tailwind CSS Configuration Reference

Add this to `frontend-web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        msu: {
          DEFAULT: "#8B0000",
          dark: "#660000",
          light: "#FDF2F2",
          border: "#FCA5A5",
          gold: "#D4AF37",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 3. Typography & Hierarchy
- **Font Family:** `Inter`, `system-ui`, sans-serif.
- **Page Titles:** `text-2xl font-bold tracking-tight text-slate-900`
- **Section Headings:** `text-base font-semibold text-slate-800`
- **Metric Figures:** `text-3xl font-extrabold text-slate-900 tracking-tight`
- **Card Subtitles:** `text-xs font-medium text-slate-500 uppercase tracking-wider`
- **Status Badges:** `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`

---

## 4. UI Layout & Component Guidelines

### 4.1. Global Spacing & Density Tokens
All components across the application must follow a compact, reserved spacing standard:
- **Application Page Shell:** `p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full`.
- **Card / Surface Containers:**
  - Standard Cards / Panels: Strictly `p-3.5` or `p-4` (14px–16px).
  - Modal / Slide-Over dialogs: `p-5` or `p-6` (never `p-8` or `p-10`).
  - Metric Pills / Nested Tiles: `p-2` or `p-2.5` (8px–10px).
- **Layout Gap Scale:**
  - Tight item groups (badges, small controls): `gap-1.5` or `gap-2` (6px–8px).
  - Standard card interior rows / form fields: `gap-3` (12px).
  - Grid gutters between cards: `gap-3.5` or `gap-4` (14px–16px). Never use `gap-6` or `gap-8` in dense dashboard grids.

### 4.2. Navigation & App Shell
- **Top Header Bar:**
  - Background: `#8B0000` (MSU Crimson) with white text.
  - Height: Compact `h-14` or `h-16`.
  - Branding: University-styled "MSU SmartLaundry Operator Portal" with a crisp status pill indicating backend connectivity.
  - Branch Selector: Styled white dropdown with current branch label.
- **Left Navigation Drawer:**
  - Background: White (`#FFFFFF`), right border `border-slate-200`.
  - Links: Overview, Machine Fleet, Parameter Control, LPG & Safety, Telemetry & Revenue, System Logs.
  - Active Item: `border-l-4 border-msu bg-msu-light text-msu font-semibold`.

### 4.3. Card Architecture & Data Presentation
Any card component across the site (Machine cards, Safety metrics, Revenue summaries, System telemetry) must follow this layout skeleton:
- **Card Shell:** Rounded border shell (`rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between p-4`).
- **Header Row:** Compact single flex line (`flex items-center justify-between pb-2.5 border-b border-slate-100`).
- **Body Area:**
  - Keep internal metrics structured in 2-column or 3-column micro-grids (`grid grid-cols-2 gap-2 mt-2.5`).
  - Do not cram multiple distinct telemetry points into an unwrapped single row.
  - Badges use reserved inner padding (`px-2 py-0.5 text-xs font-medium rounded`).
- **Action Footer:**
  - Top divider: `pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between gap-2`.
  - Action elements: Compact sizing (`h-8 text-xs font-medium px-2.5 rounded-lg`). If more than 2 secondary actions exist, collapse them into an overflow menu.

### 4.4. Machine Parameter Configuration Modal / Slide-Over
Triggered when editing machine settings (`PUT /machines/{id}/parameters`):
- Compact form inputs for:
  - Price (numeric input with RM prefix).
  - Cycle Duration (number stepper in minutes).
  - Temperature (select dropdown: Cold, 30°C, 40°C, 60°C).
  - Water Level (segmented control: Low, Medium, High).
  - Spin Speed (segmented control: 400, 800, 1200 RPM).
  - Door Lock Override (toggle switch).
- Action buttons: "Save Parameters" (`bg-msu text-white hover:bg-msu-dark`) and "Cancel".

### 4.5. LPG & Safety Monitoring Widget
- **LPG Weight Card:**
  - Visual cylinder progress bar or vertical tank visualization showing `XX.X kg / 50.0 kg`.
  - Amber badge if $< 15\%$, red pulsing alert if $< 5\%$.
- **Gas Leak Detection (MQ-6):**
  - Normal state: Green checkmark with text "Safe - No Gas Detected".
  - Leak state: Full-width crimson flashing banner `text-red-700 bg-red-100 border border-red-500` with high-urgency icon.
- **Environment Telemetry (DHT22):**
  - Side-by-side metric tiles showing Temperature (`°C`) and Relative Humidity (`%`).

---

## 5. Agent Constraints & Layout Guardrails (Meta-Prompt)

All coding agents generating frontend components must adhere to the following layout, density, and responsive limits across all pages and components:

```markdown
You are an expert UI/UX front-end engineer. When generating UI layouts and components, strictly follow these structural and responsive design constraints:

1. Global Padding & Anti-Bloat Rules:
- Enforce compact, reserved padding across ALL components:
  - Standard cards and widget containers: Strictly `p-3.5` or `p-4` (14px–16px). NEVER use `p-6`, `p-8`, or larger on dashboard cards or nested grid components.
  - Nested micro-tiles, telemetry pills, and status badges: Use `p-1.5` to `p-2.5`.
  - Button and control heights: Standardize on compact scales (`h-8` to `h-9` for cards/toolbars, `text-xs` or `text-sm`).
- Grid gutters: Use `gap-3.5` or `gap-4` for card grids. Never use `gap-6` or `gap-8` inside dense operator dashboards.

2. Layout Density & Anti-Cramping Rules:
- Maximum 3 items per horizontal flex row on desktop. Stack vertically (`flex-col`) or use a structured grid (`grid-cols-2` or `grid-cols-3`) when displaying more than 3 data points.
- Always append `flex-wrap` to horizontal rows where items can exceed container bounds. Never allow unwrapped horizontal overflow.
- Favor vertical hierarchy and multi-column micro-grids over squeezing items side-by-side into tight spaces.

3. Content & Copy Limits:
- Keep text concise:
  - Headings & Titles: 3–6 words maximum.
  - Subtitles, Tooltips & Status Descriptions: 1–2 short sentences maximum.
  - Button/Action labels: 1–3 words maximum.
- Truncate dynamic or external strings automatically using `truncate` or `line-clamp-2` combined with `min-w-0` on flex children.

4. Sizing & Responsive Discipline:
- Never hardcode rigid pixel widths on parent containers (e.g., `width: 500px`). Use relative sizing (`w-full max-w-sm`), flex ratios, or CSS Grid tracks (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`).
- Tables must live inside an `overflow-x-auto` wrapper, or switch to stacked card layouts on smaller viewports.
- Toolbars and Action Footers: If there are more than 2 secondary action buttons, group them into an overflow/dropdown menu rather than rendering them side-by-side.
- Ensure all screens remain unbroken down to 375px mobile viewports.

5. Component Checklist Before Output:
- Did you use `p-3.5` or `p-4` instead of `p-6+` for cards and surfaces?
- Are dense data points organized into micro-grids rather than squeezed onto one unwrapped row?
- Does every flex child with text include `min-w-0` and truncation handling?
- Will the component fit cleanly on a 375px screen without horizontal layout clipping?
```

---

## 6. Directives for Coding Agents
1. **Mock Vendor Service:** Provide a fallback mock adapter in `src/lib/api/` that implements the vendor endpoints (`/auth/token`, `/machines`, `/machines/{id}/commands`, `/telemetry`, `/machines/{id}/parameters`) with realistic simulated data when the backend is offline.
2. **State Management:** Use clean React state or React Query / SWR for polling the `/machines` and telemetry endpoints every 4 seconds.
3. **Component Modularity:** Separate machine components into `MachineCard`, `MachineGrid`, `ParameterModal`, and `SafetyPanel` inside `src/components/`.
4. **Icons:** Exclusively use `lucide-react` for clean, professional iconography.