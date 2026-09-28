package expo.modules.appblocker

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.view.WindowManager
import expo.modules.appblocker.BlockerEngine.Seen

/**
 * Blocks apps without the accessibility service, so banking apps keep
 * working: VCB, BIDV, VietinBank, Agribank and others refuse to open while
 * any app has an accessibility service switched on.
 *
 * It learns which apps are on screen from Android's usage events ("usage
 * access"), twice a second while the screen is on, and hands that to the same
 * [Enforcer] as [BlockerService]. Opening the block screen from the background
 * takes "display over other apps", which also carries the countdown; a
 * foreground service keeps it running, and its notification says so.
 *
 * What it cannot do: read a browser's address bar, so websites are blocked
 * only by the accessibility service, and dismiss picture-in-picture. While
 * that service runs, it blocks and this one waits, ready to take over the
 * moment it is switched off.
 */
class WatchService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val apps = ForegroundApps()
  private val appLabels = HashMap<String, String>()
  private val cover = Cover(this, OVERLAY_TYPE)

  private var usageStats: UsageStatsManager? = null
  private var protectedPackages: Set<String> = emptySet()

  /** Wall-clock time up to which the usage events have been read. */
  private var readUntil = 0L

  /** Nothing before this is read again: the screen went off then, which paused every app. */
  private var readFloor = 0L

  private var lastAccessCheckAt = 0L
  private var foreground = false
  private var watching = false
  private var pollPending = false
  private var shownNotice: Notice? = null

  private val enforcer = Enforcer(
    this,
    object : Enforcer.Host {
      override val overlayType = OVERLAY_TYPE
      override val inCharge: Boolean
        get() = watching
      override val blockScreenUp: Boolean
        get() = BlockActivity.isVisible || cover.isShowing

      // Only a site is left with Back, and this watcher cannot see sites.
      override fun pressBack() = Unit

      /**
       * The block screen did not come up: the phone drops activity starts
       * from the background. The cover is an overlay, so it goes up anyway,
       * and once it is on screen the block screen can be opened after all.
       */
      override fun escalate(target: Seen.Blocked) {
        cover.show(target) { if (watching) BlockActivity.show(this@WatchService, target, timeUp = false) }
      }

      override fun closePip(target: Seen.Blocked) = false
    },
  )

  private val pollTask = Runnable {
    pollPending = false
    safely("poll") { poll() }
    safely("reschedule") { schedulePoll(POLL_MS) } // even if the poll failed, keep polling
  }

  private val storeListener: () -> Unit = {
    handler.post { safely("store change") { refresh() } }
  }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      safely("screen change") {
        if (intent.action == Intent.ACTION_SCREEN_OFF) {
          apps.clear()
          readFloor = System.currentTimeMillis()
        }
        refresh()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    safely("create") { create() }
  }

  private fun create() {
    BlockerStore.init(this)
    usageStats = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    protectedPackages = try {
      Packages.protectedPackages(this)
    } catch (e: RuntimeException) {
      setOf(packageName, "com.android.systemui", "com.android.settings")
    }
    BlockerStore.addListener(storeListener)
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    // Protected system broadcasts only, so exporting the receiver exposes nothing.
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        registerReceiver(screenReceiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        registerReceiver(screenReceiver, filter)
      }
    } catch (e: RuntimeException) {
      // keep going; the store and the engine hand-over still refresh it
    }
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Every start has to be answered with startForeground within seconds, or
    // the system crashes the process, and the accessibility service lives there too.
    try {
      goForeground()
    } catch (t: Throwable) {
      // A restart the system will not let into the foreground, typically with
      // battery optimisation on. Opening the app starts it again.
      Log.w(TAG, "could not go foreground", t)
      stopSelf()
      return START_NOT_STICKY
    }
    foreground = true
    // Only now may sync() stop it: stopping it before startForeground() is a crash too.
    isRunning = true
    safely("start") { refresh() }
    return START_STICKY
  }

  override fun onDestroy() {
    safely("destroy") { shutdown() }
    super.onDestroy()
  }

  private fun shutdown() {
    watching = false
    handler.removeCallbacksAndMessages(null)
    pollPending = false
    cover.hide()
    enforcer.release()
    BlockerStore.removeListener(storeListener)
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // never registered
    }
    if (instance === this) instance = null
    isRunning = false
  }

  /**
   * After any change: keep running only while wanted, and watch only while in
   * charge (the accessibility service is not running) and the screen is in use.
   */
  private fun refresh() {
    // Stopping before startForeground() would crash the process: wait for onStartCommand.
    if (!foreground) return
    if (!wanted(this)) {
      stopSelf()
      return
    }
    updateNotice()
    val watch = shouldWatch()
    when {
      watch && !watching -> {
        watching = true
        schedulePoll(0L)
      }
      !watch && watching -> {
        watching = false
        handler.removeCallbacks(pollTask)
        pollPending = false
        cover.hide()
        enforcer.release()
      }
      watch -> schedulePoll(0L) // something changed: look now
    }
  }

  private fun shouldWatch(): Boolean {
    val s = BlockerStore.snapshot()
    return s.enabled && s.blocked.isNotEmpty() && !BlockerService.isRunning && screenInUse()
  }

  private fun schedulePoll(delayMs: Long) {
    if (!watching) return
    if (pollPending) {
      if (delayMs > 0L) return
      handler.removeCallbacks(pollTask)
    }
    pollPending = true
    handler.postDelayed(pollTask, delayMs)
  }

  private fun poll() {
    if (!watching) return
    if (!shouldWatch()) {
      refresh()
      return
    }
    val now = SystemClock.elapsedRealtime()
    if (now - lastAccessCheckAt >= ACCESS_CHECK_MS) {
      lastAccessCheckAt = now
      // Withdrawn in settings: there is nothing left to watch with.
      if (!Access.watcher(this)) {
        stopSelf()
        return
      }
    }
    val seen = look(BlockerStore.snapshot())
    // The cover gives way to the block screen proper, or goes once its app has left.
    val left = seen == Seen.Clear || (seen is Seen.Blocked && seen.key != cover.key)
    if (cover.isShowing && (BlockActivity.isVisible || left)) cover.hide()
    enforcer.see(seen)
    enforcer.tick()
  }

  private fun screenInUse(): Boolean {
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return (power?.isInteractive ?: true) && !(keyguard?.isKeyguardLocked ?: false)
  }

  // --- looking ------------------------------------------------------------------

  /** A blocked app on screen, the most recently opened one if there are several. */
  private fun look(state: BlockerStore.Snapshot): Seen {
    if (!readEvents()) return Seen.Unknown
    val pkg = apps.onScreen().firstOrNull { isBlockedApp(it, state) } ?: return Seen.Clear
    return Seen.Blocked(pkg, labelOf(pkg), pkg)
  }

  /**
   * Reads the usage events since the last look into [apps]; false when they
   * could not be read. Each read starts a few seconds back, since an event can
   * be recorded a moment after its timestamp.
   */
  private fun readEvents(): Boolean {
    val usm = usageStats ?: return false
    val now = System.currentTimeMillis()
    val clockMovedBack = readUntil != 0L && now < readUntil - OVERLAP_MS
    var from = readUntil - OVERLAP_MS
    // The first look, a long pause, or a clock set back: start again from the
    // last few hours, which covers an app opened long before a restart.
    if (readUntil == 0L || clockMovedBack || now - readUntil > LOOK_BACK_MS) {
      apps.clear()
      if (clockMovedBack) readFloor = 0L
      from = now - LOOK_BACK_MS
    }
    // Nothing from before the screen last went off, or before the phone booted.
    from = maxOf(from, readFloor, now - SystemClock.elapsedRealtime())
    val event = UsageEvents.Event()
    try {
      // In slices, so a long look back never makes one oversized reply.
      while (from < now) {
        val to = minOf(from + SLICE_MS, now)
        val events = usm.queryEvents(from, to) ?: return false
        while (events.hasNextEvent() && events.getNextEvent(event)) {
          apps.onEvent(event.eventType, event.packageName, event.className, event.timeStamp)
        }
        from = to
      }
    } catch (e: RuntimeException) {
      return false
    }
    readUntil = now
    return true
  }

  private fun isBlockedApp(pkg: String, state: BlockerStore.Snapshot): Boolean =
    pkg in state.blocked && pkg !in protectedPackages && pkg != packageName

  private fun labelOf(pkg: String): String = appLabels.getOrPut(pkg) { Packages.appLabel(this, pkg) }

  // --- the notification ---------------------------------------------------------

  private fun goForeground() {
    BlockerStore.init(this)
    val notification = notice()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  /** The notification's copy, in the app's language. */
  private data class Notice(val title: String, val body: String, val channel: String)

  private fun noticeCopy() = Notice(
    BlockerStore.label("watchTitle", "Blocking apps"),
    BlockerStore.label("watchBody", "Do push-ups to earn fun time."),
    BlockerStore.label("watchChannel", "App blocker"),
  )

  /** Re-posts the notification when its copy changed, for instance with the app's language. */
  private fun updateNotice() {
    if (noticeCopy() == shownNotice) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    nm.notify(NOTIFICATION_ID, notice())
  }

  private fun notice(): Notification {
    val copy = noticeCopy()
    if (Build.VERSION.SDK_INT >= 26) {
      // Quiet: no sound, no badge. Creating it again only renames it.
      val channel = NotificationChannel(CHANNEL_ID, copy.channel, NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
      }
      (getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.createNotificationChannel(channel)
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }
    shownNotice = copy
    return builder
      .setSmallIcon(R.drawable.app_blocker_notification)
      .setContentTitle(copy.title)
      .setContentText(copy.body)
      .setContentIntent(open)
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  companion object {
    private const val TAG = "AppBlocker"
    private const val CHANNEL_ID = "app_blocker"
    private const val NOTIFICATION_ID = 7301
    private const val POLL_MS = 500L
    private const val ACCESS_CHECK_MS = 10_000L
    private const val OVERLAP_MS = 3_000L
    private const val LOOK_BACK_MS = 6L * 60 * 60 * 1000
    private const val SLICE_MS = 30L * 60 * 1000

    private val OVERLAY_TYPE = if (Build.VERSION.SDK_INT >= 26) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    /** Whether the service is running, in the foreground, in this process (the ":blocker" one). */
    @Volatile
    var isRunning = false
      private set

    /** The running instance; main thread only. */
    private var instance: WatchService? = null

    /** Wanted: blocking on, apps to block, and both of its permissions granted. */
    fun wanted(context: Context): Boolean {
      val s = BlockerStore.snapshot()
      return s.enabled && s.blocked.isNotEmpty() && Access.watcher(context)
    }

    /**
     * Starts or stops the service to match [wanted]. Called in the ":blocker"
     * process whenever the app talks to the blocker (it is in the foreground
     * then, so the start is allowed), after a reboot or an update, and when
     * the accessibility service goes away.
     */
    fun sync(context: Context) {
      safely("sync") {
        BlockerStore.init(context)
        val want = wanted(context)
        if (want == isRunning) return@safely
        val intent = Intent(context, WatchService::class.java)
        if (!want) {
          context.stopService(intent)
        } else if (Build.VERSION.SDK_INT >= 26) {
          // Refused from the background unless battery optimisation is off for the app.
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      }
    }

    /** The accessibility service came or went: this one waits, takes over, or is started. */
    fun engineChanged(context: Context) {
      val running = instance
      if (running != null) {
        running.handler.post { safely("engine change") { running.refresh() } }
      } else {
        sync(context)
      }
    }
  }
}
