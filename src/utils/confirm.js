import { Alert, Platform } from 'react-native';

/**
 * A yes/no dialog that also works on web, where `Alert.alert` is a no-op and
 * would silently swallow every destructive action.
 */
export function confirm({ title, message, confirmText, cancelText, destructive, onConfirm }) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
