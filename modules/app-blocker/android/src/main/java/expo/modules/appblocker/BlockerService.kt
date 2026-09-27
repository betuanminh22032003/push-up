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
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.TextView
import android.widget.Toast
import expo.modules.appblocker.BlockerEngine.Command
import expo.modules.appblocker.BlockerEngine.Seen
import java.util.Locale

/**
 * Looks at what is on screen and carries out [BlockerEngine]'s decisions:
 * spend the balance while a blocked app or site is in use, cover it with the
 * block screen once nothing is left.
 *
 * It looks on two triggers, because either one alone misses things. Window
 * events give a fast reaction. A heartbeat every second, while the screen is on
 * and blocking is set up, makes it dependable: a look taken while an app is
 * still launching (no content yet, focus not moved) would otherwise be the last
 * look, and the app would stay usable.
 *
 * Every app window on screen counts, not only the focused one, so split
 * screen, floating windows and picture-in-picture cannot slip past. In a
 * browser the address bar is read, so a blocked app's website is blocked too.
 */
class BlockerService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private val engine = BlockerEngine()

  private var lastTickAt = 0L
  private var ticksSinceSave = 0
  private var warnedLow = false
  private var lastToastAt = 0L

  private var lastEventPackage: String? = null
  private var protectedPackages: Set<String> = emptySet()
  private var browsers: Set<String> = emptySet()
  private val appLabels = HashMap<String, String>()

  /** The address-bar view id that worked, per browser. */
  private val urlBarIds = HashMap<String, String>()

  /** When a browser's address bar could not be found, so it is not searched every second. */
  private val urlBarMissAt = HashMap<String, Long>()

  /** The last host each browser showed: its address bar hides while a page scrolls. */
  private val lastHosts = HashMap<String, String>()

  /** Picture-in-picture windows seen in the last look, to close on a block. */
  private val pipRoots = HashMap<String, AccessibilityNodeInfo>()

  private var timerView: TextView? = null
  private var connected = false
  private var evaluatePending = false
  private var beatPending = false

  // Every entry point is wrapped: an exception escaping into the system would
  // crash the process, and a crashed accessibility service stays down.
  private val evaluateTask = Runnable {
    evaluatePending = false
    safely("evaluate") { evaluate() }
  }
  private val beatTask = Runnable {
    beatPending = false
    safely("beat") { beat() }
    safely("reschedule") { ensureBeat() } // even if the beat failed, keep beating
  }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      safely("screen change") {
        scheduleEvaluate(0L)
        ensureBeat()
      }
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    safely("connect") { connect() }
  }

  private fun connect() {
    BlockerStore.init(this)
    BlockerStore.markServiceConnected()
    // A crash here would get the service marked as broken until the user
    // switches it off and on again, so the lookups fall back instead of throwing.
    protectedPackages = try {
      Packages.protectedPackages(this)
    } catch (e: RuntimeException) {
      setOf(packageName, "com.android.systemui", "com.android.settings")
    }
    browsers = try {
      Packages.browsers(this)
    } catch (e: RuntimeException) {
      emptySet()
    } + KNOWN_BROWSERS - protectedPackages
    BlockerStore.onChange = {
      handler.post {
        safely("store change") {
          scheduleEvaluate(0L)
          ensureBeat()
        }
      }
    }

    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    // Protected system broadcasts only, so exporting the receiver exposes nothing.
    // Without them, the first window event after unlocking restarts the heartbeat.
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        registerReceiver(screenReceiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        registerReceiver(screenReceiver, filter)
      }
    } catch (e: RuntimeException) {
      // keep going without screen broadcasts
    }

    connected = true
    isRunning = true
    scheduleEvaluate(0L)
    ensureBeat()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    safely("event") {
      if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        event.packageName?.toString()?.let { lastEventPackage = it }
      }
      scheduleEvaluate(EVENT_SETTLE_MS)
      ensureBeat()
    }
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    safely("unbind") { shutdown() }
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    safely("destroy") { shutdown() }
    super.onDestroy()
  }

  private inline fun safely(what: String, block: () -> Unit) {
    try {
      block()
    } catch (t: Throwable) {
      Log.w(TAG, "$what failed", t)
    }
  }

  private fun shutdown() {
    if (!connected) return
    execute(engine.step(Seen.Clear, 0L, false, SystemClock.elapsedRealtime()))
    connected = false
    isRunning = false
    handler.removeCallbacksAndMessages(null)
    evaluatePending = false
    beatPending = false
    pipRoots.clear()
    BlockerStore.onChange = null
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // never registered
    }
  }

  /** A burst of window events (an app launching) is looked at once, after it settles. */
  private fun scheduleEvaluate(delayMs: Long) {
    if (!connected) return
    if (evaluatePending) {
      if (delayMs > 0L) return
      handler.removeCallbacks(evaluateTask)
    }
    evaluatePending = true
    handler.postDelayed(evaluateTask, delayMs)
  }

  /** Keeps the heartbeat going while the screen is on and blocking is set up. */
  private fun ensureBeat() {
    if (beatPending || !connected) return
    if (!BlockerStore.snapshot().active || !screenInUse()) return
    beatPending = true
    handler.postDelayed(beatTask, BEAT_MS)
  }

  private fun beat() {
    if (!connected) return
    evaluate()
    if (engine.metering != null) {
      val remaining = spendSinceLastTick()
      if (remaining <= 0L) {
        execute(engine.timeUp(SystemClock.elapsedRealtime()))
      } else {
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
      }
    }
  }

  private fun evaluate() {
    if (!connected) return
    val state = BlockerStore.snapshot()
    val seen = if (state.active && screenInUse()) look(state) else Seen.Clear
    execute(engine.step(seen, state.balanceMs, BlockActivity.isVisible, SystemClock.elapsedRealtime()))
  }

  private fun screenInUse(): Boolean {
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return (power?.isInteractive ?: true) && !(keyguard?.isKeyguardLocked ?: false)
  }

  // --- looking ------------------------------------------------------------------

  /**
   * Whether a blocked app or site is on screen. App windows only: the
   * keyboard, the notification shade and overlays (the countdown included) are
   * other window types, so typing a comment in TikTok is still TikTok.
   */
  private fun look(state: BlockerStore.Snapshot): Seen {
    pipRoots.clear()
    val all = try {
      windows
    } catch (e: RuntimeException) {
      null
    }
    if (all.isNullOrEmpty()) return fromLastEvent(state) ?: Seen.Unknown

    return try {
      val apps = all.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
      val (inUse, others) = apps.partition { it.isActive || it.isFocused }
      var inUseUnreadable = false
      for (window in inUse + others) {
        val active = window.isActive || window.isFocused
        val root = window.root
        val pkg = root?.packageName?.toString()
        if (root == null || pkg.isNullOrEmpty()) {
          if (active) inUseUnreadable = true
          continue
        }
        if (isBlockedApp(pkg, state)) {
          val pip = Build.VERSION.SDK_INT >= 26 && window.isInPictureInPictureMode
          if (pip) pipRoots[pkg] = root
          return Seen.Blocked(pkg, labelOf(pkg), pkg, inPip = pip)
        }
        if (active && state.sites.isNotEmpty() && pkg in browsers) {
          val domain = blockedDomain(pkg, root, state.sites)
          if (domain != null) return Seen.Blocked("site:$domain", domain, pkg, isSite = true)
        }
      }
      // The window in use has no content yet, typically an app still launching.
      // The activity change that announced it names its package: go by that,
      // and the next heartbeat looks again anyway.
      if (inUseUnreadable) fromLastEvent(state) ?: Seen.Unknown else Seen.Clear
    } catch (e: RuntimeException) {
      Seen.Unknown
    }
  }

  private fun fromLastEvent(state: BlockerStore.Snapshot): Seen? {
    val pkg = lastEventPackage ?: return null
    return if (isBlockedApp(pkg, state)) Seen.Blocked(pkg, labelOf(pkg), pkg) else null
  }

  private fun isBlockedApp(pkg: String, state: BlockerStore.Snapshot): Boolean =
    pkg in state.blocked && pkg !in protectedPackages && pkg != packageName

  private fun labelOf(pkg: String): String = appLabels.getOrPut(pkg) { Packages.appLabel(this, pkg) }

  /** The blocked domain the browser is showing, if any. */
  private fun blockedDomain(browser: String, root: AccessibilityNodeInfo, sites: Set<String>): String? {
    val read = addressBarHost(browser, root)
    val host = when {
      read == null -> lastHosts[browser] // bar hidden or not found: the page has not changed
      read.isEmpty() -> null // a new tab or a search
      else -> read
    } ?: return null
    return Sites.matchingDomain(host, sites)
  }

  /**
   * The host in [browser]'s address bar: null when the bar cannot be read
   * right now, "" when it shows no site (a new tab, a search query).
   */
  private fun addressBarHost(browser: String, root: AccessibilityNodeInfo): String? {
    val now = SystemClock.elapsedRealtime()
    val known = urlBarIds[browser]
    val missedAt = urlBarMissAt[browser]
    if (known == null && missedAt != null && now - missedAt < URL_BAR_RETRY_MS) return null

    val candidates = LinkedHashSet<String>()
    known?.let { candidates += it }
    KNOWN_URL_BARS[browser]?.let { candidates += it }
    GENERIC_URL_BARS.forEach { candidates += "$browser:id/$it" }

    for (id in candidates) {
      val node = root.findAccessibilityNodeInfosByViewId(id)?.firstOrNull() ?: continue
      urlBarIds[browser] = id
      urlBarMissAt.remove(browser)
      // Being typed in: the page on screen is still the previous one.
      if (node.isFocused) return lastHosts[browser]
      val showingHint = Build.VERSION.SDK_INT >= 26 && node.isShowingHintText
      val host = if (showingHint) null else node.text?.toString()?.let(Sites::hostOf)
      if (host == null) {
        lastHosts.remove(browser)
        return ""
      }
      lastHosts[browser] = host
      return host
    }
    if (known == null) urlBarMissAt[browser] = now
    return null
  }

  // --- acting ---------------------------------------------------------------------

  private fun execute(commands: List<Command>) {
    for (command in commands) {
      when (command) {
        is Command.StartMeter -> startMeter()
        Command.StopMeter -> stopMeter()
        is Command.Block -> block(command.target, command.timeUp)
        is Command.GoBack -> {
          performGlobalAction(GLOBAL_ACTION_BACK)
          blockedToast(command.target)
        }
        is Command.GoHome -> {
          performGlobalAction(GLOBAL_ACTION_HOME)
          blockedToast(command.target)
        }
        is Command.ClosePip -> closePip(command.target)
      }
    }
  }

  private fun startMeter() {
    lastTickAt = SystemClock.elapsedRealtime()
    ticksSinceSave = 0
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
    val now = SystemClock.elapsedRealtime()
    val spent = (now - lastTickAt).coerceAtLeast(0L)
    lastTickAt = now
    return BlockerStore.spend(spent)
  }

  private fun block(target: Seen.Blocked, timeUp: Boolean) {
    if (!target.isSite) {
      showBlockScreen(target, timeUp)
      return
    }
    // Leave the page first, so reopening the browser does not land on it
    // again; the block screen follows once Back has reached the browser.
    performGlobalAction(GLOBAL_ACTION_BACK)
    handler.postDelayed(
      { safely("block screen") { if (connected) showBlockScreen(target, timeUp) } },
      SITE_BACK_SETTLE_MS,
    )
  }

  /**
   * NO_USER_ACTION keeps the covered app from treating this as the user
   * leaving, which is what sends video apps into picture-in-picture. If the
   * start is refused (some OEM builds restrict it), the heartbeat escalates.
   */
  private fun showBlockScreen(target: Seen.Blocked, timeUp: Boolean) {
    val intent = Intent(this, BlockActivity::class.java)
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_NO_USER_ACTION,
      )
      .putExtra(BlockActivity.EXTRA_LABEL, target.label)
      .putExtra(BlockActivity.EXTRA_ICON_PACKAGE, target.iconPackage)
      .putExtra(BlockActivity.EXTRA_TIME_UP, timeUp)
    try {
      startActivity(intent)
    } catch (e: RuntimeException) {
      // the next heartbeat sees the app still in front and escalates
    }
  }

  /**
   * Picture-in-picture floats above every activity, so the block screen cannot
   * cover it. The system lets accessibility services dismiss it, or failing
   * that expand it, after which it is blocked like any app.
   */
  private fun closePip(target: Seen.Blocked) {
    val root = pipRoots[target.key]
    val done = try {
      root != null && (
        root.performAction(AccessibilityNodeInfo.ACTION_DISMISS) ||
          root.performAction(AccessibilityNodeInfo.ACTION_EXPAND)
        )
    } catch (e: RuntimeException) {
      false
    }
    if (done) blockedToast(target)
  }

  private fun blockedToast(target: Seen.Blocked) {
    val now = SystemClock.elapsedRealtime()
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
    private const val TAG = "AppBlocker"
    private const val EVENT_SETTLE_MS = 120L
    private const val BEAT_MS = 1000L
    private const val SAVE_EVERY_TICKS = 5
    private const val LOW_TIME_MS = 60_000L
    private const val SITE_BACK_SETTLE_MS = 400L
    private const val URL_BAR_RETRY_MS = 10_000L
    private const val TOAST_GAP_MS = 3_000L

    private const val COLOR_PILL_BG = 0xE60A0A0B.toInt()
    private const val COLOR_ACCENT = 0xFF4ADE80.toInt()
    private const val COLOR_WARN = 0xFFFBBF24.toInt()
    private const val COLOR_DANGER = 0xFFF87171.toInt()

    /** Browsers that may not answer the generic web-link query. */
    private val KNOWN_BROWSERS = setOf(
      "com.android.chrome",
      "com.chrome.beta",
      "com.chrome.dev",
      "com.chrome.canary",
      "com.microsoft.emmx",
      "com.brave.browser",
      "com.coccoc.trinhduyet",
      "com.vivaldi.browser",
      "com.kiwibrowser.browser",
      "com.opera.browser",
      "com.opera.mini.native",
      "com.sec.android.app.sbrowser",
      "org.mozilla.firefox",
      "com.duckduckgo.mobile.android",
      "com.heytap.browser",
      "com.android.browser",
      "com.mi.globalbrowser",
    )

    /** Address bars that do not follow the Chromium "<package>:id/url_bar" naming. */
    private val KNOWN_URL_BARS = mapOf(
      "com.sec.android.app.sbrowser" to listOf("com.sec.android.app.sbrowser:id/location_bar_edit_text"),
      "com.opera.browser" to listOf("com.opera.browser:id/url_field"),
      "com.opera.mini.native" to listOf("com.opera.mini.native:id/url_field"),
      "org.mozilla.firefox" to listOf("org.mozilla.firefox:id/mozac_browser_toolbar_url_view"),
      "com.duckduckgo.mobile.android" to listOf("com.duckduckgo.mobile.android:id/omnibarTextInput"),
    )

    /** Tried in any browser, most common first. */
    private val GENERIC_URL_BARS = listOf(
      "url_bar",
      "url_field",
      "location_bar_edit_text",
      "mozac_browser_toolbar_url_view",
      "url_edit_text",
      "address_bar_edit_text",
    )

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
