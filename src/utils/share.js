import { Share } from 'react-native';

/**
 * Hand a line of text to the system share sheet. Fire-and-forget: a share
 * that is cancelled, or a platform without a share sheet (desktop web),
 * must never surface as an error in a workout summary.
 */
export async function shareText(message) {
  try {
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}
