package expo.modules.appblocker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BanksTest {
  @Test
  fun `named banking and wallet apps are recognised`() {
    assertTrue(Banks.isBank("vn.com.techcombank.bb.app")) // Techcombank
    assertTrue(Banks.isBank("com.VCB")) // Vietcombank
    assertTrue(Banks.isBank("com.mbmobile")) // MB Bank
    assertTrue(Banks.isBank("com.mservice.momotransfer")) // MoMo
  }

  @Test
  fun `the VNPAY white-label prefix catches its whole group`() {
    assertTrue(Banks.isBank("com.vnpay.bidv")) // BIDV
    assertTrue(Banks.isBank("com.vnpay.Agribank3g")) // Agribank
    assertTrue(Banks.isBank("com.vnpay.vpbankonline")) // VPBank NEO
  }

  @Test
  fun `apps people actually block are not mistaken for banks`() {
    assertFalse(Banks.isBank("com.ss.android.ugc.trill")) // TikTok
    assertFalse(Banks.isBank("com.facebook.katana")) // Facebook
    assertFalse(Banks.isBank("com.google.android.youtube")) // YouTube
    assertFalse(Banks.isBank("")) // nothing on screen
  }
}
