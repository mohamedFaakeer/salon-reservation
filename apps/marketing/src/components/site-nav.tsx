export function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
        <a href="#top" className="flex items-center gap-2.5">
          {/* Plain <img>, matching the convention already used for this asset in apps/admin/apps/web — an SVG served from /public gains nothing from next/image. */}
          <img src="/branding/zelyra-logo.svg" alt="" className="h-[30px] w-[30px]" />
          <span className="font-[var(--font-display)] text-lg font-bold text-[var(--navy)]">ZelyraOne</span>
        </a>

        <div className="hidden items-center gap-1 sm:flex">
          <a
            href="#for-partners"
            className="rounded-[var(--r-default)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[#F1F5F9]"
          >
            For Partners
          </a>
          <a
            href="#for-customers"
            className="rounded-[var(--r-default)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[#F1F5F9]"
          >
            For Customers
          </a>
        </div>

        <a href="#book-demo" className="btn btn-primary px-5 py-2.5 text-sm">
          Book a demo
        </a>
      </div>
    </nav>
  );
}
