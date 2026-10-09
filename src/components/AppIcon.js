import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, font } from '../theme/theme';

/** An installed app's icon, or its initial on a tile when there is no icon. */
export function AppIcon({ app, size = 36 }) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.24) };
  if (app?.icon) {
    return <Image source={{ uri: `data:image/png;base64,${app.icon}` }} style={box} />;
  }
  const initial = (app?.label || app?.packageName || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.tile, box]}>
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.45) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { ...font('700'), color: colors.textDim },
});
