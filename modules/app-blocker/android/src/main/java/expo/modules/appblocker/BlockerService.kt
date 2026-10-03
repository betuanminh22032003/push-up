package expo.modules.appblocker

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import expo.modules.appblocker.BlockerEngine.Seen

/**
 * The accessibility way of blocking: looks at what is on screen and hands it
 * to [Enforcer], which spends the balance while a blocked app or site is in
 * use and covers it with the block screen once nothing is left.
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
 *
 * Many banking apps refuse to open while any accessibility service is on.
 * When the user switches this one off for them, in settings or with one tap
 * in the blocker tab ([switchOff]), [WatchService] takes over the apps (not
 * the sites), if its permissions are granted.
 */
class BlockerService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())

  private val enforcer = Enforcer(
    this,
    object : Enforcer.Host {
      // An accessibility overlay needs no "draw over other apps" permission.
      override val overlayType = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
      override val inCharge: Boolean
        get() = connected

      override fun pressBack() {
        performGlobalAction(GLOBAL_ACTION_BACK)
      }

      override fun escalate(target: Seen.Blocked) {
        performGlobalAction(GLOBAL_ACTION_HOME)
      }

      override fun closePip(target: Seen.Blocked): Boolean = closePipWindow(target)
    },
  )

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

  private val storeListener: () -> Unit = {
    handler.post {
      safely("store change") {
        scheduleEvaluate(0L)
        ensureBeat()
      }
    }
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
    BlockerStore.addListener(storeListener)

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
    instance = this
    // The usage-events watcher, if it runs, waits while this one blocks.
    WatchService.engineChanged(this)
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

  private fun shutdown() {
    if (!connected) return
    enforcer.release()
    connected = false
    isRunning = false
    if (instance === this) instance = null
    handler.removeCallbacksAndMessages(null)
    evaluatePending = false
    beatPending = false
    pipRoots.clear()
    BlockerStore.removeListener(storeListener)
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // never registered
    }
    // Switched off, often for a banking app: the usage-events watcher takes over.
    WatchService.engineChanged(this)
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
    enforcer.tick()
  }

  private fun evaluate() {
    if (!connected) return
    val state = BlockerStore.snapshot()
    enforcer.see(if (state.active && screenInUse()) look(state) else Seen.Clear)
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

  /**
   * Picture-in-picture floats above every activity, so the block screen cannot
   * cover it. The system lets accessibility services dismiss it, or failing
   * that expand it, after which it is blocked like any app.
   */
  private fun closePipWindow(target: Seen.Blocked): Boolean {
    val root = pipRoots[target.key] ?: return false
    return try {
      root.performAction(AccessibilityNodeInfo.ACTION_DISMISS) ||
        root.performAction(AccessibilityNodeInfo.ACTION_EXPAND)
    } catch (e: RuntimeException) {
      false
    }
  }

  companion object {
    private const val EVENT_SETTLE_MS = 120L
    private const val BEAT_MS = 1000L
    private const val URL_BAR_RETRY_MS = 10_000L

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

    /** The connected service, which [switchOff] reaches from the provider's thread. */
    @Volatile
    private var instance: BlockerService? = null

    /**
     * Switches the service off from the inside, as its switch in settings
     * would, for a banking app: those refuse to open while it is on, whichever
     * apps it watches. [WatchService] then takes over the apps. Android lets
     * an app switch its service off, never back on; that is up to the user.
     * False when it is still on, typically because the phone had already
     * stopped it and there was nothing connected to ask.
     */
    fun switchOff(context: Context): Boolean {
      val service = instance ?: return false
      try {
        // A binder call, so any thread will do.
        service.disableSelf()
      } catch (e: RuntimeException) {
        return false
      }
      return !Access.accessibilityEnabled(context)
    }
  }
}
