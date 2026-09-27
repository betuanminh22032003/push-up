package expo.modules.appblocker

import java.util.Locale

/**
 * Websites: turning what a browser's address bar shows into a host, and
 * matching it against the blocked domains. Plain Kotlin, unit-tested on the JVM.
 */
internal object Sites {
  /**
   * "https://m.youtube.com/watch?v=1" -> "m.youtube.com", "www.tiktok.com" ->
   * "tiktok.com". Null for anything that is not an address, such as a search
   * query shown in the bar or an empty new tab.
   */
  fun hostOf(text: String): String? {
    var s = text.trim().lowercase(Locale.ROOT)
    if (s.isEmpty() || s.any { it.isWhitespace() }) return null
    s = s.substringAfter("://", s)
    s = s.substringBefore('/').substringBefore('?').substringBefore('#')
    s = s.substringAfterLast('@').substringBefore(':').trimEnd('.')
    if (!s.contains('.') || s.startsWith('.')) return null
    if (s.any { !(it.isLetterOrDigit() || it == '.' || it == '-') }) return null
    return s.removePrefix("www.")
  }

  /** The blocked domain [host] belongs to: the domain itself or any subdomain of it. */
  fun matchingDomain(host: String, domains: Collection<String>): String? =
    domains.firstOrNull { host == it || host.endsWith(".$it") }
}
