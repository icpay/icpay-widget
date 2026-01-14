# ICPay Color Palette

This document outlines the color palette used in the ICPay web application for both light and dark modes.

## CSS Variables

The application uses CSS custom properties (variables) defined in `globals.css` for theme-aware colors.

### Light Mode Colors

```css
:root,
:root.light {
  --background: #ffffff;
  --foreground: #171717;
  --muted-foreground: #6b7280;
  --accent-foreground: #ffffff;
  --primary: #3b82f6;
  --destructive: #ef4444;
  --primary-foreground: #ffffff;
  --secondary: #f3f4f6;
  --secondary-foreground: #171717;
  --accent: #f9fafb;
  --muted: #f9fafb;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #3b82f6;
  --destructive-foreground: #ffffff;
}
```

### Dark Mode Colors

```css
.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  --muted-foreground: hsl(215 20.2% 65.1%);
  --accent-foreground: hsl(210 40% 98%);
  --primary: hsl(210 40% 98%);
  --destructive: hsl(0 62.8% 30.6%);
  --primary-foreground: hsl(222.2 47.4% 11.2%);
  --secondary: hsl(217.2 32.6% 17.5%);
  --secondary-foreground: hsl(210 40% 98%);
  --accent: hsl(217.2 32.6% 17.5%);
  --muted: hsl(217.2 32.6% 17.5%);
  --border: hsl(217.2 32.6% 30%);
  --input: hsl(217.2 32.6% 17.5%);
  --ring: hsl(210 40% 98%);
  --destructive-foreground: hsl(210 40% 98%);
}
```

## Color Usage Guide

### Primary Colors

- **Background** (`--background`): Main page background
  - Light: `#ffffff` (white)
  - Dark: `hsl(222.2 84% 4.9%)` (very dark blue)

- **Foreground** (`--foreground`): Primary text color
  - Light: `#171717` (near black)
  - Dark: `hsl(210 40% 98%)` (off-white)

### Secondary Colors

- **Muted Foreground** (`--muted-foreground`): Secondary text, labels, captions
  - Light: `#6b7280` (medium grey)
  - Dark: `hsl(215 20.2% 65.1%)` (light grey)

- **Secondary** (`--secondary`): Card backgrounds, input backgrounds
  - Light: `#f3f4f6` (light grey)
  - Dark: `hsl(217.2 32.6% 17.5%)` (dark grey-blue)

- **Muted** (`--muted`): Subtle backgrounds, hover states
  - Light: `#f9fafb` (very light grey)
  - Dark: `hsl(217.2 32.6% 17.5%)` (dark grey-blue)

### Accent Colors

- **Accent** (`--accent`): Hover backgrounds, subtle highlights
  - Light: `#f9fafb` (very light grey)
  - Dark: `hsl(217.2 32.6% 17.5%)` (dark grey-blue)

- **Primary** (`--primary`): Links, buttons, interactive elements
  - Light: `#3b82f6` (blue)
  - Dark: `hsl(210 40% 98%)` (off-white)

### Border Colors

- **Border** (`--border`): Borders, dividers
  - Light: `#e5e7eb` (light grey)
  - Dark: `hsl(217.2 32.6% 30%)` (medium grey-blue)

### Status Colors

Status colors are defined using Tailwind classes with opacity:

- **Success/Completed**: `bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30`
- **Warning/Pending**: `bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30`
- **Processing**: `bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30`
- **Error/Failed**: `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30`
- **Refunded**: `bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30`

## Usage in Code

### Tailwind CSS Classes

The application uses Tailwind CSS with these color classes:

- `bg-background` - Main background
- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary text
- `bg-secondary` - Card/input backgrounds
- `bg-muted` - Subtle backgrounds
- `bg-accent` - Hover states
- `border-border` - Borders
- `text-primary` - Links and interactive elements

### CSS with HSL Variables

When using CSS directly, reference variables with `hsl()`:

```css
background-color: hsl(var(--background));
color: hsl(var(--foreground));
border-color: hsl(var(--border));
```

### Opacity Variations

Common opacity patterns used:

- `bg-muted-background/20` - 20% opacity for light backgrounds
- `bg-muted-background/10` - 10% opacity for subtle backgrounds
- `bg-muted-background/5` - 5% opacity for very subtle backgrounds
- `bg-muted-background/3` - 3% opacity for minimal backgrounds
- `border-border/30` - 30% opacity borders
- `border-border/50` - 50% opacity borders

## Typography

### Font Weights

- **Regular**: `font-regular` (400) - Body text, most content
- **Light**: `font-light` (300) - Blog content, captions, secondary text
- **Medium**: `font-medium` (500) - Headings, emphasis
- **Semibold**: `font-semibold` (600) - Strong emphasis

### Font Sizes

- **Page Titles**: `text-2xl` (1.5rem / 24px)
- **Section Headings**: `text-xl` (1.25rem / 20px)
- **Body Text**: `text-base` (1rem / 16px)
- **Small Text**: `text-sm` (0.875rem / 14px)
- **Extra Small**: `text-xs` (0.75rem / 12px)

## Component-Specific Colors

### Buttons

- **Primary Button**: `bg-foreground text-background hover:bg-foreground/90`
- **Secondary Button**: `bg-secondary dark:bg-muted/30 text-foreground`

### Input Fields

- **Background**: `bg-muted-foreground/5` (light mode) or `bg-background` (dark mode)
- **Border**: `border-muted-foreground/20`
- **Focus**: `bg-background` with `border-primary`

### Cards/Tables

- **Container**: `bg-muted-background/20 dark:bg-muted-background/10`
- **Border**: `border border-border border-muted-foreground/10`
- **Header**: `bg-muted/30 dark:bg-muted/70`

## Implementation Notes

1. **Theme Detection**: The application uses `next-themes` for theme management
2. **CSS Variables**: All colors are defined as CSS custom properties for easy theming
3. **HSL Format**: Dark mode uses HSL values for better color manipulation
4. **Opacity**: Use Tailwind opacity utilities (`/10`, `/20`, `/30`, etc.) for transparency
5. **Responsive**: Colors work consistently across all breakpoints

## Example Implementation

```tsx
// React component example
<div className="bg-background text-foreground">
  <h1 className="text-2xl font-regular text-foreground">Title</h1>
  <p className="text-base text-muted-foreground">Subtitle</p>
  <button className="bg-foreground text-background hover:bg-foreground/90">
    Click me
  </button>
</div>
```

```css
/* CSS example */
.my-component {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
}
```

