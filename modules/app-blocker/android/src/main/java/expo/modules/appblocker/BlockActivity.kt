package expo.modules.appblocker

import android.annotation.TargetApi
import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/**
 * What a blocked app is covered with. It offers the two ways forward, go and
 * earn time or go home, and never a way back into the app: Back goes home too.
 *
 * Built in code rather than in React Native so it appears instantly, even
 * when the app's JavaScript is not loaded.
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
   * This screen shares its process with the service, so a crash here would
   * take blocking down with it. If it cannot be drawn, it just closes; the
   * service sees the app still in front and sends the user home instead.
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
    // An app's name, or the domain of a blocked site; the icon is the app's, or the browser's.
    val appName = intent.getStringExtra(EXTRA_LABEL).orEmpty()
    val iconPackage = intent.getStringExtra(EXTRA_ICON_PACKAGE)
    val timeUp = intent.getBooleanExtra(EXTRA_TIME_UP, false)

    val title = if (timeUp) {
      BlockerStore.label("timeUpTitle", "Time's up for {app}")
    } else {
      BlockerStore.label("blockTitle", "{app} is blocked")
    }.replace("{app}", appName)
    val body = BlockerStore.label(
      "blockBody",
      "You're out of fun time. Every push-up earns more: do a few and come back.",
    )

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(32), dp(56), dp(32), dp(40))
    }

    iconPackage?.let { Packages.appIcon(this, it) }?.let { icon ->
      column.addView(
        ImageView(this).apply {
          setImageDrawable(icon)
          contentDescription = appName
        },
        LinearLayout.LayoutParams(dp(72), dp(72)).apply { bottomMargin = dp(20) },
      )
    }

    column.addView(label(BRAND, 12f, COLOR_ACCENT, bold = true, letterSpacing = 0.18f))
    column.addView(label(title, 26f, COLOR_TEXT, bold = true), wrap(top = 10))
    column.addView(label(body, 16f, COLOR_DIM), wrap(top = 12))

    column.addView(
      button(BlockerStore.label("earnButton", "Do push-ups now"), primary = true) { earn() },
      fill(top = 40),
    )
    column.addView(
      button(BlockerStore.label("homeButton", "Go to the home screen"), primary = false) { goHome() },
      fill(top = 12),
    )

    val scroll = ScrollView(this).apply {
      isFillViewport = true
      setBackgroundColor(COLOR_BG)
      addView(
        LinearLayout(this@BlockActivity).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER
          addView(column, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        },
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT),
      )
    }
    setContentView(scroll)
  }

  /** Opens the app on the workout tab (the JS side reads the request on resume). */
  private fun earn() {
    BlockerStore.requestEarn()
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      try {
        startActivity(launch)
      } catch (e: RuntimeException) {
        // fall through to finish(); the user can open the app themselves
      }
    }
    finish()
  }

  private fun goHome() {
    val home = Intent(Intent.ACTION_MAIN)
      .addCategory(Intent.CATEGORY_HOME)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      startActivity(home)
    } catch (e: RuntimeException) {
      // No home activity to start. Finishing is all that is left; if the
      // blocked app shows again, the service simply blocks it again.
    }
    finish()
  }

  // --- view helpers -------------------------------------------------------------

  private fun label(
    text: String,
    sizeSp: Float,
    color: Int,
    bold: Boolean = false,
    letterSpacing: Float = 0f,
  ) = TextView(this).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    gravity = Gravity.CENTER_HORIZONTAL
    if (bold) typeface = Typeface.DEFAULT_BOLD
    this.letterSpacing = letterSpacing
    setLineSpacing(0f, 1.15f)
  }

  private fun button(text: String, primary: Boolean, onClick: () -> Unit) = TextView(this).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    typeface = Typeface.DEFAULT_BOLD
    gravity = Gravity.CENTER
    minHeight = dp(54)
    setPadding(dp(24), dp(14), dp(24), dp(14))
    setTextColor(if (primary) COLOR_BG else COLOR_TEXT)
    background = GradientDrawable().apply {
      cornerRadius = dp(27).toFloat()
      if (primary) {
        setColor(COLOR_ACCENT)
      } else {
        setColor(COLOR_SURFACE)
        setStroke(dp(1), COLOR_BORDER)
      }
    }
    isClickable = true
    isFocusable = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    setOnClickListener { onClick() }
  }

  private fun wrap(top: Int) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.WRAP_CONTENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
  ).apply {
    topMargin = dp(top)
    gravity = Gravity.CENTER_HORIZONTAL
  }

  private fun fill(top: Int) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
  ).apply { topMargin = dp(top) }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_LABEL = "expo.modules.appblocker.LABEL"
    const val EXTRA_ICON_PACKAGE = "expo.modules.appblocker.ICON_PACKAGE"
    const val EXTRA_TIME_UP = "expo.modules.appblocker.TIME_UP"

    private const val BRAND = "HÍT ĐẤT AI"
    private const val COLOR_BG = 0xFF0A0A0B.toInt()
    private const val COLOR_SURFACE = 0xFF1C1C21.toInt()
    private const val COLOR_BORDER = 0xFF26262C.toInt()
    private const val COLOR_TEXT = 0xFFF5F5F7.toInt()
    private const val COLOR_DIM = 0xFF8A8A93.toInt()
    private const val COLOR_ACCENT = 0xFF4ADE80.toInt()

    /** True while the block screen is in front, so the service does not stack another. */
    @Volatile
    var isVisible = false
      private set
  }
}
