package expo.modules.appblocker

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

/**
 * Watches which app is in front. While a blocked app is open it spends the
 * earned balance second by second, and once nothing is left it covers the app
 * with the block screen.
 *
 * It is driven by window-change events. The one-second tick runs only while a
 * blocked app is actually in use, so the service costs nothing the rest of
 * the time. Screen-off and the lock screen stop the meter.
 */
class BlockerService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())

  /** The blocked app being paid for right now, or null when none is in front. */
  private var sessionPackage: String? = null
  private var lastTickAt = 0L
  private var ticksSinceSave = 0
  private var warnedLow = false

  private var lastBlockAt = 0L
  private var lastEventPackage: String? = null
  private var protectedPackages: Set<String> = emptySet()
  private var timerView: TextView? = null
  private var connected = false
  private var evaluatePending = false

  private val evaluateTask = Runnable {
    evaluatePending = false
    evaluate()
  }
  private val tickTask = Runnable { tick() }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      scheduleEvaluate(0L)
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    BlockerStore.init(this)
    protectedPackages = Packages.protectedPackages(this)
    BlockerStore.onChange = { handler.post { scheduleEvaluate(0L) } }

    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    // Protected system broadcasts only, so exporting the receiver exposes nothing.
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }

    connected = true
    isRunning = true
    scheduleEvaluate(0L)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      event.packageName?.toString()?.let { lastEventPackage = it }
    }
    scheduleEvaluate(EVENT_SETTLE_MS)
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    shutdown()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    shutdown()
    super.onDestroy()
  }

  private fun shutdown() {
    if (!connected) return
    connected = false
    isRunning = false
    endSession()
    handler.removeCallbacksAndMessages(null)
    evaluatePending = false
    BlockerStore.onChange = null
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // never registered
    }
  }

  /**
   * An app launch fires a burst of window events; checking once after the
   * burst settles is enough, because the check reads the live window state.
   */
  private fun scheduleEvaluate(delayMs: Long) {
    if (!connected) return
    if (evaluatePending) {
      if (delayMs > 0L) return
      handler.removeCallbacks(evaluateTask)
    }
    evaluatePending = true
    handler.postDelayed(evaluateTask, delayMs)
  }

  private fun evaluate() {
    if (!connected) return
    val state = BlockerStore.snapshot()
    if (!state.enabled || state.blocked.isEmpty() || !screenInUse()) {
      endSession()
      return
    }
    // Null means "can't tell right now" (the notification shade is down, a
    // window is animating): keep whatever is going on.
    val pkg = foregroundPackage() ?: return
    val blocked = pkg in state.blocked && pkg !in protectedPackages && pkg != packageName
    if (!blocked) {
      endSession()
      return
    }
    if (sessionPackage != null) {
      sessionPackage = pkg // hopping between two blocked apps is one session
      return
    }
    if (state.balanceMs > 0L) startSession(pkg) else block(pkg, timeUp = false)
  }

  private fun screenInUse(): Boolean {
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return (power?.isInteractive ?: true) && !(keyguard?.isKeyguardLocked ?: false)
  }

  /**
   * The package of the app window the user is interacting with. The keyboard,
   * the notification shade and overlays (the timer included) are other window
   * types and are skipped, so typing a comment in TikTok is still TikTok.
   */
  private fun foregroundPackage(): String? {
    val list = try {
      windows
    } catch (e: RuntimeException) {
      null
    }
    if (list.isNullOrEmpty()) {
      // The window list is unavailable (rare): fall back to the last activity
      // change, minus the system UI and the keyboard, which are never "an app".
      val pkg = lastEventPackage ?: return null
      return if (pkg == SYSTEM_UI || pkg == currentKeyboardPackage()) null else pkg
    }
    return try {
      list.firstNotNullOfOrNull { window ->
        if (window.type == AccessibilityWindowInfo.TYPE_APPLICATION && (window.isActive || window.isFocused)) {
          window.root?.packageName?.toString()?.takeIf { it.isNotEmpty() }
        } else {
          null
        }
      }
    } catch (e: RuntimeException) {
      null
    }
  }

  private fun currentKeyboardPackage(): String? =
    Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)?.substringBefore('/')

  // --- metering ---------------------------------------------------------------

  private fun startSession(pkg: String) {
    sessionPackage = pkg
    lastTickAt = SystemClock.elapsedRealtime()
    ticksSinceSave = 0
    warnedLow = false
    syncTimer(BlockerStore.snapshot().balanceMs)
    handler.removeCallbacks(tickTask)
    handler.postDelayed(tickTask, TICK_MS)
  }

  private fun tick() {
    if (sessionPackage == null) return
    evaluate() // may end the session: app left, screen off, blocker turned off
    if (sessionPackage == null) return

    val remaining = spendSinceLastTick()
    if (remaining <= 0L) {
      timeUp()
      return
    }
    syncTimer(remaining)
    if (!warnedLow && remaining <= LOW_TIME_MS) {
      warnedLow = true
      toast(BlockerStore.label("lowTime", "Less than a minute of fun time left"))
    }
    ticksSinceSave += 1
    if (ticksSinceSave >= SAVE_EVERY_TICKS) {
      ticksSinceSave = 0
      BlockerStore.saveBalance()
    }
    handler.postDelayed(tickTask, TICK_MS)
  }

  /** Charges the time since the last tick, measured on the monotonic clock. */
  private fun spendSinceLastTick(): Long {
    val now = SystemClock.elapsedRealtime()
    val spent = (now - lastTickAt).coerceAtLeast(0L)
    lastTickAt = now
    return BlockerStore.spend(spent)
  }

  private fun endSession() {
    if (sessionPackage == null) return
    spendSinceLastTick()
    sessionPackage = null
    handler.removeCallbacks(tickTask)
    hideTimer()
    BlockerStore.saveBalance()
  }

  private fun timeUp() {
    val pkg = sessionPackage ?: return
    endSession()
    block(pkg, timeUp = true)
  }

  // --- blocking ---------------------------------------------------------------

  private fun block(pkg: String, timeUp: Boolean) {
    if (BlockActivity.isVisible) return
    val now = SystemClock.elapsedRealtime()
    val sinceLast = now - lastBlockAt
    if (sinceLast < BLOCK_RETRY_MS) {
      // A block screen is already on its way. Look again once it should be
      // up, so reopening the app straight away cannot slip through.
      handler.postDelayed({ scheduleEvaluate(0L) }, BLOCK_RETRY_MS - sinceLast + 50L)
      return
    }
    lastBlockAt = now

    val intent = Intent(this, BlockActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra(BlockActivity.EXTRA_PACKAGE, pkg)
      .putExtra(BlockActivity.EXTRA_TIME_UP, timeUp)
    val started = try {
      startActivity(intent)
      true
    } catch (e: RuntimeException) {
      false
    }

    // Some OEM builds refuse background activity starts even to an
    // accessibility service. Going home still gets the user out of the app,
    // only without the explanation, so the toast carries it instead.
    handler.postDelayed({
      if (connected && !BlockActivity.isVisible && foregroundPackage() == pkg) {
        performGlobalAction(GLOBAL_ACTION_HOME)
        val template = BlockerStore.label("blockedToast", "{app} is blocked. Earn time with push-ups.")
        toast(template.replace("{app}", Packages.appLabel(this, pkg)))
      }
    }, if (started) BLOCK_FALLBACK_MS else 0L)
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
    val wm = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return null
    val view = TextView(this).apply {
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      typeface = Typeface.DEFAULT_BOLD
      fontFeatureSettings = "tnum"
      setPadding(dp(12), dp(6), dp(12), dp(6))
      background = GradientDrawable().apply {
        cornerRadius = dp(16).toFloat()
        setColor(COLOR_PILL_BG)
      }
    }
    // An accessibility overlay needs no "draw over other apps" permission, and
    // with NOT_TOUCHABLE every tap goes straight through to the app below.
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = dp(12)
      y = statusBarHeight() + dp(6)
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
      (getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(view)
    } catch (e: RuntimeException) {
      // already gone with the window token
    }
  }

  private fun statusBarHeight(): Int {
    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) resources.getDimensionPixelSize(id) else dp(24)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun toast(text: String) {
    Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
  }

  companion object {
    private const val SYSTEM_UI = "com.android.systemui"
    private const val EVENT_SETTLE_MS = 120L
    private const val TICK_MS = 1000L
    private const val SAVE_EVERY_TICKS = 5
    private const val LOW_TIME_MS = 60_000L
    private const val BLOCK_RETRY_MS = 800L
    private const val BLOCK_FALLBACK_MS = 900L

    private const val COLOR_PILL_BG = 0xE60A0A0B.toInt()
    private const val COLOR_ACCENT = 0xFF4ADE80.toInt()
    private const val COLOR_WARN = 0xFFFBBF24.toInt()
    private const val COLOR_DANGER = 0xFFF87171.toInt()

    /** Whether the system has the service bound right now. */
    @Volatile
    var isRunning = false
      private set

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
