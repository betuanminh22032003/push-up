package expo.modules.appblocker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SitesTest {
  @Test
  fun `address bar text becomes a bare host`() {
    assertEquals("m.youtube.com", Sites.hostOf("https://m.youtube.com/watch?v=abc"))
    assertEquals("tiktok.com", Sites.hostOf("www.tiktok.com"))
    assertEquals("facebook.com", Sites.hostOf("  FACEBOOK.com/groups  "))
    assertEquals("reddit.com", Sites.hostOf("http://user@reddit.com:8080/r/all"))
    assertEquals("youtu.be", Sites.hostOf("youtu.be/xyz#t=3"))
    assertEquals("tuổitrẻ.vn", Sites.hostOf("tuổitrẻ.vn"))
  }

  @Test
  fun `searches and empty tabs are not addresses`() {
    assertNull(Sites.hostOf(""))
    assertNull(Sites.hostOf("tiktok dance"))
    assertNull(Sites.hostOf("tiktok"))
    assertNull(Sites.hostOf("Search or type web address"))
    assertNull(Sites.hostOf(".com"))
  }

  @Test
  fun `a domain covers its subdomains and nothing that merely ends like it`() {
    val blocked = listOf("youtube.com", "tiktok.com")
    assertEquals("youtube.com", Sites.matchingDomain("youtube.com", blocked))
    assertEquals("youtube.com", Sites.matchingDomain("m.youtube.com", blocked))
    assertEquals("tiktok.com", Sites.matchingDomain("vt.tiktok.com", blocked))
    assertNull(Sites.matchingDomain("notyoutube.com", blocked))
    assertNull(Sites.matchingDomain("youtube.com.evil.net", blocked))
    assertNull(Sites.matchingDomain("google.com", blocked))
  }
}
