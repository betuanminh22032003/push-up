import { StyleSheet, Text, View } from 'react-native';

/**
 * Dev-only probe for the native pose WebView.
 *
 * The detector page is hosted, so debugging it on a phone would otherwise mean
 * redeploying it or wiring up chrome://inspect over USB. Instead these scripts
 * are injected into the page and report what it actually sees — whether
 * getUserMedia resolved, whether the <video> is getting frames, what the
 * page's own status line says — as `diag` messages, which PoseStage shows over
 * the stage and logs to Metro. Nothing here ships: PoseStage only wires it up
 * under __DEV__.
 *
 * Plain ES5 strings on purpose: Hermes does not keep function source, so
 * `fn.toString()` cannot be used to build them.
 */

const POST = `var post = function (event, text) {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'diag', event: event, text: String(text) })
      );
    } catch (e) {}
  };`;

/** Runs before the page's own script: catches errors and wraps getUserMedia. */
export const PROBE_BEFORE_LOAD = `(function () {
  ${POST}
  post('webview', 'Chrome ' + (navigator.userAgent.split('Chrome/')[1] || '?').split(' ')[0]);
  window.addEventListener('error', function (e) { post('js-error', e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    post('js-error', (e.reason && e.reason.message) || e.reason);
  });
  var md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) {
    post('camera', 'navigator.mediaDevices missing');
    return;
  }
  var original = md.getUserMedia.bind(md);
  md.getUserMedia = function (constraints) {
    post('camera', 'requested');
    return original(constraints).then(
      function (stream) {
        var track = stream.getVideoTracks()[0];
        var s = track && track.getSettings ? track.getSettings() : {};
        post('camera', 'granted ' + s.width + 'x' + s.height + ', track ' + (track ? track.readyState : 'missing'));
        return stream;
      },
      function (err) {
        post('camera', 'failed ' + (err && err.name) + ': ' + (err && err.message));
        throw err;
      }
    );
  };
})();
true;`;

/** Runs once the page has loaded: samples the video and status line every second. */
export const PROBE_AFTER_LOAD = `(function () {
  if (window.__pupgProbe) return;
  window.__pupgProbe = true;
  ${POST}
  var lastTime = -1;
  var ticks = 0;
  var timer = setInterval(function () {
    var v = document.getElementById('video');
    var s = document.getElementById('status');
    if (v) {
      var moving = v.currentTime !== lastTime;
      lastTime = v.currentTime;
      post('video', (v.srcObject ? '' : 'no stream, ') + 'readyState ' + v.readyState + ', ' +
        v.videoWidth + 'x' + v.videoHeight + ', ' + (v.paused ? 'paused' : moving ? 'playing' : 'frozen'));
    } else {
      post('video', 'no <video> element');
    }
    post('page', s && !s.classList.contains('hidden') ? s.textContent : '(no status: ready)');
    if (++ticks >= 120) clearInterval(timer);
  }, 1000);
})();
true;`;

const ORDER = [
  'perm',
  'load',
  'error',
  'render',
  'webview',
  'camera',
  'video',
  'page',
  'status',
  'frames',
  'js-error',
];

/** The probe's latest readings, drawn over the stage. */
export function ProbeReadout({ lines }) {
  const keys = ORDER.filter((key) => lines[key] != null);
  if (keys.length === 0) return null;
  return (
    <View style={styles.box}>
      {keys.map((key) => (
        <Text key={key} style={styles.line} numberOfLines={2}>
          {`${key}: ${lines[key]}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    pointerEvents: 'none',
  },
  line: { fontSize: 11, lineHeight: 15, color: '#A3E635', fontFamily: 'monospace' },
});
