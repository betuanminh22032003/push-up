package expo.modules.appblocker

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Everything the blocker remembers, shared by the JS bridge and the
 * accessibility service.
 *
 * Both run in the app's own process, so this one in-memory copy is the source
 * of truth and SharedPreferences only has to carry it across restarts. The
 * balance is spent in one-second steps while a blocked app is open; those
 * steps are written out every few seconds and whenever a session ends, so a
 * killed process loses at most a few seconds of accounting.
 */
internal object BlockerStore {
  private const val PREFS = "expo.modules.appblocker"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_BLOCKED = "blocked"
  private const val KEY_SITES = "sites"
  private const val KEY_BALANCE = "balanceMs"
  private const val KEY_SHOW_TIMER = "showTimer"
  private const val KEY_LABELS = "labels"
  private const val KEY_EARN_AT = "earnRequestedAt"
  private const val KEY_SERVICE_AT = "serviceConnectedAt"

  /** A day of banked time is already more than anyone should spend scrolling. */
  private const val MAX_BALANCE_MS = 24L * 60 * 60 * 1000

  data class Snapshot(
    val enabled: Boolean,
    val blocked: Set<String>,
    val sites: Set<String>,
    val balanceMs: Long,
    val showTimer: Boolean,
    val earnRequestedAt: Long,
    val serviceConnectedAt: Long,
  ) {
    /** Switched on with something to block. */
    val active: Boolean get() = enabled && (blocked.isNotEmpty() || sites.isNotEmpty())
  }

  private var prefs: SharedPreferences? = null
  private var enabled = false
  private var blocked: Set<String> = emptySet()
  private var sites: Set<String> = emptySet()
  private var balanceMs = 0L
  private var showTimer = true
  private var labels: Map<String, String> = emptyMap()
  private var earnRequestedAt = 0L
  private var serviceConnectedAt = 0L

  /** Set by the running service, so it re-checks the app in front after any change. */
  @Volatile
  var onChange: (() -> Unit)? = null

  @Synchronized
  fun init(context: Context) {
    if (prefs != null) return
    val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs = p
    enabled = p.getBoolean(KEY_ENABLED, false)
    // getStringSet hands back the stored instance, which must never be mutated.
    blocked = p.getStringSet(KEY_BLOCKED, null)?.toSet() ?: emptySet()
    sites = p.getStringSet(KEY_SITES, null)?.toSet() ?: emptySet()
    balanceMs = p.getLong(KEY_BALANCE, 0L).coerceIn(0L, MAX_BALANCE_MS)
    showTimer = p.getBoolean(KEY_SHOW_TIMER, true)
    labels = parseLabels(p.getString(KEY_LABELS, null))
    earnRequestedAt = p.getLong(KEY_EARN_AT, 0L)
    serviceConnectedAt = p.getLong(KEY_SERVICE_AT, 0L)
  }

  @Synchronized
  fun snapshot() =
    Snapshot(enabled, blocked, sites, balanceMs, showTimer, earnRequestedAt, serviceConnectedAt)

  fun setEnabled(value: Boolean) = change {
    enabled = value
    it.putBoolean(KEY_ENABLED, value)
  }

  fun setBlocked(packages: Set<String>) = change {
    blocked = packages.toSet()
    it.putStringSet(KEY_BLOCKED, HashSet(packages))
  }

  /** Domains blocked in browsers: the blocked apps' own sites plus the user's. */
  fun setSites(domains: Set<String>) = change {
    sites = domains.toSet()
    it.putStringSet(KEY_SITES, HashSet(domains))
  }

  /** The service reports in, so the app can tell "never switched on" from "switched off by the system". */
  @Synchronized
  fun markServiceConnected() {
    serviceConnectedAt = System.currentTimeMillis()
    prefs?.edit()?.putLong(KEY_SERVICE_AT, serviceConnectedAt)?.apply()
  }

  fun addCredit(ms: Long) = change {
    balanceMs = (balanceMs + ms.coerceAtLeast(0L)).coerceAtMost(MAX_BALANCE_MS)
    it.putLong(KEY_BALANCE, balanceMs)
  }

  fun setShowTimer(value: Boolean) = change {
    showTimer = value
    it.putBoolean(KEY_SHOW_TIMER, value)
  }

  fun reset() = change {
    enabled = false
    blocked = emptySet()
    sites = emptySet()
    balanceMs = 0L
    earnRequestedAt = 0L
    it.remove(KEY_ENABLED).remove(KEY_BLOCKED).remove(KEY_SITES).remove(KEY_BALANCE).remove(KEY_EARN_AT)
  }

  /** Spends from the balance and returns what is left. Written out by [saveBalance]. */
  @Synchronized
  fun spend(ms: Long): Long {
    balanceMs = (balanceMs - ms.coerceAtLeast(0L)).coerceAtLeast(0L)
    return balanceMs
  }

  @Synchronized
  fun saveBalance() {
    prefs?.edit()?.putLong(KEY_BALANCE, balanceMs)?.apply()
  }

  /** Copy for the native screens, translated by the app so they match its language setting. */
  @Synchronized
  fun setLabels(values: Map<String, String>) {
    labels = values.toMap()
    prefs?.edit()?.putString(KEY_LABELS, JSONObject(values).toString())?.apply()
  }

  @Synchronized
  fun label(key: String, fallback: String): String = labels[key]?.takeIf { it.isNotBlank() } ?: fallback

  /** The block screen's "earn time" button: the app opens on the workout tab. */
  @Synchronized
  fun requestEarn() {
    earnRequestedAt = System.currentTimeMillis()
    prefs?.edit()?.putLong(KEY_EARN_AT, earnRequestedAt)?.apply()
  }

  /** Returns when the earn request was made (0 if none) and clears it. */
  @Synchronized
  fun consumeEarnRequest(): Long {
    val at = earnRequestedAt
    if (at != 0L) {
      earnRequestedAt = 0L
      prefs?.edit()?.remove(KEY_EARN_AT)?.apply()
    }
    return at
  }

  private fun change(block: (SharedPreferences.Editor) -> Unit) {
    synchronized(this) {
      val editor = checkNotNull(prefs) { "BlockerStore.init must run first" }.edit()
      block(editor)
      editor.apply()
    }
    onChange?.invoke()
  }

  private fun parseLabels(raw: String?): Map<String, String> {
    if (raw.isNullOrEmpty()) return emptyMap()
    return try {
      val json = JSONObject(raw)
      json.keys().asSequence().associateWith { json.optString(it) }
    } catch (e: org.json.JSONException) {
      emptyMap()
    }
  }
}
