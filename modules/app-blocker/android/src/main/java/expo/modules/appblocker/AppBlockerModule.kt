package expo.modules.appblocker

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS side of the blocker: settings in, state out. The blocking itself is
 * done by [BlockerService] in the ":blocker" process, which keeps working
 * while the app is closed; the state lives there too and is reached through
 * [BlockerProvider].
 *
 * Every call that touches the state is async, because it crosses processes
 * and may have to start the blocker's one, and it resolves to the fresh
 * state, so the UI renders what the blocker actually holds.
 */
class AppBlockerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AppBlocker")

    AsyncFunction("getState") {
      state(store(BlockerProvider.GET_STATE))
    }

    AsyncFunction("setEnabled") { enabled: Boolean ->
      state(store(BlockerProvider.SET_ENABLED) { putBoolean(BlockerProvider.VALUE, enabled) })
    }

    AsyncFunction("setBlockedApps") { packages: List<String> ->
      state(store(BlockerProvider.SET_BLOCKED) { putStringArrayList(BlockerProvider.VALUE, ArrayList(packages)) })
    }

    AsyncFunction("setBlockedSites") { domains: List<String> ->
      state(store(BlockerProvider.SET_SITES) { putStringArrayList(BlockerProvider.VALUE, ArrayList(domains)) })
    }

    AsyncFunction("addCredit") { seconds: Double ->
      state(store(BlockerProvider.ADD_CREDIT) { putLong(BlockerProvider.VALUE, (seconds * 1000.0).toLong()) })
    }

    AsyncFunction("setShowTimer") { show: Boolean ->
      state(store(BlockerProvider.SET_SHOW_TIMER) { putBoolean(BlockerProvider.VALUE, show) })
    }

    AsyncFunction("setLabels") { labels: Map<String, Any?> ->
      val bundle = Bundle().apply {
        for ((key, value) in labels) putString(key, value?.toString().orEmpty())
      }
      store(BlockerProvider.SET_LABELS) { putBundle(BlockerProvider.VALUE, bundle) }
      Unit
    }

    AsyncFunction("consumeEarnRequest") {
      (store(BlockerProvider.CONSUME_EARN)?.getLong(BlockerProvider.VALUE) ?: 0L).toDouble()
    }

    AsyncFunction("reset") {
      state(store(BlockerProvider.RESET))
    }

    Function("openAccessibilitySettings") {
      openSettings(accessibilitySettingsIntent())
    }

    Function("openAppSettings") {
      openSettings(appDetailsIntent())
    }

    // The list of apps under battery optimisation. Asking to be exempted
    // directly needs a permission Google Play restricts, so the user picks.
    Function("openBatterySettings") {
      openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) || openSettings(appDetailsIntent())
    }

    // Phone makers' own "auto-launch" lists; without that permission realme,
    // OPPO, Xiaomi and vivo refuse to restart the service after killing it.
    Function("openAutostartSettings") {
      AUTOSTART_SCREENS.any { (pkg, cls) -> openSettings(Intent().setComponent(ComponentName(pkg, cls))) } ||
        openSettings(appDetailsIntent())
    }

    AsyncFunction("getInstalledApps") { iconSize: Int ->
      Packages.launchableApps(context, iconSize.coerceIn(24, 256))
    }
  }

  /** One call into the blocker's process; null if it could not be reached. */
  private fun store(method: String, fill: (Bundle.() -> Unit)? = null): Bundle? {
    val extras = fill?.let { Bundle().apply(it) }
    return try {
      context.contentResolver.call(BlockerProvider.uri(context.packageName), method, null, extras)
    } catch (e: RuntimeException) {
      Log.w(TAG, "blocker process unreachable for $method", e)
      null
    }
  }

  private fun state(bundle: Bundle?): Map<String, Any?> = mapOf(
    "reachable" to (bundle != null),
    "serviceEnabled" to isServiceEnabled(),
    "serviceRunning" to (bundle?.getBoolean("serviceRunning") ?: false),
    "serviceConnectedAt" to (bundle?.getLong("serviceConnectedAt") ?: 0L).toDouble(),
    "batteryOptimized" to isBatteryOptimized(),
    "enabled" to (bundle?.getBoolean("enabled") ?: false),
    "blocked" to (bundle?.getStringArrayList("blocked") ?: arrayListOf<String>()).toList(),
    "sites" to (bundle?.getStringArrayList("sites") ?: arrayListOf<String>()).toList(),
    "balanceSeconds" to (bundle?.getLong("balanceMs") ?: 0L) / 1000.0,
    "showTimer" to (bundle?.getBoolean("showTimer", true) ?: true),
    "earnRequestedAt" to (bundle?.getLong("earnRequestedAt") ?: 0L).toDouble(),
  )

  /** Whether the user has switched the service on in the system's accessibility settings. */
  private fun isServiceEnabled(): Boolean {
    val expected = ComponentName(context, BlockerService::class.java)
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
  }

  /** Battery optimisation lets aggressive OEM builds stop the service in the background. */
  private fun isBatteryOptimized(): Boolean {
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    return !power.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun appDetailsIntent() =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))

  /**
   * The accessibility settings list. The extras highlight our entry on
   * AOSP-based Settings and are ignored elsewhere; the page that opens the
   * service directly is reserved for system apps.
   */
  private fun accessibilitySettingsIntent(): Intent {
    val component = ComponentName(context, BlockerService::class.java).flattenToString()
    val args = Bundle().apply { putString(":settings:fragment_args_key", component) }
    return Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      .putExtra(":settings:fragment_args_key", component)
      .putExtra(":settings:show_fragment_args", args)
  }

  private fun openSettings(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: ActivityNotFoundException) {
      false
    } catch (e: SecurityException) {
      false
    }
  }

  companion object {
    private const val TAG = "AppBlocker"

    /** Auto-launch screens by maker, most likely first; none are public API, so each is tried. */
    private val AUTOSTART_SCREENS = listOf(
      "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
      "com.oplus.safecenter" to "com.oplus.safecenter.permission.startup.StartupAppListActivity",
      "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
      "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
      "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
      "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
      "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      "com.asus.mobilemanager" to "com.asus.mobilemanager.autostart.AutoStartActivity",
    )
  }
}
