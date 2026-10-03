import { registerRootComponent } from 'expo';

import App from './App';
import { installGlobalErrorHandler } from './src/diagnostics/globalHandler';

// Uncaught errors are kept in a local log (never sent anywhere) before the
// app renders, so even one thrown during start-up is recorded.
installGlobalErrorHandler();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
