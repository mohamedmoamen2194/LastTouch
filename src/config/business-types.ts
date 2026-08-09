import type { BusinessType, ThemeName } from "@/db/schema";

/**
 * Business type configuration (spec sections 11-12).
 * The application is driven by this configuration — no duplicated pages.
 * Adding a new business type requires configuration only.
 */
export type BusinessTypeConfig = {
  type: BusinessType;
  label: string;
  employeeLabel: string;
  theme: ThemeName;
  defaultServices: { name: string; description?: string; durationMinutes: number; price: string }[];
  defaultCategories: { name: string; icon?: string }[];
};

export const BUSINESS_TYPE_CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  barber_shop: {
    type: "barber_shop",
    label: "Men's Barber Shop",
    employeeLabel: "Barber",
    theme: "modern_men",
    defaultCategories: [
      { name: "Hair", icon: "content_cut" },
      { name: "Beard", icon: "shave" },
      { name: "Kids", icon: "child_care" },
      { name: "Packages", icon: "auto_awesome" },
    ],
    defaultServices: [
      { name: "Haircut", description: "Precision scissor cut with hot towel finish.", durationMinutes: 30, price: "250" },
      { name: "Beard Trim", description: "Line-up, shape and sculpt with a razor edge.", durationMinutes: 20, price: "150" },
      { name: "Skin Fade", description: "A crisp zero-to-taper fade for a modern finish.", durationMinutes: 45, price: "350" },
      { name: "Kids Cut", description: "Patient, friendly cut for the little gentlemen.", durationMinutes: 25, price: "200" },
      { name: "Hair Wash", description: "Refreshing wash with scalp massage.", durationMinutes: 15, price: "100" },
    ],
  },
  hair_salon: {
    type: "hair_salon",
    label: "Women's Hair Salon",
    employeeLabel: "Stylist",
    theme: "luxury_women",
    defaultCategories: [
      { name: "Cut & Style", icon: "content_cut" },
      { name: "Color", icon: "brush" },
      { name: "Treatments", icon: "spa" },
      { name: "Packages", icon: "auto_awesome" },
    ],
    defaultServices: [
      { name: "Haircut", description: "Tailored cut and finish for your face shape.", durationMinutes: 60, price: "500" },
      { name: "Hair Color", description: "Full color service with premium products.", durationMinutes: 120, price: "1200" },
      { name: "Balayage", description: "Hand-painted highlights for natural movement.", durationMinutes: 180, price: "1400" },
      { name: "Keratin", description: "Smoothing treatment for silky, frizz-free hair.", durationMinutes: 150, price: "1800" },
      { name: "Blow Dry", description: "Bouncy, voluminous finish.", durationMinutes: 45, price: "300" },
      { name: "Hair Treatment", description: "Intensive repair for stressed hair.", durationMinutes: 45, price: "400" },
    ],
  },
  nail_studio: {
    type: "nail_studio",
    label: "Nail Studio",
    employeeLabel: "Nail Technician",
    theme: "luxury_women",
    defaultCategories: [
      { name: "Manicure", icon: "back_hand" },
      { name: "Pedicure", icon: "footprint" },
      { name: "Extensions", icon: "auto_fix_high" },
    ],
    defaultServices: [
      { name: "Classic Manicure", durationMinutes: 45, price: "350" },
      { name: "Gel Manicure", durationMinutes: 60, price: "500" },
      { name: "Classic Pedicure", durationMinutes: 60, price: "450" },
      { name: "Acrylic Extensions", durationMinutes: 120, price: "900" },
    ],
  },
  beauty_center: {
    type: "beauty_center",
    label: "Beauty Center",
    employeeLabel: "Beauty Specialist",
    theme: "luxury_women",
    defaultCategories: [
      { name: "Skin", icon: "face" },
      { name: "Brows", icon: "eyebrow" },
      { name: "Makeup", icon: "brush" },
    ],
    defaultServices: [
      { name: "Facial", durationMinutes: 60, price: "600" },
      { name: "Brow Shaping", durationMinutes: 30, price: "200" },
      { name: "Makeup Session", durationMinutes: 90, price: "1500" },
    ],
  },
  spa: {
    type: "spa",
    label: "Spa",
    employeeLabel: "Therapist",
    theme: "luxury_women",
    defaultCategories: [
      { name: "Massage", icon: "spa" },
      { name: "Body", icon: "person" },
    ],
    defaultServices: [
      { name: "Swedish Massage", durationMinutes: 60, price: "700" },
      { name: "Deep Tissue", durationMinutes: 60, price: "800" },
      { name: "Body Scrub", durationMinutes: 45, price: "600" },
    ],
  },
  makeup_studio: {
    type: "makeup_studio",
    label: "Makeup Studio",
    employeeLabel: "Makeup Artist",
    theme: "luxury_women",
    defaultCategories: [
      { name: "Makeup", icon: "brush" },
      { name: "Bridal", icon: "favorite" },
    ],
    defaultServices: [
      { name: "Natural Makeup", durationMinutes: 60, price: "1200" },
      { name: "Bridal Makeup", durationMinutes: 120, price: "3500" },
      { name: "Trial Session", durationMinutes: 90, price: "1500" },
    ],
  },
  wellness_center: {
    type: "wellness_center",
    label: "Wellness Center",
    employeeLabel: "Coach",
    theme: "scandinavian",
    defaultCategories: [
      { name: "Wellness", icon: "self_improvement" },
      { name: "Recovery", icon: "healing" },
    ],
    defaultServices: [
      { name: "Wellness Session", durationMinutes: 60, price: "500" },
      { name: "Recovery Session", durationMinutes: 45, price: "450" },
    ],
  },
};

