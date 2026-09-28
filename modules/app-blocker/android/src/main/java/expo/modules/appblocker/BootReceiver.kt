package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Starts [WatchService] again after a reboot or an app update, the two moments
 * Android lets an app start a foreground service from the background. The
 * accessibility service needs no help: the system binds it again by itself.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> WatchService.sync(context)
    }
  }
}
