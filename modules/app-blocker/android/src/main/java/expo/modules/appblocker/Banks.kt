package expo.modules.appblocker

/**
 * Vietnamese banking and e-wallet apps that refuse to run beside an app holding
 * an accessibility service or "display over other apps" (tightened by Circular
 * 77/2025, from 2026-03-01). When one of them is on screen, [WatchService]
 * takes every overlay down and blocks nothing, so the blocker does not obscure
 * it and the bank opens.
 *
 * This only helps where the bank looks for an overlay actually on screen. A
 * bank that instead scans for the granted permission still complains, and then
 * the permission has to be switched off in settings.
 *
 * Package names only, so an unknown one is simply not recognised; a wrong entry
 * is harmless, since a banking app is never something to block. Many banks ship
 * VNPAY's white-label app, so the "com.vnpay." prefix catches a whole group at
 * once. Plain Kotlin, unit-tested on the JVM.
 */
internal object Banks {
  fun isBank(pkg: String): Boolean = pkg in PACKAGES || pkg.startsWith("com.vnpay.")

  /**
   * The ones not under the VNPAY prefix. BIDV (`com.vnpay.bidv`), Agribank,
   * VPBank, HDBank, SHB and others are white-labelled by VNPAY and matched by
   * the prefix instead.
   */
  private val PACKAGES = setOf(
    "com.VCB", // Vietcombank VCB Digibank
    "com.vietinbank.ipay", // VietinBank iPay
    "vn.com.techcombank.bb.app", // Techcombank Mobile
    "com.mbmobile", // MB Bank
    "mobile.acb.com.vn", // ACB ONE
    "com.tpb.mb.gprsandroid", // TPBank
    "com.vib.myvib2", // MyVIB
    "vn.com.vng.zalopay", // ZaloPay
    "com.mservice.momotransfer", // MoMo
    "xyz.be.cake", // Cake by VPBank
  )
}
