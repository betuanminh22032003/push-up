package expo.modules.appblocker

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import java.io.ByteArrayOutputStream

/** Installed-app lookups for the picker, the block screen, browsers and the never-block list. */
internal object Packages {
  /**
   * Apps that must never be blocked, whatever the stored list says: this app,
   * the home screen (blocking it would trap the user), Settings (the blocker
   * must always be possible to turn off) and the phone.
   */
  fun protectedPackages(context: Context): Set<String> {
    val pm = context.packageManager
    val result = hashSetOf(context.packageName, "com.android.systemui", "com.android.settings")
    listOf(
      Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
      Intent(Settings.ACTION_SETTINGS),
      Intent(Intent.ACTION_DIAL),
    ).forEach { intent ->
      queryActivities(pm, intent).mapNotNullTo(result) { it.activityInfo?.packageName }
    }
    return result
  }

  /**
   * Apps that open ordinary web links, whose address bar is read to block
   * sites. Queried rather than listed, so any browser the user installs counts.
   */
  fun browsers(context: Context): Set<String> {
    val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
      .addCategory(Intent.CATEGORY_BROWSABLE)
    return queryActivities(context.packageManager, web, PackageManager.MATCH_ALL)
      .mapNotNullTo(HashSet()) { it.activityInfo?.packageName }
      .apply { remove(context.packageName) }
  }

  /**
   * Every app with a launcher icon, once each, with a small PNG icon as base64.
   * Runs on a background thread: drawing a hundred icons takes a moment.
   */
  fun launchableApps(context: Context, iconSizePx: Int): List<Map<String, Any?>> {
    val pm = context.packageManager
    val skip = protectedPackages(context)
    val seen = HashSet<String>()
    val apps = ArrayList<Map<String, Any?>>()
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    for (info in queryActivities(pm, launcher)) {
      val pkg = info.activityInfo?.packageName ?: continue
      if (pkg in skip || !seen.add(pkg)) continue
      val label = info.loadLabel(pm).toString().trim().ifEmpty { pkg }
      val icon = try {
        encodeIcon(info.loadIcon(pm), iconSizePx)
      } catch (e: RuntimeException) {
        null
      } catch (e: OutOfMemoryError) {
        null
      }
      apps.add(mapOf("packageName" to pkg, "label" to label, "icon" to icon))
    }
    return apps
  }

  fun appLabel(context: Context, pkg: String): String = try {
    val pm = context.packageManager
    pm.getApplicationLabel(applicationInfo(pm, pkg)).toString()
  } catch (e: PackageManager.NameNotFoundException) {
    pkg
  }

  fun appIcon(context: Context, pkg: String): Drawable? = try {
    context.packageManager.getApplicationIcon(pkg)
  } catch (e: PackageManager.NameNotFoundException) {
    null
  }

  private fun applicationInfo(pm: PackageManager, pkg: String) =
    if (Build.VERSION.SDK_INT >= 33) {
      pm.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0L))
    } else {
      @Suppress("DEPRECATION")
      pm.getApplicationInfo(pkg, 0)
    }

  private fun queryActivities(pm: PackageManager, intent: Intent, flags: Int = 0): List<ResolveInfo> =
    if (Build.VERSION.SDK_INT >= 33) {
      pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(flags.toLong()))
    } else {
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(intent, flags)
    }

  private fun encodeIcon(drawable: Drawable, size: Int): String {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(Canvas(bitmap))
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
