import { Component } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLocales } from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';

import { appInfo, deviceInfo } from '../diagnostics/device';
import { loadErrors, recordError } from '../diagnostics/errorLog';
import { formatReport } from '../diagnostics/report';
import { resolveLanguage, translate } from '../i18n/strings';
import { colors, font, spacing, type } from '../theme/theme';
import { shareText } from '../utils/share';
import { Button } from './Button';

/**
 * The last line of defence: a render error anywhere below shows a friendly
 * screen instead of a blank one, is kept in the local error log, and can be
 * sent by the user through the share sheet. "Try again" re-mounts the app;
 * workouts are saved as they finish, so nothing already recorded is lost.
 *
 * It sits above every provider, so it cannot use the language setting: it
 * speaks the phone's language.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const withStack = error instanceof Error ? error : new Error(String(error));
    if (info?.componentStack && withStack.stack) {
      withStack.stack = `${withStack.stack}\n${info.componentStack}`;
    }
    recordError(withStack, { fatal: true, source: 'boundary' });
    // An error before the first real frame would otherwise sit under the splash.
    SplashScreen.hideAsync().catch(() => {});
  }

  t(key) {
    let codes = [];
    try {
      codes = getLocales().map((l) => l.languageCode);
    } catch {
      /* default to English */
    }
    return translate(resolveLanguage('auto', codes), key);
  }

  retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  report = async () => {
    const errors = await loadErrors();
    shareText(
      formatReport({
        intro: this.t('crash.reportIntro'),
        app: appInfo(),
        device: deviceInfo(),
        errors,
      }),
    );
  };

  render() {
    if (!this.state.error) {
      // A fresh key on retry: the tree below starts over rather than reusing
      // whatever state threw.
      return <View key={this.state.attempt} style={styles.fill}>{this.props.children}</View>;
    }
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>🩹</Text>
        <Text style={styles.title}>{this.t('crash.title')}</Text>
        <Text style={styles.body}>{this.t('crash.body')}</Text>
        <Text style={styles.detail} numberOfLines={3}>
          {String(this.state.error?.message || this.state.error)}
        </Text>
        <Button label={this.t('crash.retry')} onPress={this.retry} style={styles.button} />
        <Button label={this.t('crash.report')} variant="secondary" onPress={this.report} style={styles.button} />
        <Text style={styles.privacy}>{this.t('crash.privacy')}</Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  emoji: { ...font('400'), fontSize: 48, textAlign: 'center' },
  title: { ...type.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  body: { ...type.body, color: colors.textDim, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  detail: { ...font('400'), fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: spacing.md },
  button: { marginTop: spacing.lg },
  privacy: { ...font('400'), fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
