package expo.modules.appblocker

import expo.modules.appblocker.ForegroundApps.Companion.KEYGUARD_SHOWN
import expo.modules.appblocker.ForegroundApps.Companion.PAUSED
import expo.modules.appblocker.ForegroundApps.Companion.RESUMED
import expo.modules.appblocker.ForegroundApps.Companion.SCREEN_NON_INTERACTIVE
import expo.modules.appblocker.ForegroundApps.Companion.STOPPED
import org.junit.Assert.assertEquals
import org.junit.Test

class ForegroundAppsTest {
  private val tiktok = "com.ss.android.ugc.trill"
  private val home = "com.android.launcher"
  private val bank = "com.vietcombank"

  private data class E(val type: Int, val pkg: String, val activity: String, val at: Long)

  private fun ForegroundApps.feed(events: List<E>) = events.forEach { onEvent(it.type, it.pkg, it.activity, it.at) }

  /** Home, then TikTok, then back home: the order Android logs it in. */
  private val openAndLeave = listOf(
    E(RESUMED, home, "Launcher", 0),
    E(PAUSED, home, "Launcher", 100),
    E(RESUMED, tiktok, "Main", 150),
    E(STOPPED, home, "Launcher", 400),
    E(PAUSED, tiktok, "Main", 5000),
    E(RESUMED, home, "Launcher", 5050),
    E(STOPPED, tiktok, "Main", 5400),
  )

  @Test
  fun `the app in front is the one with a resumed activity`() {
    val apps = ForegroundApps()
    apps.feed(openAndLeave.take(4))
    assertEquals(listOf(tiktok), apps.onScreen())
    apps.feed(openAndLeave.drop(4))
    assertEquals(listOf(home), apps.onScreen())
  }

  @Test
  fun `moving between an app's own screens keeps it in front`() {
    val apps = ForegroundApps()
    apps.feed(
      listOf(
        E(RESUMED, tiktok, "Main", 0),
        E(PAUSED, tiktok, "Main", 1000),
        E(RESUMED, tiktok, "Comments", 1050),
        E(STOPPED, tiktok, "Main", 1400),
      ),
    )
    assertEquals(listOf(tiktok), apps.onScreen())
  }

  @Test
  fun `split screen shows both apps, the latest first`() {
    val apps = ForegroundApps()
    apps.feed(listOf(E(RESUMED, tiktok, "Main", 0), E(RESUMED, bank, "Home", 2000)))
    assertEquals(listOf(bank, tiktok), apps.onScreen())
  }

  @Test
  fun `reading the same events again changes nothing`() {
    val apps = ForegroundApps()
    apps.feed(openAndLeave.take(5))
    // The next poll re-reads from the fourth event on, as the overlap does.
    apps.feed(openAndLeave.drop(3))
    assertEquals(listOf(home), apps.onScreen())
    apps.feed(openAndLeave.drop(5))
    assertEquals(listOf(home), apps.onScreen())
  }

  @Test
  fun `turning the screen off drops a resume whose pause went missing`() {
    val apps = ForegroundApps()
    apps.feed(listOf(E(RESUMED, tiktok, "Main", 0), E(SCREEN_NON_INTERACTIVE, "android", "", 9000)))
    assertEquals(emptyList<String>(), apps.onScreen())
    apps.feed(listOf(E(KEYGUARD_SHOWN, "android", "", 9100), E(RESUMED, home, "Launcher", 20_000)))
    assertEquals(listOf(home), apps.onScreen())
  }

  @Test
  fun `a pause for an activity never seen resuming is ignored`() {
    val apps = ForegroundApps()
    apps.feed(listOf(E(PAUSED, tiktok, "Main", 0), E(STOPPED, tiktok, "Main", 10)))
    assertEquals(emptyList<String>(), apps.onScreen())
  }

  @Test
  fun `events without a package are skipped`() {
    val apps = ForegroundApps()
    apps.onEvent(RESUMED, null, "Main", 0)
    apps.onEvent(RESUMED, "", "Main", 0)
    apps.onEvent(PAUSED, null, null, 5)
    assertEquals(emptyList<String>(), apps.onScreen())
  }
}
