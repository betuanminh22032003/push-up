import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { getDemo } from '../exercises/demoPoses';
import { useT } from '../i18n/I18nContext';
import { colors } from '../theme/theme';
import { demoPageHtml } from './demo3dPage';
import { ExerciseDemo } from './ExerciseDemo';

/** No word from the page after this long (no network, no WebGL): draw it flat. */
const READY_TIMEOUT_MS = 10000;

/**
 * The exercise done by a lit, shadowed 3D mannequin (./demo3dPage) in a
 * WebView, turned with a finger. Where the page cannot run, the flat figure
 * (./ExerciseDemo) stands in, with a line saying why.
 *
 * @param {string} exerciseId
 * @param {number} width
 * @param {number} height
 * @param {number} [speed]  1 normal, below 1 slow motion
 * @param {boolean} [lite]  lighter rendering, for the small figure during a set
 */
export function ExerciseDemo3D({ exerciseId, width, height, speed = 1, lite = false }) {
  const t = useT();
  const ref = useRef(null);
  const [state, setState] = useState('loading'); // 'loading' | 'ready' | 'failed'
  const html = useMemo(() => demoPageHtml(getDemo(exerciseId), colors, { lite }), [exerciseId, lite]);

  useEffect(() => {
    setState('loading');
    const timer = setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [html]);

  useEffect(() => {
    if (state === 'ready') ref.current?.injectJavaScript(`window.setSpeed && setSpeed(${speed}); true;`);
  }, [speed, state]);

  if (state === 'failed') {
    return (
      <View>
        <ExerciseDemo exerciseId={exerciseId} width={width} height={height} speed={speed} />
        <Text style={styles.offline}>{t('guide.offline')}</Text>
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        style={[styles.web, { width, height }]}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'ready') setState('ready');
            else if (msg.type === 'error') setState('failed');
          } catch {
            // not ours
          }
        }}
        onError={() => setState('failed')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  web: { backgroundColor: colors.surface },
  offline: { fontSize: 11, color: colors.textFaint, textAlign: 'center', paddingBottom: 4 },
});
