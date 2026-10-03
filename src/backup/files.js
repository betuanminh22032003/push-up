import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Getting a text file out of the app and back in, on Android and iOS.
 * The web build gets ./files.web.js (a download and a file input).
 *
 * Out: the file is written to the app's cache and handed to the system share
 * sheet, where the user picks Drive, Zalo, email, "Save to Files"... The app
 * itself never uploads anything and needs no storage permission.
 * In: the system document picker, copying into the cache so the file can be
 * read whatever provider it came from.
 */

/**
 * @returns {Promise<'shared'|'unavailable'>}
 */
export async function shareTextFile(name, text, { mimeType = 'application/json', dialogTitle } = {}) {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: 'public.json' });
  return 'shared';
}

/**
 * @returns {Promise<{name: string, text: string} | null>}  null when cancelled
 */
export async function pickTextFile() {
  // Any type: Android providers label .json files every way from
  // application/json to application/octet-stream, and a filter would hide them.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}
