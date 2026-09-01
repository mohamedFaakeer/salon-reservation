import { Reveal } from "./reveal";

export function HowItWorks({
  id,
  heading,
  steps,
}: {
  id: string;
  heading: string;
  steps: { title: string; body: string }[];
}) {
  return (
    <section id={id} className="py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">{heading}</h2>
        <ol className="mt-8 flex flex-col gap-6">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-6">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <h4>{step.title}</h4>
                <p className="mt-1 max-w-[60ch] text-[var(--slate)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
