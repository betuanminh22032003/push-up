package expo.modules.appblocker

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.input.InputManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import expo.modules.appblocker.BlockerEngine.Command
import expo.modules.appblocker.BlockerEngine.Seen
import java.util.Locale

/**
 * Carries out [BlockerEngine]'s decisions for whichever watcher is looking at
 * the screen, the accessibility service or the usage-events one: spend the
 * balance while a blocked app or site is in use, with a small countdown on
 * top, and cover it with the block screen once nothing is left.
 *
 * What differs between the two is behind [Host]. Only the accessibility
 * service can press Back or close picture-in-picture, and its countdown is an
 * accessibility overlay, where the other one needs an app overlay.
 */
internal class Enforcer(private val context: Context, private val host: Host) {
  interface Host {
    /** The countdown's window type. */
    val overlayType: Int

    /** Whether this watcher is still the one blocking; delayed steps check it. */
    val inCharge: Boolean

    /** A block screen covers the app, so another is not stacked on it. */
    val blockScreenUp: Boolean
      get() = BlockActivity.isVisible

    /** Back in the app in front. */
    fun pressBack()

    /** The block screen did not come up: get the user out another way. */
    fun escalate(target: Seen.Blocked)

    /** Closes [target]'s picture-in-picture window; true if it did. */
    fun closePip(target: Seen.Blocked): Boolean
  }

  private val handler = Handler(Looper.getMainLooper())
  private val engine = BlockerEngine()

  private var lastTickAt = 0L
  private var lastSaveAt = 0L
  private var warnedLow = false
  private var lastToastAt = 0L
  private var timerView: TextView? = null

  /** A blocked app or site is in use and being paid for. */
  val metering: Boolean
    get() = engine.metering != null

  /** Acts on one look at the screen. */
  fun see(seen: Seen) {
    execute(engine.step(seen, BlockerStore.snapshot().balanceMs, host.blockScreenUp, now()))
  }

  /** About once a second: spends the time since the last tick and keeps the countdown current. */
  fun tick() {
    if (engine.metering == null) return
    val remaining = spendSinceLastTick()
    if (remaining <= 0L) {
      execute(engine.timeUp(now()))
      return
    }
    syncTimer(remaining)
    if (!warnedLow && remaining <= LOW_TIME_MS) {
      warnedLow = true
      toast(BlockerStore.label("lowTime", "Less than a minute of fun time left"))
    }
    if (now() - lastSaveAt >= SAVE_EVERY_MS) {
      lastSaveAt = now()
      BlockerStore.saveBalance()
    }
  }

  /** Stops metering and takes the countdown down: the watcher stops or hands over. */
  fun release() {
    handler.removeCallbacksAndMessages(null)
    execute(engine.step(Seen.Clear, 0L, false, now()))
    hideTimer()
  }

  private fun execute(commands: List<Command>) {
    for (command in commands) {
      when (command) {
        is Command.StartMeter -> startMeter()
        Command.StopMeter -> stopMeter()
        is Command.Block -> block(command.target, command.timeUp)
        is Command.GoBack -> {
          host.pressBack()
          blockedToast(command.target)
        }
        is Command.GoHome -> {
          host.escalate(command.target)
          blockedToast(command.target)
        }
        is Command.ClosePip -> if (host.closePip(command.target)) blockedToast(command.target)
      }
    }
  }

  private fun startMeter() {
    lastTickAt = now()
    lastSaveAt = lastTickAt
    warnedLow = false
    syncTimer(BlockerStore.snapshot().balanceMs)
  }

  private fun stopMeter() {
    spendSinceLastTick()
    hideTimer()
    BlockerStore.saveBalance()
  }

  /** Charges the time since the last tick, measured on the monotonic clock. */
  private fun spendSinceLastTick(): Long {
    val now = now()
    val spent = (now - lastTickAt).coerceAtLeast(0L)
    lastTickAt = now
    return BlockerStore.spend(spent)
  }

