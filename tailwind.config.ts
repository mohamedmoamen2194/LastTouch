import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- Slate & Steel (Modern Men) ----
        slate_steel: {
          background: "#f7f9fb",
          "on-background": "#191c1e",
          primary: "#091426",
          "on-primary": "#ffffff",
          "primary-container": "#1e293b",
          "on-primary-container": "#8590a6",
          secondary: "#515f74",
          "secondary-container": "#d5e3fc",
          "on-secondary-container": "#57657a",
          tertiary: "#061525",
          outline: "#75777d",
          "outline-variant": "#c5c6cd",
          "surface-container-lowest": "#ffffff",
          "surface-container-low": "#f2f4f6",
          "surface-container": "#eceef0",
          "surface-container-high": "#e6e8ea",
          "surface-container-highest": "#e0e3e5",
          "on-surface": "#191c1e",
          "on-surface-variant": "#45474c",
        },
        // ---- Soft Kinetic (Women's) ----
        soft_kinetic: {
          background: "#fcf9f4",
          "on-background": "#1c1c19",
          primary: "#964735",
          "on-primary": "#ffffff",
          "primary-container": "#d97b66",
          "on-primary-container": "#57170a",
          secondary: "#645e4f",
          "secondary-container": "#e8dfcc",
          "on-secondary-container": "#696253",
          tertiary: "#53624f",
          "on-tertiary": "#ffffff",
          "tertiary-container": "#899983",
          "on-tertiary-container": "#233120",
          outline: "#87726e",
          "outline-variant": "#dac1bb",
          "surface-container-lowest": "#ffffff",
          "surface-container-low": "#f6f3ee",
          "surface-container": "#f0ede9",
          "surface-container-high": "#ebe8e3",
          "surface-container-highest": "#e5e2dd",
          "on-surface-variant": "#55433f",
        },
        // ---- Core semantic (theme-driven) ----
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        success: {
          DEFAULT: "#16a34a",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#d97706",
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "#ba1a1a",
          foreground: "#ffffff",
        },
      },
      borderRadius: {
        DEFAULT: "1rem",
        sm: "0.5rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      fontFamily: {
        grotesk: ["var(--font-grotesk)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        tech: "0 4px 12px rgba(30, 41, 59, 0.05)",
        soft: "0 20px 60px -15px rgba(150, 71, 53, 0.08)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;