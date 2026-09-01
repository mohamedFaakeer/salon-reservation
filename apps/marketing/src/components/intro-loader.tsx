import "./intro-loader.css";

/**
 * First-load intro moment — ported from the user's own supplied loader
 * (ZelyraOne-Landing-Loader/zelyra-loader/index.html). Genuine branding
 * polish, not a real data-loading indicator: apps/marketing is a fully
 * static export with nothing to actually wait for, the same way the
 * hero's slot-lock animation represents a claim rather than reporting
 * real backend state.
 *
 * Deliberately a plain Server Component, not "use client": the markup
 * below ships as part of the static HTML from the first byte, so it
 * covers the page before React ever hydrates. Gating this behind a
 * useEffect would mean the static HTML shipped with no loader at all,
 * appearing only after hydration — by which point the real page is
 * already visible, defeating the point. The inline script below runs
 * synchronously as the HTML parses, exactly like the source file's own
 * plain-HTML approach, just embedded in a Next.js layout instead of a
 * standalone page.
 *
 * Confirmed decisions: shows once per browser session (sessionStorage),
 * not on every reload; hides on real readiness (window `load` +
 * `document.fonts.ready`) plus a 1200ms floor so it never flickers by
 * faster than the animation can read, never a fixed arbitrary timer.
 */
const LOADER_SCRIPT = `(function () {
  var SESSION_KEY = "zelyra-loader-shown";
  var MIN_DISPLAY_MS = 1200;
  var FADE_MS = 600;
  var loader = document.getElementById("zelyra-loader");
  if (!loader) return;

  var alreadyShown = false;
  try {
    alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
  } catch (e) {
    // sessionStorage unavailable (private browsing, etc.) — fail open,
    // treat as not-yet-shown so the loader still runs.
  }

  if (alreadyShown) {
    // Hide via the class, not loader.remove() — removing the node this
    // early (before React hydrates the tree it rendered this element
    // into) makes React's hydration recreate it to match what it
    // expected to find, undoing the removal. Adding a class is a mutation
    // hydration won't fight; the delayed remove() below is long past any
    // real-world hydration time, so it's safe there.
    loader.classList.add("is-hidden");
    window.setTimeout(function () { loader.remove(); }, 2000);
    return;
  }

  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch (e) {
    // ignore — worst case it shows again next load
  }

  var start = Date.now();
  var realReady = new Promise(function (resolve) {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", function () { resolve(); }, { once: true });
    }
  });
  var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();

  Promise.all([realReady, fontsReady]).then(function () {
    var elapsed = Date.now() - start;
    var remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    window.setTimeout(function () {
      loader.classList.add("is-hidden");
      window.setTimeout(function () { loader.remove(); }, FADE_MS);
    }, remaining);
  });
})();`;

export function IntroLoader() {
  return (
    <>
      <div id="zelyra-loader" className="zelyra-loader" role="status" aria-live="polite" aria-label="ZelyraOne is loading">
        <div className="loader-inner">
          <div className="mark-stage">
            <div className="logo-wrap">
              <img src="/branding/zelyra-loader-mark.png" alt="ZelyraOne" />
              <span className="spark" aria-hidden="true" />
            </div>
          </div>
          <div className="progress" aria-hidden="true" />
          <p className="status">Preparing your experience</p>
        </div>
      </div>
      {/* Literal string, zero interpolation, no user input anywhere near
          it — same pattern as apps/web's DIRECTION_CONTRACT block
          (SECURITY_AUDIT_REPORT.md F-03, though that lint rule only
          covers apps/web/apps/admin, not this app). Must run
          synchronously, before React hydrates, so it can't be a
          useEffect. */}
      <script dangerouslySetInnerHTML={{ __html: LOADER_SCRIPT }} />
    </>
  );
}
