/**
 * Where the WebView loads the pose detector from.
 *
 * It must be **HTTPS**. `getUserMedia` only runs in a secure context, so the
 * two obvious alternatives both fail:
 *   - `source={{ html }}` gives the page an opaque origin, and getUserMedia
 *     hangs (a long-standing react-native-webview issue)
 *   - Metro's dev server is reached from the phone as http://192.168.x.x,
 *     which is not a secure origin either (only localhost and HTTPS are)
 *
 * So the page is published as a static file. `npm run build:pose` regenerates
 * docs/pose.html from src/pose/, and GitHub Pages serves it over HTTPS:
 *
 *   Settings -> Pages -> Source: "Deploy from a branch",
 *   Branch: master, Folder: /docs
 *
 * Any HTTPS host works — swap this URL for your own if you would rather not
 * use Pages.
 */
export const POSE_PAGE_URL = 'https://betuanminh22032003.github.io/push-up/pose.html';
