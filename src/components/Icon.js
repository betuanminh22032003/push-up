import Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from '../theme/theme';

/**
 * The app's one icon set (Ionicons, outline for the resting state, filled
 * when selected), so controls and badges share one line weight instead of a
 * mix of emoji. Its font is loaded with the others in App.js.
 */
export function Icon({ name, size = 20, color = colors.text, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

export const ICON_FONT = Ionicons.font;
