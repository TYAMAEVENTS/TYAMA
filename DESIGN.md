---
version: alpha
colors:
  canvas: "#E9FF57"
  ink: "#111111"
  cobalt: "#2E46FF"
  coral: "#FF533D"
  paper: "#F7FFB9"
  danger: "#B42318"
typography:
  display:
    fontFamily: "Unbounded, Arial Black, Arial, sans-serif"
    fontWeight: 800
    lineHeight: 1
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  control: "0px"
  card: "0px"
spacing:
  base: "9px"
  gap: "26px"
  section: "54px"
components:
  button-primary:
    backgroundColor: "#111111"
    color: "#E9FF57"
    borderColor: "#111111"
  panel:
    backgroundColor: "transparent"
    color: "#111111"
    borderColor: "#111111"
---

# TYAMA Pilot Design

## Overview

North Star: a precise working instrument printed on one acid-yellow sheet. Product surfaces use the approved “01 / Збіглося” direction: fragments become legible context. The interface is a product/admin register; clarity beats spectacle. The three-plate glitch is reserved for the brand mark and a few transitions between raw fragments and approved meaning.

Anti-references: generic SaaS cards, white dashboards, gradients, glass, rounded pills, shadows, AI sparkle, party stock, confetti, military dark-green UI, decorative folk clichés.

## Colors

Canvas and Ink do almost all structural work. Cobalt identifies informational/current state. Coral is tightly rationed to brand misregistration, validation emphasis, and destructive semantics where contrast permits. Paper is the only softened field for dense editable content.

## Typography

Unbounded is the intended display face and Manrope the intended UI face. Until licensed font files are supplied, runtime uses metric-safe system fallbacks and documents the deviation. UI hierarchy uses scale and placement; body copy remains readable and does not imitate the all-heavy poster lockup everywhere.

## Layout

Full-field acid canvas, hairline black rules, zero-radius panels, 9px rhythm with 26px working gaps and up to 54px section framing. Public questionnaires are single-column mobile-first. Host workspace is desktop-first with route-backed navigation and a natural document scroll owner.

Audience-facing Public Screen states may use a stage-graphics register: full-bleed photography, large-distance typography, and minimal chrome. The Welcome / QR state uses a quiet photo-and-paper split rather than inheriting the Host dashboard's acid canvas; controls and other product surfaces remain unchanged.

## Elevation & Depth

No shadows, blur, glass, or gradients. Hierarchy comes from black fills, borders, whitespace, and type.

## Shapes

All controls and panels are rectangular with square corners. Touch targets remain at least 44px even when the graphic language is compact.

## Components

Runtime tokens are canonical in `src/app/globals.css`; this document mirrors exact accepted values and rationale. Shared components own button, field, panel, status, toast, dialog, navigation, and upload behavior. Cobalt/coral never become decorative full-panel fills.

## Do's and Don'ts

- Do keep one clear primary action per decision area.
- Do use black/yellow contrast and hairline structure.
- Do preserve visible focus, error text, and semantic states.
- Don't spread the glitch through form controls or dense response content.
- Don't introduce radius, shadow, generic neutral cards, or animation beyond quick opacity changes.
