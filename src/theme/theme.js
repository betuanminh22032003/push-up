import { Platform } from 'react-native';

/**
 * Design tokens. Single source of truth for colour, shape and type.
 *
 * Dark, with a faint green in the neutrals so the surfaces belong to the
 * brand colour rather than sitting on plain grey. Cards are told apart by
 * tone, not by outlines; the outline colour is for the few places that need
 * an edge (inputs, chips that are off).
 */
export const colors = {
  bg: '#0B0E0C',
  surface: '#141916',
  surfaceAlt: '#1C231F',
  border: '#27302B',
  text: '#F2F6F3',
  textDim: '#98A39C',
  textFaint: '#5E6A63',
  accent: '#4ADE80',
  accentDim: '#166534',
  // The brand colour as a wash behind text or an icon.
  accentSoft: 'rgba(74, 222, 128, 0.12)',
  // Streaks and anything "on fire": the one warm colour.
  flame: '#FF9A4D',
  flameSoft: 'rgba(255, 154, 77, 0.14)',
  danger: '#F87171',
  warn: '#FBBF24',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

/**
 * Be Vietnam Pro, one family per weight, loaded in App.js before the first
 * frame. A Vietnamese typeface, drawn for stacked diacritics. Text asks for a
 * weight through `font()` rather than `fontWeight`: with a custom family,
 * Android and the web would fake a bold on top of the file's own weight.
 */
export const FONT_FAMILIES = {
  300: 'BeVietnamPro_300Light',
  400: 'BeVietnamPro_400Regular',
  500: 'BeVietnamPro_500Medium',
  600: 'BeVietnamPro_600SemiBold',
  700: 'BeVietnamPro_700Bold',
  800: 'BeVietnamPro_800ExtraBold',
};

/** `{ fontFamily }` for a CSS-style weight; 100-200 read as 300, 900 as 800. */
export function font(weight = '400') {
  const named = { normal: 400, bold: 700 }[weight];
  const w = named ?? Math.min(800, Math.max(300, Math.round(Number(weight) / 100) * 100 || 400));
  return { fontFamily: FONT_FAMILIES[w] };
}

export const type = {
  counter: { fontSize: 136, ...font('300'), letterSpacing: -4 },
  timer: { fontSize: 40, ...font('400'), letterSpacing: 1, fontVariant: ['tabular-nums'] },
  title: { fontSize: 24, ...font('700'), letterSpacing: -0.3 },
  heading: { fontSize: 17, ...font('700'), letterSpacing: -0.2 },
  body: { fontSize: 15, ...font('400') },
  label: { fontSize: 12, ...font('600'), letterSpacing: 0.2 },
  stat: { fontSize: 26, ...font('700'), letterSpacing: -0.5 },
};

/**
 * A dark glow behind text drawn over the camera, so it stays readable on a
 * bright frame. React Native takes the three long-form props; react-native-web
 * wants the CSS shorthand and warns on the others.
 */
export const textGlow = (y, blur) =>
  Platform.OS === 'web'
    ? { textShadow: `0px ${y}px ${blur}px rgba(0,0,0,0.85)` }
    : { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: y }, textShadowRadius: blur };
