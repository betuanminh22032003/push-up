/** Dark-mode design tokens. Single source of truth for colour + type. */
export const colors = {
  bg: '#0A0A0B',
  surface: '#131316',
  surfaceAlt: '#1C1C21',
  border: '#26262C',
  text: '#F5F5F7',
  textDim: '#8A8A93',
  textFaint: '#55555E',
  accent: '#4ADE80',
  accentDim: '#166534',
  danger: '#F87171',
  warn: '#FBBF24',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

export const type = {
  counter: { fontSize: 140, fontWeight: '200', letterSpacing: -6 },
  timer: { fontSize: 44, fontWeight: '300', letterSpacing: 2 },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.6 },
  stat: { fontSize: 26, fontWeight: '600' },
};
