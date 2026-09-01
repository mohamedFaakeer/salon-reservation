import { CheckIcon } from "./icons";
import { Reveal } from "./reveal";

/**
 * Cloudinary can derive a poster frame from a video by request — swapping
 * the file extension for .jpg and inserting a `so_0` (seek-offset zero)
 * transformation gets the first frame with no separate upload needed.
 */
function cloudinaryPoster(videoUrl: string): string {
  return videoUrl.replace("/video/upload/", "/video/upload/so_0/").replace(/\.[a-z0-9]+$/i, ".jpg");
}

export function VideoSection({
  id,
  heading,
  badge,
  videoUrl,
  features,
  reverse = false,
  tinted = false,
}: {
  id: string;
  heading: string;
  badge: string;
  videoUrl: string;
  features: { label: string; body: string }[];
  reverse?: boolean;
  tinted?: boolean;
}) {
  return (
    <section
      id={id}
      className={`py-16 sm:py-20 ${tinted ? "border-y border-[var(--border)] bg-[var(--surface)]" : ""}`}
    >
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal>
          <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">{heading}</h2>
        </Reveal>
        <Reveal
          className={`mt-8 grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-12 ${
            reverse ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--navy)] shadow-[var(--shadow-md)]">
              <video
                src={videoUrl}
                poster={cloudinaryPoster(videoUrl)}
                controls
                playsInline
                preload="metadata"
                className="block aspect-[16/10] w-full"
              >
                Your browser doesn&rsquo;t support embedded video —{" "}
                <a href={videoUrl} className="underline">
                  watch the {badge.toLowerCase()} directly
                </a>
                .
              </video>
              <span className="pointer-events-none absolute left-3.5 top-3.5 z-[2] rounded-[var(--r-sm)] bg-[rgba(2,6,23,0.55)] px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {badge}
              </span>
            </div>
          </div>

          <ul className="flex flex-col gap-4">
            {features.map((feature) => (
              <li key={feature.label} className="flex gap-3 text-[15px]">
                <CheckIcon className="mt-0.5 flex-shrink-0 text-[var(--teal)]" />
                <span>
                  <strong className="text-[var(--navy)]">{feature.label}</strong>{" "}
                  <span className="text-[var(--slate)]">{feature.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
