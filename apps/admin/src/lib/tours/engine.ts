"use client";

/**
 * The actual driver.js wiring. Lives in its own module, imported only via
 * `import("./engine")` from `TourProvider.startTour` — never at module scope
 * anywhere else — so driver.js (and this file's CSS) are fetched only once a
 * tour is genuinely started, and every page that never opens one pays
 * nothing for this feature existing.
 */

import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-theme.css";
import type { TourDef } from "./types";

export interface RunTourCallbacks {
  /** Client-side navigation — used lazily, once, the first time a step needs a route it isn't already on. */
  navigate: (route: string) => void;
  onFinish: (status: "completed" | "skipped") => void;
}

function resolveAnchorElement(anchor: string): Element {
  // driver.js polls this getter (via each step's `waitForElement`) until it
  // resolves to a real element — returning `null` on the early calls (e.g.
  // right after a route change, or right after the previous step's real
  // click opened a drawer) is the expected, common case, not a bug. The cast
  // is deliberate: driver.js's own runtime tolerates a miss here even though
  // its `.d.ts` types the getter as always returning a real `Element`.
  return document.querySelector(`[data-tour-id="${anchor}"]`) as Element;
}

function buildProgressContent(total: number, current: number): DocumentFragment {
  const frag = document.createDocumentFragment();
  const wrap = document.createElement("div");
  wrap.className = "salon-tour-progress";

  const count = document.createElement("span");
  count.className = "salon-tour-step-count";
  count.textContent = `STEP ${current + 1} OF ${total}`;
  wrap.appendChild(count);

  const dots = document.createElement("span");
  dots.className = "salon-tour-dots";
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("span");
    if (i < current) dot.className = "done";
    else if (i === current) dot.className = "now";
    dots.appendChild(dot);
  }
  wrap.appendChild(dots);

  frag.appendChild(wrap);
  return frag;
}

function buildSkipButton(onSkip: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "salon-tour-skip";
  btn.textContent = "Skip tour";
  btn.addEventListener("click", onSkip);
  return btn;
}

export function runTour(tour: TourDef, { navigate, onFinish }: RunTourCallbacks): void {
  let outcome: "completed" | "skipped" | null = null;
  let finished = false;
  const navigatedForStep = new Set<number>();

  function finish(fallback: "completed" | "skipped"): void {
    if (finished) {
      return;
    }
    finished = true;
    onFinish(outcome ?? fallback);
  }

  const steps: DriveStep[] = tour.steps.map((step, index) => ({
    element: () => {
      if (step.route && !navigatedForStep.has(index) && !window.location.pathname.startsWith(step.route)) {
        navigatedForStep.add(index);
        navigate(step.route);
      }
      return resolveAnchorElement(step.anchor);
    },
    waitForElement: step.waitForAnchorMs ?? 4000,
    advanceOnClick: step.advanceOn === "element-event",
    popover: {
      title: step.title,
      description: step.body,
      side: step.placement,
      showProgress: true,
      showButtons: step.advanceOn === "element-event" ? [] : index === 0 ? ["next"] : ["previous", "next"],
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      onPopoverRender: (popoverDom) => {
        popoverDom.progress.replaceChildren(buildProgressContent(tour.steps.length, index));
        if (!popoverDom.footer.querySelector(".salon-tour-skip")) {
          popoverDom.footer.prepend(
            buildSkipButton(() => {
              outcome = "skipped";
              driverObj.destroy();
            }),
          );
        }
      },
    },
  }));

  // Referenced inside `steps`' closures above (skip button, done click) even
  // though it's declared after them — safe, because those closures only run
  // later (once a popover actually renders), by which point this binding is
  // long since initialized. JS resolves the identifier at call time, not at
  // the time the closure literal was written.
  const driverObj: Driver = driver({
    animate: true,
    smoothScroll: true,
    overlayColor: "#0f172a",
    overlayOpacity: 0.62,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: "salon-tour-popover",
    // Escape/backdrop-click are disabled on purpose: every exit from a tour
    // goes through the explicit Skip control, so "leaving early" is always a
    // deliberate, recorded outcome rather than an accidental Escape press.
    allowClose: false,
    steps,
    skipMissingElement: true,
    onDoneClick: () => {
      outcome = "completed";
      driverObj.destroy();
    },
    onDestroyed: () => finish("skipped"),
  });

  driverObj.drive();
}
