package expo.modules.appblocker

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.util.Log

/**
 * The door into the blocker's own process.
 *
 * The two watchers, the block screen and [BlockerStore] run in ":blocker",
 * apart from the React Native process. That process holds the camera, a
 * WebView and the JS engine; it is the one the system reclaims under memory
 * pressure and the one a JS crash takes down. Before the split, either took the
 * service with it, and on realme the system then declined to restart it.
 *
 * The JS module in the main process reaches the state only through [call],
 * which runs here, so there is exactly one copy of it.
 */
class BlockerProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
    val ctx = context ?: return null
    return try {
      BlockerStore.init(ctx)
      when (method) {
        GET_STATE -> Unit
        SET_ENABLED -> BlockerStore.setEnabled(extras?.getBoolean(VALUE) == true)
        SET_BLOCKED -> BlockerStore.setBlocked(extras?.getStringArrayList(VALUE).orEmpty().toSet())
        SET_SITES -> BlockerStore.setSites(
          extras?.getStringArrayList(VALUE).orEmpty().mapNotNull(Sites::hostOf).toSet(),
        )
        ADD_CREDIT -> BlockerStore.addCredit(extras?.getLong(VALUE) ?: 0L)
        SET_SHOW_TIMER -> BlockerStore.setShowTimer(extras?.getBoolean(VALUE) == true)
        SET_LABELS -> BlockerStore.setLabels(labelsFrom(extras?.getBundle(VALUE)))
        CONSUME_EARN -> return Bundle().apply { putLong(VALUE, BlockerStore.consumeEarnRequest()) }
        RESET -> BlockerStore.reset()
        else -> return null
      }
      // The app calls while it is in front, when a foreground service may be
      // started: bring the watcher in line with the state, and with
      // permissions just granted or withdrawn in settings.
      WatchService.sync(ctx)
      stateBundle()
    } catch (e: RuntimeException) {
      Log.w(TAG, "call $method failed", e)
      null
    }
  }

  private fun stateBundle(): Bundle {
    val s = BlockerStore.snapshot()
    return Bundle().apply {
      putBoolean("enabled", s.enabled)
      putStringArrayList("blocked", ArrayList(s.blocked))
      putStringArrayList("sites", ArrayList(s.sites))
      putLong("balanceMs", s.balanceMs)
      putBoolean("showTimer", s.showTimer)
      putLong("earnRequestedAt", s.earnRequestedAt)
      putLong("serviceConnectedAt", s.serviceConnectedAt)
      // Only this process can tell: the watchers run here.
      putBoolean("serviceRunning", BlockerService.isRunning)
      putBoolean("watcherRunning", WatchService.isRunning)
    }
  }

  private fun labelsFrom(bundle: Bundle?): Map<String, String> {
    if (bundle == null) return emptyMap()
    return bundle.keySet().associateWith { bundle.getString(it).orEmpty() }
  }

  // A key-value door, not a table: the cursor API is not used.
  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0

  companion object {
    private const val TAG = "AppBlocker"

    const val GET_STATE = "getState"
    const val SET_ENABLED = "setEnabled"
    const val SET_BLOCKED = "setBlocked"
    const val SET_SITES = "setSites"
    const val ADD_CREDIT = "addCredit"
    const val SET_SHOW_TIMER = "setShowTimer"
    const val SET_LABELS = "setLabels"
    const val CONSUME_EARN = "consumeEarnRequest"
    const val RESET = "reset"
    const val VALUE = "value"

    fun uri(packageName: String): Uri = Uri.parse("content://$packageName.appblocker")
  }
}
