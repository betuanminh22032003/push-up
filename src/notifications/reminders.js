import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * The daily workout reminder — a local notification, nothing remote.
 *
 * expo-notifications has no web implementation, and importing it there
 * throws, so it is required lazily and every call is a no-op on web. Expo Go
 * on Android gets the same treatment: push support was removed there in
 * SDK 53, and the package's push-token auto-registration runs on import and
 * throws, which would crash the whole app before it renders — even though
 * only local notifications are used here. Development and store builds are
 * unaffected.
 *
 * Android schedules it with an inexact alarm (expo-notifications falls back
 * to one when the exact-alarm permission is absent), which is right for a
 * reminder: a few minutes' drift costs nothing and avoids a special
 * permission that Google Play restricts to alarm-clock apps.
 */

const CHANNEL_ID = 'reminders';
const REMINDER_ID = 'daily-reminder';

export const remindersSupported =
  Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

function mod() {
  if (!remindersSupported) return null;
  // eslint-disable-next-line global-require
  return require('expo-notifications');
}

/** Show reminders as banners even while the app is in the foreground. */
export function configureNotifications() {
  const Notifications = mod();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** @returns {Promise<boolean>} whether notifications may be shown */
export async function requestReminderPermission() {
  const Notifications = mod();
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch {
    return false;
  }
}

/**
 * (Re)schedule the one daily reminder. Cancels the previous one first, so
 * calling this on every launch is safe and keeps the text in the current
 * language.
 */
export async function scheduleDailyReminder({ hour, minute, title, body }) {
  const Notifications = mod();
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title, body, sound: false },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelDailyReminder() {
  const Notifications = mod();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    /* nothing scheduled */
  }
}
