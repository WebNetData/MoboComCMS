# MoboCom Design System Reference

Use Figma SDS as structural guidance: Variables, Styles, Components, primitives/compositions and design-code mapping. Do not copy its demo visual identity.

## Protected surfaces
Do not broadly redesign:
- Homepage
- Magazine
- Music
- Games
- Movies
- TV Series

## Layers
```text
Semantic Tokens
  → Primitives
  → Compositions / Interaction Patterns
  → Domain Components
  → Layouts / Pages
```

## Themes
Tokens and presentation must be theme-aware.
A module-specific theme may override documented presentation contracts without changing domain behavior.

## State coverage
For interactive controls consider:
- default
- hover
- focus-visible
- active
- selected
- disabled
- loading
- error
- success

## Responsive
Mobile is not a scaled desktop. Prefer suitable drawers/sheets/sticky controls/mini-player patterns.

## RTL/LTR
Persian RTL and English LTR are first-class. Test navigation, icon direction, mixed text, sliders, menus, tables and media controls.

## Accessibility
Semantic HTML, keyboard operation, focus management, accessible names, live status feedback, reduced motion, contrast.

## Avoid
- generic AI-dashboard look
- glass everywhere
- random gradients
- giant empty heroes
- excessive nested cards
- arbitrary spacing/radii/shadows
- fake statistics
