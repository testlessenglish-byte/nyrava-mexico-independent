/**
 * NYRAVA MÉXICO PDF DESIGN SYSTEM TOKENS
 *
 * Visual Language:
 * - Deep Nyrava Forest Green (#104033 / #0D281E)
 * - Warm Ivory / Cream Sheet (#FAF6F0 / #FAF4EB)
 * - Muted Gold Accents (#C49257 / #B8864E)
 * - Dark Navy / Teal Secondary Accents (#0F2B38)
 * - High-contrast Deep Pine Ink (#1C2621)
 *
 * Universal theme inherited by all legal materias (Familiar, Civil, Mercantil,
 * Penal, Amparo, Laboral, Administrativo, Fiscal, Migratorio, etc.).
 */

export type RGBColor = [number, number, number];

export interface PdfTheme {
  colors: {
    // Primary Forest & Pine Green Family
    primary: RGBColor;
    primaryDark: RGBColor;
    primaryDeep: RGBColor;
    primaryLight: RGBColor;
    primarySoft: RGBColor;

    // Warm Ivory / Cream Family (Interior Pages & Card Fills)
    pageBg: RGBColor;
    cream: RGBColor;
    creamDark: RGBColor;
    quoteBg: RGBColor;
    cardBg: RGBColor;
    cardBgWarm: RGBColor;

    // Muted Gold Family (Eyebrows, Dividers, Accent Rules, Badges)
    gold: RGBColor;
    goldDark: RGBColor;
    goldLight: RGBColor;
    goldMuted: RGBColor;
    goldSoft: RGBColor;

    // Secondary Navy & Teal Accents
    navy: RGBColor;
    teal: RGBColor;

    // Ink & Body Typography
    ink: RGBColor;
    inkLight: RGBColor;
    muted: RGBColor;
    mutedLight: RGBColor;

    // Borders & Hairlines
    line: RGBColor;
    lineGold: RGBColor;
    cardBorder: RGBColor;

    // Semantic Severity Levels
    danger: RGBColor;
    high: RGBColor;
    medium: RGBColor;
    success: RGBColor;

    // Semantic Badges
    tribunalBadge: RGBColor;
    tribunalBadgeBg: RGBColor;
    parteBadge: RGBColor;
    parteBadgeBg: RGBColor;
    unverifiedBadge: RGBColor;
    unverifiedBadgeBg: RGBColor;
  };
  dimensions: {
    margin: number;
    continuationHeaderH: number;
    runningHeaderBandH: number;
    footerH: number;
    logoSize: number;
  };
  typography: {
    titleFont: string;
    bodyFont: string;
    eyebrowFont: string;
  };
}

export const PDF_THEME: PdfTheme = {
  colors: {
    // Deep Nyrava Green family (matches approved cover)
    primary: [16, 64, 51],         // #104033 - Deep Pine Green
    primaryDark: [13, 40, 30],     // #0D281E - Deep Forest Green
    primaryDeep: [9, 30, 22],      // #091E16 - Midnight Pine
    primaryLight: [24, 85, 68],    // #185544 - Forest Leaf
    primarySoft: [230, 239, 234],  // #E6EFEA - Soft Green Tint

    // Warm Ivory / Cream sheet (never bright white, never purple)
    pageBg: [250, 246, 240],       // #FAF6F0 - Warm Ivory/Cream
    cream: [250, 244, 235],        // #FAF4EB - Soft Warm Cream
    creamDark: [244, 237, 226],    // #F4EDE2 - Antique Parchment
    quoteBg: [247, 242, 235],      // #F7F2EB - Evidence Blockquote Fill
    cardBg: [255, 255, 255],       // #FFFFFF - Card Surface
    cardBgWarm: [253, 251, 247],   // #FDFBF7 - Warm Card Surface

    // Muted Gold accents
    gold: [196, 146, 87],          // #C49257 - Muted Architectural Gold
    goldDark: [166, 120, 68],      // #A67844 - Deep Burnished Gold
    goldLight: [212, 175, 122],    // #D4AF7A - Warm Pale Gold
    goldMuted: [222, 195, 155],    // #DEC39B - Soft Gold Border
    goldSoft: [248, 242, 233],     // #F8F2E9 - Soft Gold Tint

    // Dark Navy / Teal secondary
    navy: [15, 43, 56],            // #0F2B38 - Midnight Navy
    teal: [18, 56, 45],            // #12382D - Deep Teal Shadow

    // Deep ink (high contrast, editorial, no purple tint)
    ink: [28, 38, 33],             // #1C2621 - Deep Dark Pine Ink
    inkLight: [44, 56, 50],        // #2C3832 - Charcoal Ink
    muted: [98, 104, 95],          // #62685F - Restrained Muted Slate
    mutedLight: [138, 144, 135],   // #8A9087 - Secondary Caption

    // Hairlines and structural dividers
    line: [222, 212, 194],         // #DED4C2 - Muted Warm Hairline
    lineGold: [206, 172, 126],     // #CEAC7E - Gold Accent Line
    cardBorder: [229, 218, 205],   // #E5DACD - Card Outline

    // Semantic Severity
    danger: [155, 42, 42],         // #9B2A2A - Crimson Red
    high: [176, 108, 34],          // #B06C22 - Amber Ochre
    medium: [150, 128, 34],        // #968022 - Warm Bronze
    success: [39, 98, 66],         // #276242 - Deep Emerald

    // Attribution Badges
    tribunalBadge: [16, 64, 51],      // Green
    tribunalBadgeBg: [230, 239, 234], // Soft Green
    parteBadge: [180, 131, 79],       // Gold
    parteBadgeBg: [250, 242, 230],    // Soft Gold
    unverifiedBadge: [168, 104, 32],  // Restrained Warning
    unverifiedBadgeBg: [251, 241, 230], // Soft Warning Tint
  },
  dimensions: {
    margin: 36,
    continuationHeaderH: 50,
    runningHeaderBandH: 36,
    footerH: 42,
    logoSize: 18,
  },
  typography: {
    titleFont: "times",
    bodyFont: "helvetica",
    eyebrowFont: "helvetica",
  },
};
