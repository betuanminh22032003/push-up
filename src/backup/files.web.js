/**
 * The web build's file I/O: a download out, a file input in. Same contract
 * as ./files.js; nothing is uploaded anywhere.
 */

/** @returns {Promise<'shared'|'unavailable'>} */
export async function shareTextFile(name, text, { mimeType = 'application/json' } = {}) {
  if (typeof document === 'undefined') return 'unavailable';
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has had its turn: revoking at once can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'shared';
}

/** @returns {Promise<{name: string, text: string} | null>} */
export function pickTextFile() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve({ name: file.name, text: await file.text() });
      } catch (e) {
        reject(e);
      }
    });
    // A cancelled dialog fires no event in most browsers; the promise just
    // never settles, which leaves nothing waiting on it but this closure.
    document.body.appendChild(input);
    input.click();
  });
}
