package expo.modules.appblocker

import android.annotation.TargetApi
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import expo.modules.appblocker.BlockerEngine.Seen

/**
 * The block screen drawn as an overlay window, for [WatchService] on phones
 * that will not open [BlockActivity] from the background even with "display
 * over other apps" (some OEM builds add their own rule and drop the start
 * without a word).
 *
 * An overlay needs no activity start, so it always goes up. And while it is
 * up the app has a window on screen, which lets it start activities after
 * all: the block screen proper, which replaces it, or the home screen.
 */
internal class Cover(private val context: Context, private val overlayType: Int) {
  private var view: View? = null

  /** The target covered, while [isShowing]. */
  var key: String? = null
    private set

  val isShowing: Boolean
    get() = view != null

  /** Covers the screen for [target], then runs [onShown] once the cover is on screen. */
  fun show(target: Seen.Blocked, onShown: () -> Unit) {
    if (view != null) return
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    val root = Root(context) { leave(home = true) }
    root.addView(
      BlockScreen.content(
        context,
        appName = target.label,
        iconPackage = target.iconPackage,
        timeUp = false,
        onEarn = { leave(home = false) },
        onHome = { leave(home = true) },
      ),
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
    // Focusable, so Back comes here rather than to the app underneath. It sits
    // below the status and navigation bars, so the user is never trapped.
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.OPAQUE,
    )
    try {
      wm.addView(root, params)
    } catch (e: RuntimeException) {
      return
    }
    view = root
    key = target.key
    // Counted as visible once the system has drawn it, a frame or two later.
    root.postDelayed({ safely("cover shown") { if (view === root) onShown() } }, SHOWN_AFTER_MS)
  }

  fun hide() {
    val v = view ?: return
    view = null
    key = null
    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(v)
    } catch (e: RuntimeException) {
      // already gone
    }
  }

  /** Starts the next screen while the cover still counts as visible, then takes it down. */
  private fun leave(home: Boolean) {
    if (home) BlockScreen.goHome(context) else BlockScreen.earn(context)
    hide()
  }

  /** Takes Back, both as a key and, with predictive back, as a callback. */
  private class Root(context: Context, private val onBack: () -> Unit) : FrameLayout(context) {
    private var backCallback: Any? = null

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      if (event.keyCode != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
      if (event.action == KeyEvent.ACTION_UP) onBack()
      return true
    }

    override fun onAttachedToWindow() {
      super.onAttachedToWindow()
      if (Build.VERSION.SDK_INT >= 33) registerBack()
    }

    override fun onDetachedFromWindow() {
      if (Build.VERSION.SDK_INT >= 33) unregisterBack()
      super.onDetachedFromWindow()
    }

    @TargetApi(33)
    private fun registerBack() {
      val dispatcher = findOnBackInvokedDispatcher() ?: return
      val callback = OnBackInvokedCallback { onBack() }
      dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
      backCallback = callback
    }

    @TargetApi(33)
    private fun unregisterBack() {
      val callback = backCallback as? OnBackInvokedCallback ?: return
      findOnBackInvokedDispatcher()?.unregisterOnBackInvokedCallback(callback)
      backCallback = null
    }
  }

  private companion object {
    const val SHOWN_AFTER_MS = 300L
  }
}
