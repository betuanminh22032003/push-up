package expo.modules.appblocker

/**
 * What the blocker decides, given what is on screen and how much time is left.
 * Plain Kotlin with no Android in it, so every rule is unit-tested on the JVM;
 * [BlockerService] only observes the screen and carries out the commands.
 *
 * Nothing here trusts a single observation. The service looks again every
 * second, and a block that did not take (the block screen never appeared, the
 * app is still in front) is escalated instead of being assumed done.
 */
internal class BlockerEngine(
  private val escalateAfterMs: Long = ESCALATE_AFTER_MS,
  private val maxBackPresses: Int = MAX_BACK_PRESSES,
) {
  /** What one look at the screen found. */
  sealed class Seen {
    /** Could not tell, for instance a window still launching: keep going as before. */
    object Unknown : Seen()

    /** Nothing blocked on screen, or the screen is off, or blocking is off. */
    object Clear : Seen()

    /**
     * A blocked app or site is on screen. [key] is the package, or "site:"
     * plus the domain; [iconPackage] is the app, or the browser showing the site.
     */
    data class Blocked(
      val key: String,
      val label: String,
      val iconPackage: String,
      val isSite: Boolean = false,
      val inPip: Boolean = false,
    ) : Seen()
  }

  sealed class Command {
    /** Start spending the balance: a blocked target is in use and time is left. */
    data class StartMeter(val target: Seen.Blocked) : Command()

    object StopMeter : Command()

    /** Cover the target with the block screen; a site is first navigated away from. */
    data class Block(val target: Seen.Blocked, val timeUp: Boolean) : Command()

    /** The block screen did not come up: press Back in the browser. */
    data class GoBack(val target: Seen.Blocked) : Command()

    /** The block screen did not come up: send the user to the home screen. */
    data class GoHome(val target: Seen.Blocked) : Command()

    /** A floating picture-in-picture window, which the block screen cannot cover. */
    data class ClosePip(val target: Seen.Blocked) : Command()
  }

  /** The target being paid for right now, or null. */
  var metering: Seen.Blocked? = null
    private set

  private var attemptKey: String? = null
  private var attemptAt = 0L
  private var escalations = 0

  fun step(seen: Seen, balanceMs: Long, blockScreenUp: Boolean, now: Long): List<Command> =
    when (seen) {
      Seen.Unknown -> emptyList()
      Seen.Clear -> {
        attemptKey = null
        stopMeter()
      }
      is Seen.Blocked -> onBlocked(seen, balanceMs, blockScreenUp, now)
    }

  /** The balance ran out while [metering] was in use. */
  fun timeUp(now: Long): List<Command> {
    val target = metering ?: return emptyList()
    metering = null
    startAttempt(target.key, now)
    return listOf(Command.StopMeter, if (target.inPip) Command.ClosePip(target) else Command.Block(target, timeUp = true))
  }

  private fun onBlocked(seen: Seen.Blocked, balanceMs: Long, blockScreenUp: Boolean, now: Long): List<Command> {
    if (balanceMs > 0L) {
      attemptKey = null
      if (metering != null) {
        metering = seen // hopping between blocked targets is one session
        return emptyList()
      }
      metering = seen
      return listOf(Command.StartMeter(seen))
    }

    val out = stopMeter().toMutableList()
    if (seen.inPip) {
      out += Command.ClosePip(seen)
      return out
    }
    if (blockScreenUp) return out

    if (attemptKey != seen.key) {
      startAttempt(seen.key, now)
      out += Command.Block(seen, timeUp = false)
      return out
    }
    if (now - attemptAt < escalateAfterMs) return out // the block screen is on its way

    // Still in front well after the block screen should have covered it.
    escalations += 1
    attemptAt = now
    out += if (seen.isSite && escalations <= maxBackPresses) Command.GoBack(seen) else Command.GoHome(seen)
    return out
  }

  private fun startAttempt(key: String, now: Long) {
    attemptKey = key
    attemptAt = now
    escalations = 0
  }

  private fun stopMeter(): List<Command> {
    if (metering == null) return emptyList()
    metering = null
    return listOf(Command.StopMeter)
  }

  companion object {
    const val ESCALATE_AFTER_MS = 1500L
    const val MAX_BACK_PRESSES = 2
  }
}