export function getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIGS[type] ?? BUSINESS_TYPE_CONFIGS.barber_shop;
}

/**
 * Theme -> visual token sets (spec section 12). Only affects presentation;
 * business logic never depends on theme.
 */
export type ThemeTokens = {
  id: ThemeName;
  label: string;
  // Tailwind-agnostic design tokens resolved at the component layer.
  background: string;
  surface: string;
  surfaceContainerLowest: string;
  surfaceContainerHigh: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  secondary: string;
  onSurfaceVariant: string;
  tertiary: string;
  outlineVariant: string;
  fontHeading: string;
  fontBody: string;
  radiusCard: string;
};

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  modern_men: {
    id: "modern_men",
    label: "Modern Men",
    background: "#f7f9fb",
    surface: "#f7f9fb",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#e6e8ea",
    primary: "#091426",
    onPrimary: "#ffffff",
    primaryContainer: "#1e293b",
    secondary: "#515f74",
    onSurfaceVariant: "#45474c",
    tertiary: "#061525",
    outlineVariant: "#c5c6cd",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  luxury_women: {
    id: "luxury_women",
    label: "Luxury Women",
    background: "#fcf9f4",
    surface: "#fcf9f4",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#ebe8e3",
    primary: "#964735",
    onPrimary: "#ffffff",
    primaryContainer: "#d97b66",
    secondary: "#645e4f",
    onSurfaceVariant: "#55433f",
    tertiary: "#53624f",
    outlineVariant: "#dac1bb",
    fontHeading: "Space Grotesk",
    fontBody: "Space Grotesk",
    radiusCard: "1rem",
  },
  scandinavian: {
    id: "scandinavian",
    label: "Scandinavian",
    background: "#fafaf7",
    surface: "#fafaf7",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#e4e4dd",
    primary: "#3d4a3d",
    onPrimary: "#ffffff",
    primaryContainer: "#6b7a6b",
    secondary: "#5c5c55",
    onSurfaceVariant: "#4a4a43",
    tertiary: "#8a8a7a",
    outlineVariant: "#d5d5cc",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    background: "#ffffff",
    surface: "#ffffff",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#ececec",
    primary: "#111111",
    onPrimary: "#ffffff",
    primaryContainer: "#333333",
    secondary: "#555555",
    onSurfaceVariant: "#444444",
    tertiary: "#999999",
    outlineVariant: "#dddddd",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  elegant_white: {
    id: "elegant_white",
    label: "Elegant White",
    background: "#fffdf9",
    surface: "#fffdf9",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#f0ece2",
    primary: "#8a6d4f",
    onPrimary: "#ffffff",
    primaryContainer: "#c9b08c",
    secondary: "#6e6152",
    onSurfaceVariant: "#5a5147",
    tertiary: "#a08b73",
    outlineVariant: "#e6ddd0",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  premium_black: {
    id: "premium_black",
    label: "Premium Black",
    background: "#0d0d0d",
    surface: "#141414",
    surfaceContainerLowest: "#1a1a1a",
    surfaceContainerHigh: "#262626",
    primary: "#d4af37",
    onPrimary: "#0d0d0d",
    primaryContainer: "#b3922c",
    secondary: "#a0a0a0",
    onSurfaceVariant: "#bdbdbd",
    tertiary: "#888888",
    outlineVariant: "#333333",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  coffee: {
    id: "coffee",
    label: "Coffee",
    background: "#f5efe6",
    surface: "#f5efe6",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#e6d9c8",
    primary: "#6f4e37",
    onPrimary: "#ffffff",
    primaryContainer: "#a97c50",
    secondary: "#7a6a55",
    onSurfaceVariant: "#5c5347",
    tertiary: "#9c8b72",
    outlineVariant: "#ddd0bf",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
  emerald: {
    id: "emerald",
    label: "Emerald",
    background: "#f3f7f5",
    surface: "#f3f7f5",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#dbe6e0",
    primary: "#0f5132",
    onPrimary: "#ffffff",
    primaryContainer: "#2f7d57",
    secondary: "#4f6f5d",
    onSurfaceVariant: "#3f5a4c",
    tertiary: "#7a9a88",
    outlineVariant: "#d0ded6",
    fontHeading: "Space Grotesk",
    fontBody: "Inter",
    radiusCard: "1rem",
  },
};

export function getThemeTokens(theme: ThemeName): ThemeTokens {
  return THEME_TOKENS[theme] ?? THEME_TOKENS.modern_men;
}