import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDemo } from '../exercises/demoPoses';
import { useT } from '../i18n/I18nContext';
import { colors, font } from '../theme/theme';
import { demoPageHtml } from './demo3dPage';
import { ExerciseDemo } from './ExerciseDemo';

const READY_TIMEOUT_MS = 10000;

/** The web build's twin of ./ExerciseDemo3D: the same page, in an iframe. */
export function ExerciseDemo3D({ exerciseId, width, height, speed = 1, lite = false }) {
  const t = useT();
  const ref = useRef(null);
  const [state, setState] = useState('loading');
  const html = useMemo(() => demoPageHtml(getDemo(exerciseId), colors, { lite }), [exerciseId, lite]);

  useEffect(() => {
    setState('loading');
    const timer = setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), READY_TIMEOUT_MS);
    const onMessage = (e) => {
      if (e.source !== ref.current?.contentWindow) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') setState('ready');
        else if (msg.type === 'error') setState('failed');
      } catch {
        // not ours
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [html]);

  useEffect(() => {
    if (state === 'ready') ref.current?.contentWindow?.setSpeed?.(speed);
  }, [speed, state]);

  if (state === 'failed') {
    return (
      <View>
        <ExerciseDemo exerciseId={exerciseId} width={width} height={height} speed={speed} />
        <Text style={styles.offline}>{t('guide.offline')}</Text>
      </View>
    );
  }
  return createElement('iframe', {
    ref,
    srcDoc: html,
    title: 'exercise-demo',
    style: { width, height, border: 0, display: 'block', background: colors.surface },
  });
}

const styles = StyleSheet.create({
  offline: { ...font('400'), fontSize: 11, color: colors.textFaint, textAlign: 'center', paddingBottom: 4 },
});
