package expo.modules.appblocker

import android.annotation.TargetApi
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import expo.modules.appblocker.BlockerEngine.Seen

/**
 * The block screen ([BlockScreen]) as an activity of its own over a blocked
 * app. Back goes home too, never into the app.
 */
class BlockActivity : Activity() {
  private var backCallback: Any? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    BlockerStore.init(this)
    showOrLeave(intent)
    if (Build.VERSION.SDK_INT >= 33) registerBackCallback()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    showOrLeave(intent)
  }

  /**
   * This screen shares its process with the watchers, so a crash here would
   * take blocking down with it. If it cannot be drawn, it just closes; the
   * watcher sees the app still in front and escalates instead.
   */
  private fun showOrLeave(intent: Intent) {
    try {
      render(intent)
    } catch (t: Throwable) {
      Log.w("AppBlocker", "block screen failed", t)
      finish()
    }
  }

  override fun onResume() {
    super.onResume()
    isVisible = true
  }

  override fun onPause() {
    isVisible = false
    super.onPause()
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= 33) unregisterBackCallback()
    super.onDestroy()
  }

  /** Back before Android 13, and on later versions without predictive back. */
  @Deprecated("Replaced by OnBackInvokedCallback on Android 13+")
  override fun onBackPressed() {
    goHome()
  }

  /** Back with predictive back, the default for apps targeting Android 16. */
  @TargetApi(33)
  private fun registerBackCallback() {
    val callback = OnBackInvokedCallback { goHome() }
    onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
    backCallback = callback
  }

  @TargetApi(33)
  private fun unregisterBackCallback() {
    val callback = backCallback as? OnBackInvokedCallback ?: return
    onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
    backCallback = null
  }

  private fun render(intent: Intent) {
    setContentView(
      BlockScreen.content(
        this,
        appName = intent.getStringExtra(EXTRA_LABEL).orEmpty(),
        iconPackage = intent.getStringExtra(EXTRA_ICON_PACKAGE),
        timeUp = intent.getBooleanExtra(EXTRA_TIME_UP, false),
        onEarn = ::earn,
        onHome = ::goHome,
      ),
    )
  }

  private fun earn() {
    BlockScreen.earn(this)
    finish()
  }

  private fun goHome() {
    BlockScreen.goHome(this)
    finish()
  }

  companion object {
    const val EXTRA_LABEL = "expo.modules.appblocker.LABEL"
    const val EXTRA_ICON_PACKAGE = "expo.modules.appblocker.ICON_PACKAGE"
    const val EXTRA_TIME_UP = "expo.modules.appblocker.TIME_UP"

    /** True while the block screen is in front, so the watchers do not stack another. */
    @Volatile
    var isVisible = false
      private set

    /**
     * Covers [target]. NO_USER_ACTION keeps the covered app from treating this
     * as the user leaving, which is what sends video apps into
     * picture-in-picture. A start the system refuses does not always throw
     * (some OEM builds drop it quietly), so the watcher checks that it took.
     */
    internal fun show(context: Context, target: Seen.Blocked, timeUp: Boolean) {
      val intent = Intent(context, BlockActivity::class.java)
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_NO_USER_ACTION,
        )
        .putExtra(EXTRA_LABEL, target.label)
        .putExtra(EXTRA_ICON_PACKAGE, target.iconPackage)
        .putExtra(EXTRA_TIME_UP, timeUp)
      try {
        context.startActivity(intent)
      } catch (e: RuntimeException) {
        // the next look sees the app still in front and escalates
      }
    }
  }
}
