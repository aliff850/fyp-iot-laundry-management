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

### 4.1. Navigation & App Shell
- **Top Header Bar:**
  - Background: `#8B0000` (MSU Crimson) with white text.
  - Branding: University-styled "MSU SmartLaundry Operator Portal" with a crisp status pill indicating backend connectivity.
  - Branch Selector: Styled white dropdown with current branch label.
- **Left Navigation Drawer:**
  - Background: White (`#FFFFFF`), right border `border-slate-200`.
  - Links: Overview, Machine Fleet, Parameter Control, LPG & Safety, Telemetry & Revenue, System Logs.
  - Active Item: `border-l-4 border-msu bg-msu-light text-msu font-semibold`.

### 4.2. Machine Status Card Component
Each washer and dryer card in the fleet view must include:
1. **Header Row:**
   - Machine Label (e.g., `Washer #02`, `Dryer #01`).
   - Live Status Badge: `IDLE` (green), `RUNNING` (blue), `ERROR` (red).
2. **Body Metrics:**
   - Remaining Time Ring or Bar: Circular progress or filled bar showing remaining cycle minutes.
   - Current Parameter Badges: Price (`RM 6.00`), Temp (`40°C`), Spin Speed (`800 RPM`), Door (`Locked`/`Unlocked`).
3. **Action Footer:**
   - Quick Command Buttons: `Start`, `Pause`, `Stop` (disabled based on current state).
   - "Edit Parameters" button opening the parameter configuration slide-over panel.

### 4.3. Machine Parameter Configuration Modal / Slide-Over
Triggered when editing machine settings (`PUT /machines/{id}/parameters`):
- Form inputs for:
  - Price (numeric input with RM prefix).
  - Cycle Duration (number stepper in minutes).
  - Temperature (select dropdown: Cold, 30°C, 40°C, 60°C).
  - Water Level (segmented control: Low, Medium, High).
  - Spin Speed (segmented control: 400, 800, 1200 RPM).
  - Door Lock Override (toggle switch).
- Action buttons: "Save Parameters" (`bg-msu text-white hover:bg-msu-dark`) and "Cancel".

### 4.4. LPG & Safety Monitoring Widget
- **LPG Weight Card:**
  - Visual cylinder progress bar or vertical tank visualization showing `XX.X kg / 50.0 kg`.
  - Amber badge if $< 15\%$, red pulsing alert if $< 5\%$.
- **Gas Leak Detection (MQ-6):**
  - Normal state: Green checkmark with text "Safe - No Gas Detected".
  - Leak state: Full-width crimson flashing banner `text-red-700 bg-red-100 border border-red-500` with high-urgency icon.
- **Environment Telemetry (DHT22):**
  - Side-by-side metric tiles showing Temperature (`°C`) and Relative Humidity (`%`).

---

## 5. Directives for Coding Agents
1. **Mock Vendor Service:** Provide a fallback mock adapter in `src/lib/api/` that implements the vendor endpoints (`/auth/token`, `/machines`, `/machines/{id}/commands`, `/telemetry`, `/machines/{id}/parameters`) with realistic simulated data when the backend is offline.
2. **State Management:** Use clean React state or React Query / SWR for polling the `/machines` and telemetry endpoints every 4 seconds.
3. **Component Modularity:** Separate machine components into `MachineCard`, `MachineGrid`, `ParameterModal`, and `SafetyPanel` inside `src/components/`.
4. **Icons:** Exclusively use `lucide-react` for clean, professional iconography.