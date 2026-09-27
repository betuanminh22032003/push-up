package expo.modules.appblocker

import expo.modules.appblocker.BlockerEngine.Command
import expo.modules.appblocker.BlockerEngine.Seen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockerEngineTest {
  private val tiktok = Seen.Blocked("com.ss.android.ugc.trill", "TikTok", "com.ss.android.ugc.trill")
  private val youtube = Seen.Blocked("com.google.android.youtube", "YouTube", "com.google.android.youtube")
  private val site = Seen.Blocked("site:tiktok.com", "tiktok.com", "com.android.chrome", isSite = true)

  @Test
  fun `opening a blocked app with no time left shows the block screen once`() {
    val engine = BlockerEngine()
    assertEquals(listOf(Command.Block(tiktok, timeUp = false)), engine.step(tiktok, 0, false, 0))
    // Seen again before the block screen could appear: wait, do not stack another.
    assertEquals(emptyList<Command>(), engine.step(tiktok, 0, false, 500))
    assertEquals(emptyList<Command>(), engine.step(tiktok, 0, true, 900))
  }

  @Test
  fun `a block screen that never appears is escalated to the home screen`() {
    val engine = BlockerEngine()
    engine.step(tiktok, 0, false, 0)
    assertEquals(listOf(Command.GoHome(tiktok)), engine.step(tiktok, 0, false, 1600))
    // And again if even that did not get the user out.
    assertEquals(emptyList<Command>(), engine.step(tiktok, 0, false, 2000))
    assertEquals(listOf(Command.GoHome(tiktok)), engine.step(tiktok, 0, false, 3200))
  }

  @Test
  fun `a blocked site is pressed back twice before going home`() {
    val engine = BlockerEngine()
    assertEquals(listOf(Command.Block(site, timeUp = false)), engine.step(site, 0, false, 0))
    assertEquals(listOf(Command.GoBack(site)), engine.step(site, 0, false, 1600))
    assertEquals(listOf(Command.GoBack(site)), engine.step(site, 0, false, 3200))
    assertEquals(listOf(Command.GoHome(site)), engine.step(site, 0, false, 4800))
  }

  @Test
  fun `leaving the app resets the attempt, so the next visit is blocked afresh`() {
    val engine = BlockerEngine()
    engine.step(tiktok, 0, false, 0)
    assertEquals(emptyList<Command>(), engine.step(Seen.Clear, 0, false, 5000))
    assertEquals(listOf(Command.Block(tiktok, timeUp = false)), engine.step(tiktok, 0, false, 9000))
  }

  @Test
  fun `an unclear look changes nothing`() {
    val engine = BlockerEngine()
    engine.step(tiktok, 60_000, false, 0)
    assertEquals(emptyList<Command>(), engine.step(Seen.Unknown, 60_000, false, 1000))
    assertEquals(tiktok, engine.metering)
  }

  @Test
  fun `time left meters instead of blocking, and hopping apps is one session`() {
    val engine = BlockerEngine()
    assertEquals(listOf(Command.StartMeter(tiktok)), engine.step(tiktok, 60_000, false, 0))
    assertEquals(emptyList<Command>(), engine.step(tiktok, 59_000, false, 1000))
    assertEquals(emptyList<Command>(), engine.step(youtube, 58_000, false, 2000))
    assertEquals(youtube, engine.metering)
    assertEquals(listOf(Command.StopMeter), engine.step(Seen.Clear, 58_000, false, 3000))
    assertNull(engine.metering)
  }

  @Test
  fun `running out mid-use blocks with the time-up screen, then waits for it`() {
    val engine = BlockerEngine()
    engine.step(tiktok, 1_000, false, 0)
    assertEquals(listOf(Command.StopMeter, Command.Block(tiktok, timeUp = true)), engine.timeUp(1000))
    assertNull(engine.metering)
    assertEquals(emptyList<Command>(), engine.step(tiktok, 0, false, 1500))
    assertEquals(listOf(Command.GoHome(tiktok)), engine.step(tiktok, 0, false, 2600))
  }

  @Test
  fun `a balance emptied elsewhere stops the meter and blocks`() {
    val engine = BlockerEngine()
    engine.step(tiktok, 30_000, false, 0)
    assertEquals(
      listOf(Command.StopMeter, Command.Block(tiktok, timeUp = false)),
      engine.step(tiktok, 0, false, 1000),
    )
  }

  @Test
  fun `picture-in-picture is closed, since no screen can cover it`() {
    val engine = BlockerEngine()
    val pip = youtube.copy(inPip = true)
    assertEquals(listOf(Command.ClosePip(pip)), engine.step(pip, 0, true, 0))
  }

  @Test
  fun `running out while watching in picture-in-picture closes it`() {
    val engine = BlockerEngine()
    val pip = youtube.copy(inPip = true)
    assertEquals(listOf(Command.StartMeter(pip)), engine.step(pip, 60_000, false, 0))
    assertEquals(listOf(Command.StopMeter, Command.ClosePip(pip)), engine.timeUp(1000))
  }

  @Test
  fun `time-up without a session does nothing`() {
    assertTrue(BlockerEngine().timeUp(0).isEmpty())
  }
}