  private fun block(target: Seen.Blocked, timeUp: Boolean) {
    if (!target.isSite) {
      BlockActivity.show(context, target, timeUp)
      return
    }
    // Leave the page first, so reopening the browser does not land on it
    // again; the block screen follows once Back has reached the browser.
    host.pressBack()
    handler.postDelayed(
      { safely("block screen") { if (host.inCharge) BlockActivity.show(context, target, timeUp) } },
      SITE_BACK_SETTLE_MS,
    )
  }

  private fun blockedToast(target: Seen.Blocked) {
    val now = now()
    if (now - lastToastAt < TOAST_GAP_MS) return
    lastToastAt = now
    val template = BlockerStore.label("blockedToast", "{app} is blocked. Earn time with push-ups.")
    toast(template.replace("{app}", target.label))
  }

  // --- the countdown pill -----------------------------------------------------

  /** Shows, updates or hides the small countdown over the blocked app. */
  private fun syncTimer(remainingMs: Long) {
    if (!BlockerStore.snapshot().showTimer) {
      hideTimer()
      return
    }
    val view = timerView ?: addTimerView() ?: return
    view.text = "⏱ ${formatRemaining(remainingMs)}"
    val color = when {
      remainingMs <= 10_000L -> COLOR_DANGER
      remainingMs <= LOW_TIME_MS -> COLOR_WARN
      else -> COLOR_ACCENT
    }
    view.setTextColor(color)
    (view.background as? GradientDrawable)?.setStroke(dp(1), color)
  }

  private fun addTimerView(): TextView? {
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return null
    val view = TextView(context).apply {
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      typeface = Typeface.DEFAULT_BOLD
      fontFeatureSettings = "tnum"
      setPadding(dp(12), dp(6), dp(12), dp(6))
      background = GradientDrawable().apply {
        cornerRadius = dp(16).toFloat()
        setColor(COLOR_PILL_BG)
      }
    }
    // With NOT_TOUCHABLE every tap goes straight through to the app below.
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      host.overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = dp(12)
      y = statusBarHeight() + dp(6)
      // Android 12+ drops a tap that passes through another app's overlay
      // unless the overlay is see-through enough; accessibility ones are exempt.
      if (Build.VERSION.SDK_INT >= 31 && host.overlayType != WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY) {
        alpha = (context.getSystemService(Context.INPUT_SERVICE) as? InputManager)
          ?.maximumObscuringOpacityForTouch ?: 0.8f
      }
    }
    return try {
      wm.addView(view, params)
      timerView = view
      view
    } catch (e: RuntimeException) {
      null
    }
  }

  private fun hideTimer() {
    val view = timerView ?: return
    timerView = null
    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(view)
    } catch (e: RuntimeException) {
      // already gone with the window token
    }
  }

  private fun statusBarHeight(): Int {
    val res = context.resources
    val id = res.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) res.getDimensionPixelSize(id) else dp(24)
  }

  private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

  private fun toast(text: String) {
    Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
  }

  private fun now() = SystemClock.elapsedRealtime()

  companion object {
    private const val SAVE_EVERY_MS = 5_000L
    private const val LOW_TIME_MS = 60_000L
    private const val SITE_BACK_SETTLE_MS = 400L
    private const val TOAST_GAP_MS = 3_000L

    private const val COLOR_PILL_BG = 0xE60A0A0B.toInt()
    private const val COLOR_ACCENT = 0xFF4ADE80.toInt()
    private const val COLOR_WARN = 0xFFFBBF24.toInt()
    private const val COLOR_DANGER = 0xFFF87171.toInt()

    /** "12:34", or "1:02:03" past an hour; rounded up so it reads 0:00 only at zero. */
    fun formatRemaining(ms: Long): String {
      val total = (ms.coerceAtLeast(0L) + 999L) / 1000L
      val h = total / 3600L
      val m = (total % 3600L) / 60L
      val s = total % 60L
      return if (h > 0L) {
        String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s)
      } else {
        String.format(Locale.ROOT, "%d:%02d", m, s)
      }
    }
  }
}

/**
 * Every entry point of the blocker's process goes through this: an exception
 * escaping into the system would crash the process, and with it both watchers.
 */
internal inline fun safely(what: String, block: () -> Unit) {
  try {
    block()
  } catch (t: Throwable) {
    Log.w("AppBlocker", "$what failed", t)
  }
}
