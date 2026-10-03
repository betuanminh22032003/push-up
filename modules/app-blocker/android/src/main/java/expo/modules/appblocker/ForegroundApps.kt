package expo.modules.appblocker

/**
 * Which apps are on screen, rebuilt from Android's usage events, for the
 * [WatchService] that blocks without the accessibility service. Plain Kotlin,
 * unit-tested on the JVM.
 *
 * Android logs each activity as it is resumed, paused and stopped. An app is
 * on screen while one of its activities is resumed, and in split screen or a
 * floating window that is more than one app at a time.
 *
 * Events may be fed twice: every poll reads the last few seconds again,
 * because an event can be recorded a moment after its timestamp. That is
 * harmless as long as they come in order, since the last event for each
 * activity is what counts. Turning the screen off pauses everything, so it
 * also drops anything whose pause went missing.
 */
internal class ForegroundApps {
  /** Resumed activities: package -> activity class -> when it resumed. */
  private val resumed = HashMap<String, HashMap<String, Long>>()

  /** One event, with the type as in android.app.usage.UsageEvents.Event. */
  fun onEvent(type: Int, pkg: String?, activity: String?, at: Long) {
    when (type) {
      RESUMED -> if (!pkg.isNullOrEmpty()) resumed.getOrPut(pkg) { HashMap() }[activity.orEmpty()] = at
      PAUSED, STOPPED, DESTROYED -> {
        val activities = pkg?.let { resumed[it] } ?: return
        activities.remove(activity.orEmpty())
        if (activities.isEmpty()) resumed.remove(pkg)
      }
      SCREEN_NON_INTERACTIVE, KEYGUARD_SHOWN, DEVICE_SHUTDOWN, DEVICE_STARTUP -> clear()
    }
  }

  fun clear() = resumed.clear()

  /** Packages with an activity on screen, the most recently resumed first. */
  fun onScreen(): List<String> =
    resumed.entries
      .sortedByDescending { (_, activities) -> activities.values.maxOrNull() ?: 0L }
      .map { it.key }

  companion object {
    // UsageEvents.Event types. RESUMED and PAUSED were MOVE_TO_FOREGROUND and
    // MOVE_TO_BACKGROUND before Android 10; DESTROYED is hidden in the SDK.
    const val RESUMED = 1
    const val PAUSED = 2
    const val SCREEN_NON_INTERACTIVE = 16
    const val KEYGUARD_SHOWN = 17
    const val STOPPED = 23
    const val DESTROYED = 24
    const val DEVICE_SHUTDOWN = 26
    const val DEVICE_STARTUP = 27
  }
}
