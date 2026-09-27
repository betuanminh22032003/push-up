package expo.modules.appblocker

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS side of the blocker: settings in, state out. The blocking itself is
 * done by [BlockerService], which keeps working while the app is closed.
 *
 * Every mutating call returns the fresh state, so the UI renders what the
 * native side actually holds rather than what it asked for.
 */
class AppBlockerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun store(): BlockerStore = BlockerStore.also { it.init(context) }

  override fun definition() = ModuleDefinition {
    Name("AppBlocker")

    Function("getState") {
      state()
    }

    Function("setEnabled") { enabled: Boolean ->
      store().setEnabled(enabled)
      state()
    }

    Function("setBlockedApps") { packages: List<String> ->
      store().setBlocked(packages.toSet())
      state()
    }

    Function("addCredit") { seconds: Double ->
      store().addCredit((seconds * 1000.0).toLong())
      state()
    }

    Function("setShowTimer") { show: Boolean ->
      store().setShowTimer(show)
      state()
    }

    Function("setLabels") { labels: Map<String, Any?> ->
      store().setLabels(labels.mapValues { (_, value) -> value?.toString().orEmpty() })
    }

    Function("consumeEarnRequest") {
      store().consumeEarnRequest().toDouble()
    }

    Function("reset") {
      store().reset()
      state()
    }

    Function("openAccessibilitySettings") {
      openSettings(accessibilitySettingsIntent())
    }

    Function("openAppSettings") {
      openSettings(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
      )
    }

    AsyncFunction("getInstalledApps") { iconSize: Int ->
      Packages.launchableApps(context, iconSize.coerceIn(24, 256))
    }
  }

  private fun state(): Map<String, Any?> {
    val s = store().snapshot()
    return mapOf(
      "serviceEnabled" to isServiceEnabled(),
      "serviceRunning" to BlockerService.isRunning,
      "enabled" to s.enabled,
      "blocked" to s.blocked.toList(),
      "balanceSeconds" to s.balanceMs / 1000.0,
      "showTimer" to s.showTimer,
      "earnRequestedAt" to s.earnRequestedAt.toDouble(),
    )
  }

  /** Whether the user has switched the service on in the system's accessibility settings. */
  private fun isServiceEnabled(): Boolean {
    val expected = ComponentName(context, BlockerService::class.java)
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
  }

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
}
