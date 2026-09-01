export function SiteFooter() {
  return (
    <footer className="bg-[var(--navy)] py-16 pb-10 text-[#CBD5E1]">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-12">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              {/* Plain <img>, matching the convention already used for this asset in apps/admin/apps/web. */}
              <img src="/branding/zelyra-logo.svg" alt="" className="h-[26px] w-[26px]" />
              <span className="font-[var(--font-display)] text-base font-bold text-white">ZelyraOne</span>
            </div>
            <p className="max-w-[32ch] text-sm text-[#64748B]">
              One engine for every booking, built for how Colombo&rsquo;s salons actually run.
            </p>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">ZelyraOne</h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a href="#for-partners" className="text-[#94A3B8] hover:text-white">
                  For Partners
                </a>
              </li>
              <li>
                <a href="#for-customers" className="text-[#94A3B8] hover:text-white">
                  For Customers
                </a>
              </li>
              <li>
                <a href="#book-demo" className="text-[#94A3B8] hover:text-white">
                  Book a demo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white">More</h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <a href="#trust" className="text-[#94A3B8] hover:text-white">
                  Trust &amp; Security
                </a>
              </li>
              <li>
                <a href="#business-faq" className="text-[#94A3B8] hover:text-white">
                  FAQ
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-2.5 border-t border-[#1E293B] pt-6 text-[13px] text-[#64748B]">
          <span>&copy; {new Date().getFullYear()} ZelyraOne &middot; Colombo, Sri Lanka</span>
          <span>business.zelyraone.lk &middot; book.zelyraone.lk</span>
        </div>
      </div>
    </footer>
  );
}
