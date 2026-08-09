---
name: Soft Kinetic
colors:
  surface: '#fcf9f4'
  surface-dim: '#dcdad5'
  surface-bright: '#fcf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ee'
  surface-container: '#f0ede9'
  surface-container-high: '#ebe8e3'
  surface-container-highest: '#e5e2dd'
  on-surface: '#1c1c19'
  on-surface-variant: '#55433f'
  inverse-surface: '#31302d'
  inverse-on-surface: '#f3f0eb'
  outline: '#87726e'
  outline-variant: '#dac1bb'
  surface-tint: '#964735'
  primary: '#964735'
  on-primary: '#ffffff'
  primary-container: '#d97b66'
  on-primary-container: '#57170a'
  inverse-primary: '#ffb4a4'
  secondary: '#645e4f'
  on-secondary: '#ffffff'
  secondary-container: '#e8dfcc'
  on-secondary-container: '#696253'
  tertiary: '#53624f'
  on-tertiary: '#ffffff'
  tertiary-container: '#899983'
  on-tertiary-container: '#233120'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3d0600'
  on-primary-fixed-variant: '#783020'
  secondary-fixed: '#ebe1cf'
  secondary-fixed-dim: '#cfc6b3'
  on-secondary-fixed: '#1f1b10'
  on-secondary-fixed-variant: '#4c4638'
  tertiary-fixed: '#d7e7cf'
  tertiary-fixed-dim: '#bbcbb3'
  on-tertiary-fixed: '#121f10'
  on-tertiary-fixed-variant: '#3c4b38'
  background: '#fcf9f4'
  on-background: '#1c1c19'
  surface-variant: '#e5e2dd'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

This design system is built for a modern, sophisticated female audience, blending the technical precision of a high-growth SaaS platform with an organic, welcoming warmth. The aesthetic—Soft Kinetic—prioritizes fluid motion, gentle tactility, and high-clarity layouts.

The personality is confident but approachable, professional but empathetic. It utilizes a refined **Minimalism** approach infused with **Tonal Layering**. The UI should feel like a high-end wellness or productivity tool: breathable, rhythmic, and intentional. Every interaction should evoke a sense of calm efficiency and quiet luxury.

## Colors

The palette is anchored by a soft cream base to provide a warm, low-fatigue environment.

- **Primary (Soft Terracotta):** Used for primary actions, critical brand moments, and active states. It provides a grounded, sophisticated energy.
- **Secondary (Muted Champagne):** Used for subtle backgrounds, secondary buttons, and container fills. It bridges the gap between the neutral base and the primary accents.
- **Tertiary (Sage Green):** Reserved for success states, secondary highlights, or natural accents to suggest growth and balance.
- **Neutral (Soft Cream / Rose Surface):** The global background and surface color, designed to feel more "alive" and premium than pure white.
- **Text:** Deep charcoal with a hint of warmth (#2D2926) for optimal legibility against the cream background.

## Typography

The design system exclusively uses **Space Grotesk** to maintain a modern, geometric SaaS edge. The inherent "quirkiness" of the font's terminals is balanced by the soft color palette.

- **Headlines:** Set with tighter letter spacing and higher weights to emphasize the geometric structure.
- **Body Text:** Ample line height is required to ensure the monolinear nature of the typeface remains highly readable on cream backgrounds.
- **Labels:** Always uppercase or medium-weight to distinguish interactive metadata from narrative body text.

## Layout & Spacing

The layout philosophy follows a **Fluid-to-Fixed Grid** model. On mobile, it utilizes a 4-column system with 16px margins. On desktop, it expands to a 12-column grid with a maximum width of 1280px to prevent excessive line lengths.

Spacing is based on a 4px baseline, but defaults to larger increments (16, 24, 32, 48) to reinforce the sense of "air" and luxury. Negative space should be treated as a functional element—use it to group related components rather than relying on heavy dividers.

## Elevation & Depth

This design system avoids heavy shadows. Depth is communicated through **Tonal Layers** and extremely soft, large-radius ambient blurs.

- **Level 0 (Base):** The Soft Cream (#FAF7F2) background.
- **Level 1 (Cards/Containers):** Muted Champagne (#F2E8D5) or pure White with a 1px border in a slightly darker cream tint.
- **Level 2 (Modals/Popovers):** White surfaces with a "Floating" effect—defined by a 15% opacity primary color shadow (Terracotta tint) with a 30px blur and 10px Y-offset.
- **Interaction:** On hover, elements should subtly lift or transition in color rather than increasing shadow density.

## Shapes

The shape language is defined by **Pill-shaped (Fully Rounded)** geometry. This choice softens the technical nature of the Space Grotesk typeface.

- **Buttons & Chips:** Always use a fully rounded (capsule) radius.
- **Cards & Modals:** Use `rounded-xl` (1.5rem / 24px) to maintain a soft but structural appearance.
- **Inputs:** Utilize a 12px or fully rounded radius to match the friendly, approachable aesthetic.

## Components

- **Buttons:** Primary buttons use the Terracotta fill with white text. Secondary buttons use a Sage Green outline or Champagne fill with Terracotta text. Use high-horizontal padding (e.g., 24px for a 48px height) to maintain the "kinetic" feel.
- **Input Fields:** Soft cream fills with a 1px Champagne border. On focus, the border transitions to Terracotta with a subtle outer glow.
- **Chips/Tags:** Small, pill-shaped elements with Tertiary (Sage) backgrounds and dark green text for categorization.
- **Cards:** No heavy borders. Use subtle background shifts (Secondary color) to define boundaries. Content inside should have generous padding (min 24px).
- **Navigation:** Use a blurred background (glassmorphism) with the Soft Cream tint for top navigation bars to keep the UI feeling lightweight and kinetic during scroll.
- **Feedback Loops:** Use Sage Green for success and Terracotta for warnings; avoid harsh reds or neon greens to maintain the "Soft Kinetic" tonal harmony.