export function SiteNav() {
  return (
    <>
      {/* Every in-page anchor below is prefixed with "/" (e.g. "/#for-partners"
          not "#for-partners") because this nav is now shared between the
          homepage and /features — a bare hash would try to scroll to a
          section that doesn't exist on whichever page isn't "/". "/#x" still
          resolves as a same-document fragment scroll (no reload) when
          already on "/", and correctly navigates-then-scrolls from anywhere
          else. */}
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
          <a href="/" className="flex items-center gap-2.5">
            {/* Plain <img>, matching the convention already used for this asset in apps/admin/apps/web — an SVG served from /public gains nothing from next/image. */}
            <img src="/branding/zelyra-logo.svg" alt="" className="h-[30px] w-[30px]" />
            <span className="font-[var(--font-display)] text-lg font-bold text-[var(--navy)]">ZelyraOne</span>
          </a>

          <div className="hidden items-center gap-1 sm:flex">
            <a
              href="/features"
              className="rounded-[var(--r-default)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[#F1F5F9]"
            >
              Features
            </a>
            <a
              href="/#for-partners"
              className="rounded-[var(--r-default)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[#F1F5F9]"
            >
              For Partners
            </a>
            <a
              href="/#for-customers"
              className="rounded-[var(--r-default)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[#F1F5F9]"
            >
              For Customers
            </a>
          </div>

          <a
            href="/#book-demo"
            className="btn btn-primary px-5 py-2.5 text-sm"
            data-analytics="demo_click"
            data-cta-location="navigation"
          >
            Book a demo
          </a>
        </div>
      </nav>
      {/* `fixed` (unlike the `sticky` this replaces) takes the nav out of
          normal document flow entirely, so without this spacer every
          section would start underneath it. Sized to the nav's real
          rendered height (measured, not guessed) — the nav's own content
          never changes height at any viewport, so one fixed value is
          correct everywhere. */}
      <div aria-hidden="true" className="h-[69px]" />
    </>
  );
}
