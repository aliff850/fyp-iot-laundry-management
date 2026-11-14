# Implementation Plan: Revamp LPG Card UI in Pi Dashboard

## Goal Description
The objective is to overhaul the LPG card UI within the Pi dashboard (`pi5/dashboard/index.html`) to be clean, organized, and compliant with the `docs/DESIGN.md` guidelines. This includes removing redundant information, simplifying text, and ensuring the interface is mobile-friendly.

## User Review Required
- **[IMPORTANT]**: Removal of potentially redundant fields (Source ID, Device ID, raw MQ-6 notes, sample time quality).
- **[IMPORTANT]**: Re-alignment with `docs/DESIGN.md` for spacing, typography, and color tokens.

## Open Questions
None. The user has explicitly stated what should be removed and referenced the design guidelines.

## Proposed Changes

### [File Modification]
#### `pi5/dashboard/index.html`
- Clean up the LPG card structure.
- Remove redundant Source ID/Device ID.
- Simplify text/remove "gibberish" labels.

#### `pi5/dashboard/static/dashboard.js`
- Update rendering logic if the LPG card generation is handled here. (Must investigate to confirm).

## Verification Plan

### Automated Tests
None applicable for this UI change.

### Manual Verification
- Manually inspect the Pi dashboard at the local development URL.
- Verify LPG card responsiveness on 320px/390px viewports.
- Confirm redundant labels/data are removed and text is clear.

