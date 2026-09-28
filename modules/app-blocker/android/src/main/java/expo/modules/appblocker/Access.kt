package expo.modules.appblocker

import android.Manifest
import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Process
import android.provider.Settings

/**
 * The system permissions the blocker runs on. Either of two ways works:
 *
 * - the accessibility service ([BlockerService]), which also blocks websites
 *   and closes picture-in-picture, but which many banking apps refuse to run
 *   next to: VCB, BIDV, VietinBank and Agribank will not open while any app
 *   has it switched on;
 * - usage access plus "display over other apps" ([WatchService]), which blocks
 *   apps only and leaves banking apps alone.
 */
internal object Access {
  /** Switched on by the user in the system's accessibility settings. */
  fun accessibilityEnabled(context: Context): Boolean {
    val expected = ComponentName(context, BlockerService::class.java)
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
  }

  /** Usage access: lets the watcher read which app is in front from the usage events. */
  fun usageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    // checkOpNoThrow works on every version. Android 10 deprecated it in favour
    // of unsafeCheckOpNoThrow; SDK 36 deprecates that one instead.
    val mode = try {
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } catch (e: RuntimeException) {
      return false
    }
    // "Default" leaves it to the permission itself, which some builds pre-grant.
    return if (mode == AppOpsManager.MODE_DEFAULT) {
      context.checkSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
    } else {
      mode == AppOpsManager.MODE_ALLOWED
    }
  }

  /**
   * "Display over other apps": the watcher may open the block screen from the
   * background, and draw the countdown and its fallback cover as overlays.
   */
  fun overlay(context: Context): Boolean = Settings.canDrawOverlays(context)

  /** Everything the watcher needs. */
  fun watcher(context: Context): Boolean = usageAccess(context) && overlay(context)
}
