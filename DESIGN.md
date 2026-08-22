# ShotMe.ee Design System

## Product Thesis

ShotMe.ee is a trusted photo lab for people who want one useful result quickly: restore an important family photograph or create a natural portrait. The interface should lead with a real result, make uploading unmistakable, and reduce the path to completion to a few clear actions.

## Experience Principles

1. **Action first.** The main upload action belongs in the first viewport on every supported screen.
2. **Proof before explanation.** Show a real, clearly labelled before/after example before secondary product detail.
3. **Trust is part of the task.** Face preservation, original-file safety, and a visible result before payment appear near the upload action.
4. **Free stays simple.** Free users choose a mode and generate. Text and voice refinements are paid controls.
5. **One route, one intent.** `/restore` starts restoration automatically after upload. The main studio route offers a small set of result-oriented modes.

## Visual World

The product should feel like a modern, careful photo lab rather than a luxury fashion landing page or a generic AI dashboard. Use real photographs as evidence. Prefer flat, quiet surfaces, strong text hierarchy, and restrained transitions.

## Color Tokens

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#f4f7f5` | App background |
| White | `#ffffff` | Controls and content surfaces |
| Ink | `#15302b` | Primary text and dark hero areas |
| Teal | `#08786f` | Restoration, trust, selected states |
| Coral | `#f06449` | Primary upload and download actions |
| Blue | `#365aa5` | Portrait studio and utility actions |
| Mist | `#dfe9e5` | Secondary surfaces and status backgrounds |
| Line | `#c7d6d1` | Borders and dividers |

Use opaque colors. Gradients and decorative color blobs are not part of this system.

## Typography

- Family: `Onest`, with a sans-serif fallback.
- Weights: 400 for body, 600 for supporting actions, 700-800 for headings and primary actions.
- Headlines are direct and compact, with normal letter spacing.
- Small text must remain readable on mobile; do not use decorative uppercase microcopy for essential instructions.

## Shape And Depth

- Standard radius: 4-8px.
- Pills are reserved for compact status indicators and counters.
- Cards represent individual selectable modes or results, not entire page sections.
- Shadows are used sparingly on primary actions and overlays. Structure comes from spacing, borders, and contrast.

## Action Hierarchy

1. Coral: upload, restore, download.
2. Teal: selected restoration mode and trust confirmation.
3. Blue: portrait studio mode and related utilities.
4. White with border: secondary actions such as replace image, show original, and go back.

All primary touch targets should be at least 48px high. Icon-only controls require an accessible name and tooltip where their meaning is not universal.

## Responsive Rules

- At 320px wide, the real before/after proof, headline, upload button, and free-use statement must fit in the first 568px viewport.
- Mobile headers use two rows: identity and account controls first, intent navigation second.
- Results use a constrained image height on mobile so download and back actions remain easy to reach.
- Content must never create horizontal overflow at 320, 390, 768, or 1440px widths.
- Desktop may use split layouts, but the upload action remains visible without scrolling.

## Product States

- **Upload:** intent, proof, primary action, free-use statement, trust promises.
- **Choose mode:** uploaded preview, replace action, aspect ratio, mode cards.
- **Processing:** clear task-specific status without blocking browser-native alerts.
- **Result:** generated image, show-original control, download, return to upload.
- **Free gate:** request email only after ten free generations.
- **Paid:** gallery plus text and voice refinement controls.
- **Error:** plain-language inline or modal message with a clear recovery action.

## Content Rules

- Say what the person receives, not which AI technology is used.
- Use “10 free” and “no email or bank card” near the first action.
- Never claim exact identity preservation as a guarantee; describe it as the product goal.
- Keep all six supported languages aligned in meaning and action order.
