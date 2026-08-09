---
name: Slate & Steel
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45474c'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#061525'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b2a3b'
  on-tertiary-container: '#8291a6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#d4e4fa'
  tertiary-fixed-dim: '#b9c8de'
  on-tertiary-fixed: '#0d1c2d'
  on-tertiary-fixed-variant: '#39485a'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system embodies a "Modern Masculine" aesthetic—defined by precision, structural integrity, and an understated confidence. It moves away from aggressive "gamer" tropes toward a refined, executive SaaS profile. The personality is decisive and high-functioning, prioritizing utility and clarity.

The visual style is **Corporate Modern** with a lean toward **Minimalism**. It utilizes a sophisticated off-white/light-grey base to provide a sense of expansive space, allowing technical typography and structured components to command attention. The emotional response is one of reliability, focus, and premium engineering.

## Colors

The palette is anchored in a monochromatic range of slates and charcoals, creating a high-end technical feel.

*   **Primary (Deep Slate Blue):** Used for primary actions, navigation headers, and critical brand moments. It provides the "weight" of the design.
*   **Secondary (Charcoal):** Applied to secondary text and icons to maintain hierarchy without the harshness of pure black.
*   **Tertiary/Silver:** Utilized for borders, disabled states, and subtle decorative dividers.
*   **Neutral (Off-White/Light Grey):** The core surface color (`#F8FAFC`). This replaces pure white to reduce eye strain and provide a more "material" feel to the interface.

## Typography

This design system uses a rhythmic contrast between technical geometric headers and highly legible body text.

*   **Space Grotesk (Headlines):** Its quirky, geometric terminals provide the "modern" and "tech-forward" edge. Use it for all major headings.
*   **Inter (Body):** Selected for its exceptional readability in data-heavy SaaS environments. It keeps the "masculine" aesthetic grounded and functional.
*   **JetBrains Mono (Labels):** Used sparingly for metadata, small labels, and status indicators to reinforce the engineered, precise nature of the system.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop to ensure a controlled, "dashboard" feel, transitioning to a fluid model for mobile.

*   **Grid:** A 12-column grid system with generous 24px gutters. 
*   **Rhythm:** An 8px linear scale (8, 16, 24, 32, 48, 64) is used for all padding and margins to ensure mathematical consistency.
*   **Sectioning:** Use heavy "white" space (utilizing the neutral off-white surface) between major functional blocks to prevent visual clutter and maintain a premium, airy atmosphere.

## Elevation & Depth

To maintain a modern SaaS look, this design system avoids heavy shadows in favor of **Tonal Layering** and **Low-Contrast Outlines**.

*   **Surface Hierarchy:** The base is the Neutral surface (`#F8FAFC`). Elevated elements (cards, modals) use pure White (`#FFFFFF`) with a very fine 1px border in Silver (`#E2E8F0`).
*   **Shadows:** When necessary for modals, use a "Technical Shadow"—an ultra-fine, multi-layered shadow with zero spread and low opacity (e.g., `0 4px 12px rgba(30, 41, 59, 0.05)`).
*   **Interactive Depth:** On hover, buttons and interactive cards should transition their border color to the Primary Slate Blue rather than increasing shadow depth.

## Shapes

The shape language is defined by a **Full Pill** approach. While the content is structured and serious, the fully rounded corners provide a sophisticated, contemporary tech signature.

*   **Primary Shapes:** All buttons, input fields, and tags utilize a "rounded-full" radius.
*   **Containers:** Larger cards and modals use the `rounded-xl` token (3rem) to maintain harmony with the smaller pill elements while suggesting structural stability.

## Components

### Buttons & Controls
*   **Primary Action:** Solid Deep Slate Blue background with White text. Fully pill-shaped.
*   **Secondary Action:** Ghost style. Silver border, Slate Blue text.
*   **Tertiary Action:** Clear background with Slate Blue text and an underline on hover.

### Input Fields
*   Outlined style using the Silver border token. On focus, the border thickens to 2px and changes to the Primary Slate Blue. Use the `label-caps` typography for field headings.

### Cards
*   White background against the off-white surface. 1px Silver border. No shadow unless the card is draggable or floating.

### Specialized Components
*   **Data Badges:** Pill-shaped with a light Silver background and Slate Blue mono-text.
*   **Progress Bars:** Thin, Slate Blue fills against a Silver track. High precision, no rounded caps on the internal fill (sharp inner, rounded outer).
*   **Status Indicators:** Use Charcoal for "Neutral," Deep Slate for "Active," and avoid bright colors unless specifically for "Success/Error" feedback.