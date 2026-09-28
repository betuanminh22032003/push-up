package expo.modules.appblocker

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * What a blocked app is covered with, shared by [BlockActivity] and the
 * watcher's overlay [Cover]. It offers the two ways forward, go and earn time
 * or go home, and never a way back into the app.
 *
 * Built in code rather than in React Native so it appears instantly, even
 * when the app's JavaScript is not loaded.
 */
internal object BlockScreen {
  private const val BRAND = "HÍT ĐẤT AI"
  private const val COLOR_BG = 0xFF0A0A0B.toInt()
  private const val COLOR_SURFACE = 0xFF1C1C21.toInt()
  private const val COLOR_BORDER = 0xFF26262C.toInt()
  private const val COLOR_TEXT = 0xFFF5F5F7.toInt()
  private const val COLOR_DIM = 0xFF8A8A93.toInt()
  private const val COLOR_ACCENT = 0xFF4ADE80.toInt()

  /** [appName] is an app's name or a blocked site's domain; the icon is the app's, or the browser's. */
  fun content(
    context: Context,
    appName: String,
    iconPackage: String?,
    timeUp: Boolean,
    onEarn: () -> Unit,
    onHome: () -> Unit,
  ): View {
    val title = if (timeUp) {
      BlockerStore.label("timeUpTitle", "Time's up for {app}")
    } else {
      BlockerStore.label("blockTitle", "{app} is blocked")
    }.replace("{app}", appName)
    val body = BlockerStore.label(
      "blockBody",
      "You're out of fun time. Every push-up earns more: do a few and come back.",
    )

    val column = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(context, 32), dp(context, 56), dp(context, 32), dp(context, 40))
    }

    iconPackage?.let { Packages.appIcon(context, it) }?.let { icon ->
      column.addView(
        ImageView(context).apply {
          setImageDrawable(icon)
          contentDescription = appName
        },
        LinearLayout.LayoutParams(dp(context, 72), dp(context, 72)).apply { bottomMargin = dp(context, 20) },
      )
    }

    column.addView(label(context, BRAND, 12f, COLOR_ACCENT, bold = true, letterSpacing = 0.18f))
    column.addView(label(context, title, 26f, COLOR_TEXT, bold = true), wrap(context, top = 10))
    column.addView(label(context, body, 16f, COLOR_DIM), wrap(context, top = 12))

    column.addView(
      button(context, BlockerStore.label("earnButton", "Do push-ups now"), primary = true, onClick = onEarn),
      fill(context, top = 40),
    )
    column.addView(
      button(context, BlockerStore.label("homeButton", "Go to the home screen"), primary = false, onClick = onHome),
      fill(context, top = 12),
    )

    return ScrollView(context).apply {
      isFillViewport = true
      setBackgroundColor(COLOR_BG)
      addView(
        LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER
          addView(column, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        },
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT),
      )
    }
  }

  /** Opens the app on the workout tab (the JS side reads the request on resume). */
  fun earn(context: Context) {
    BlockerStore.requestEarn()
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      try {
        context.startActivity(launch)
      } catch (e: RuntimeException) {
        // the user can open the app themselves
      }
    }
  }

  fun goHome(context: Context) {
    val home = Intent(Intent.ACTION_MAIN)
      .addCategory(Intent.CATEGORY_HOME)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(home)
    } catch (e: RuntimeException) {
      // No home activity to start. If the blocked app shows again, it is simply blocked again.
    }
  }

  // --- view helpers -------------------------------------------------------------

  private fun label(
    context: Context,
    text: String,
    sizeSp: Float,
    color: Int,
    bold: Boolean = false,
    letterSpacing: Float = 0f,
  ) = TextView(context).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    gravity = Gravity.CENTER_HORIZONTAL
    if (bold) typeface = Typeface.DEFAULT_BOLD
    this.letterSpacing = letterSpacing
    setLineSpacing(0f, 1.15f)
  }

  private fun button(context: Context, text: String, primary: Boolean, onClick: () -> Unit) = TextView(context).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    typeface = Typeface.DEFAULT_BOLD
    gravity = Gravity.CENTER
    minHeight = dp(context, 54)
    setPadding(dp(context, 24), dp(context, 14), dp(context, 24), dp(context, 14))
    setTextColor(if (primary) COLOR_BG else COLOR_TEXT)
    background = GradientDrawable().apply {
      cornerRadius = dp(context, 27).toFloat()
      if (primary) {
        setColor(COLOR_ACCENT)
      } else {
        setColor(COLOR_SURFACE)
        setStroke(dp(context, 1), COLOR_BORDER)
      }
    }
    isClickable = true
    isFocusable = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    setOnClickListener { onClick() }
  }

  private fun wrap(context: Context, top: Int) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.WRAP_CONTENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
  ).apply {
    topMargin = dp(context, top)
    gravity = Gravity.CENTER_HORIZONTAL
  }

  private fun fill(context: Context, top: Int) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT,
  ).apply { topMargin = dp(context, top) }

  private fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
}
