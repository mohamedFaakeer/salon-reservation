export function SiteFooter() {
  return (
    <footer className="bg-[var(--navy)] py-16 pb-10 text-[#CBD5E1]">
      {/* Audit finding: this footer's tagline and copyright lines used
          #64748B directly (3.75:1 on navy, fails WCAG's 4.5:1) — the same
          value already named --footer-ink (6.96:1) is used two lines
          below for the nav links; tokenizing both fixes the contrast and
          removes the copy-pasted-hex root cause. */}
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-12">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              {/* Plain <img>, matching the convention already used for this asset in apps/admin/apps/web. */}
              <img src="/branding/zelyra-logo.svg" alt="" className="h-[26px] w-[26px]" />
              <span className="font-[var(--font-display)] text-base font-bold text-white">ZelyraOne</span>
            </div>
            <p className="max-w-[32ch] text-sm text-[var(--footer-ink)]">
              One engine for every booking, built for how Colombo&rsquo;s salons actually run.
            </p>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">ZelyraOne</h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a href="#for-partners" className="text-[var(--footer-ink)] hover:text-white">
                  For Partners
                </a>
              </li>
              <li>
                <a href="#for-customers" className="text-[var(--footer-ink)] hover:text-white">
                  For Customers
                </a>
              </li>
              <li>
                <a
                  href="#book-demo"
                  className="text-[var(--footer-ink)] hover:text-white"
                  data-analytics="demo_click"
                  data-cta-location="footer"
                >
                  Book a demo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">More</h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a href="#trust" className="text-[var(--footer-ink)] hover:text-white">
                  Trust &amp; Security
                </a>
              </li>
              <li>
                <a href="#business-faq" className="text-[var(--footer-ink)] hover:text-white">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#contact" className="text-[var(--footer-ink)] hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>
        {/* "Colombo, Sri Lanka" moved to the Contact section's details card,
            which now carries it alongside the phone numbers and WhatsApp
            link — this line is the legal copyright notice only. */}
        <div className="mt-12 flex flex-wrap justify-between gap-2.5 border-t border-[var(--footer-border)] pt-6 text-[13px] text-[var(--footer-ink)]">
          <span>&copy; {new Date().getFullYear()} ZelyraOne. All rights reserved.</span>
          <span>business.zelyraone.lk &middot; book.zelyraone.lk</span>
        </div>
      </div>
    </footer>
  );
}
