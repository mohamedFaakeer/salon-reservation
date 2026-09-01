"use client";

import { useState, type FormEvent } from "react";
import { Reveal } from "./reveal";
import { PhoneIcon, WhatsAppIcon } from "./icons";
import { WHATSAPP_URL } from "./floating-whatsapp";

/**
 * A second, lower-commitment conversion path alongside DemoBooking: a quick
 * question doesn't need a 30-minute call booked. Static-export-friendly the
 * same way DemoBooking is — Web3Forms is a client-side-only form-to-email
 * service, so this needs no server of ours (apps/marketing has none; see
 * next.config.ts). Reads NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY the same way
 * DemoBooking reads NEXT_PUBLIC_CALENDLY_LINK: unset renders an honest
 * "not connected yet" state instead of a form that silently can't submit.
 *
 * Web3Forms binds a submission's destination email to whichever address was
 * used to generate the access key — there's no per-request override — so
 * the key must be generated against faakeermohamed@gmail.com.
 */
const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;

// Both published numbers are Sri Lankan mobiles (07x): accepts 07XXXXXXXX,
// +947XXXXXXXX, or 947XXXXXXXX, ignoring spaces/dashes the user may type.
const PHONE_PATTERN = /^(?:\+?94|0)7\d{8}$/;

type FieldErrors = { name?: string; phone?: string; inquiry?: string };
type Status = "idle" | "submitting" | "success" | "error";

function validate(name: string, phone: string, inquiry: string): FieldErrors {
  const errors: FieldErrors = {};
  if (name.trim().length < 2) {
    errors.name = "Enter your full name (at least 2 characters).";
  }
  if (!PHONE_PATTERN.test(phone.replace(/[\s-]/g, ""))) {
    errors.phone = "Enter a valid Sri Lankan mobile number, e.g. 0771234567.";
  }
  if (inquiry.trim().length < 10) {
    errors.inquiry = "Tell us a bit more about your inquiry (at least 10 characters).";
  }
  return errors;
}

export function ContactSection({ id }: { id: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [company, setCompany] = useState(""); // honeypot — real visitors never see or fill this
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validate(name, phone, inquiry);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Spam caught by the honeypot: pretend it worked, send nothing.
    if (company) {
      setStatus("success");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: "New inquiry from the ZelyraOne website",
          from_name: name,
          name,
          phone,
          message: inquiry,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStatus("success");
        setName("");
        setPhone("");
        setInquiry("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (!WEB3FORMS_ACCESS_KEY) {
    return (
      <section id={id} className="border-t border-[var(--border)] py-16 sm:py-20">
        <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
          <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">Got a quick question instead of a demo to book?</h2>
          <div className="mt-8 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] bg-[var(--bg)] p-8 text-center">
            <h4>Contact form isn&rsquo;t connected yet</h4>
            <p className="mx-auto mt-1.5 max-w-[48ch] text-[var(--slate)]">
              Set <code className="rounded-[var(--r-sm)] bg-[var(--surface)] px-1.5 py-0.5">NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY</code>{" "}
              to go live.
            </p>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section id={id} className="border-t border-[var(--border)] py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <span className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-[var(--teal-dark)]">
              Get in touch
            </span>
            <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">
              Got a quick question instead of a demo to book?
            </h2>
            <p className="mt-2.5 max-w-[46ch] text-[var(--slate)]">
              Send us a message and we&rsquo;ll reply directly — no need to book a call for a simple question.
            </p>

            {status === "success" ? (
              <div className="mt-7 rounded-[var(--r-lg)] border border-[#bbf7d0] bg-[var(--success-tint)] p-6">
                <h4 className="text-base font-semibold text-[var(--status-success-ink)]">Message sent</h4>
                <p className="mt-1.5 text-sm">Thanks — we&rsquo;ll get back to you shortly at the number you gave us.</p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="mt-3 text-sm font-semibold text-[var(--teal-dark)] hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4.5" noValidate>
                <div>
                  <label htmlFor="contact-name" className="mb-1.5 block text-sm font-semibold text-[var(--navy)]">
                    Full Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "contact-name-error" : undefined}
                    className={`w-full rounded-[var(--r-default)] border px-3.5 py-3 text-[15px] outline-none focus:border-[var(--teal-dark)] focus:ring-[3px] focus:ring-[var(--teal-tint)] ${
                      errors.name ? "border-[var(--error)]" : "border-[var(--border)]"
                    }`}
                  />
                  {errors.name && (
                    <p id="contact-name-error" role="alert" className="mt-1.5 text-[12.5px] font-medium text-[var(--error)]">
                      {errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="contact-phone" className="mb-1.5 block text-sm font-semibold text-[var(--navy)]">
                    Phone Number
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07XX XXX XXX"
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "contact-phone-error" : undefined}
                    className={`w-full rounded-[var(--r-default)] border px-3.5 py-3 text-[15px] outline-none focus:border-[var(--teal-dark)] focus:ring-[3px] focus:ring-[var(--teal-tint)] ${
                      errors.phone ? "border-[var(--error)]" : "border-[var(--border)]"
                    }`}
                  />
                  {errors.phone && (
                    <p id="contact-phone-error" role="alert" className="mt-1.5 text-[12.5px] font-medium text-[var(--error)]">
                      {errors.phone}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="contact-inquiry" className="mb-1.5 block text-sm font-semibold text-[var(--navy)]">
                    Your Inquiry
                  </label>
                  <textarea
                    id="contact-inquiry"
                    value={inquiry}
                    onChange={(e) => setInquiry(e.target.value)}
                    placeholder="Describe your inquiry"
                    rows={4}
                    aria-invalid={!!errors.inquiry}
                    aria-describedby={errors.inquiry ? "contact-inquiry-error" : undefined}
                    className={`w-full resize-y rounded-[var(--r-default)] border px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-[var(--teal-dark)] focus:ring-[3px] focus:ring-[var(--teal-tint)] ${
                      errors.inquiry ? "border-[var(--error)]" : "border-[var(--border)]"
                    }`}
                  />
                  {errors.inquiry && (
                    <p id="contact-inquiry-error" role="alert" className="mt-1.5 text-[12.5px] font-medium text-[var(--error)]">
                      {errors.inquiry}
                    </p>
                  )}
                </div>

                {/* Honeypot: visually hidden and unreachable by keyboard, so real
                    visitors never see or fill it — bots that auto-fill every
                    field do, and that's how we know. */}
                <div className="absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
                  <label htmlFor="contact-company">Company</label>
                  <input
                    id="contact-company"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                <div className="mt-1 flex items-center gap-3.5">
                  <button type="submit" disabled={status === "submitting"} className="btn btn-primary btn-md px-6">
                    {status === "submitting" ? "Sending…" : "Send message"}
                  </button>
                  {status === "error" && (
                    <span role="alert" className="text-[13.5px] font-medium text-[var(--error)]">
                      Something went wrong — please try again.
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="h-fit rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)]">
            <h3 className="text-[15px] font-bold">Contact Details</h3>

            <div className="mt-5 flex items-start gap-3.5">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--r-default)] bg-[var(--teal-tint)] text-[var(--teal-dark)]">
                <PhoneIcon />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--slate-soft)]">Call us</div>
                <div className="mt-0.5 text-[14.5px] font-medium">
                  <a href="tel:+94771932264" className="text-[var(--navy)] no-underline hover:text-[var(--teal-dark)]">
                    077 193 2264
                  </a>
                  <span className="mx-1.5 text-[var(--border)]">/</span>
                  <a href="tel:+94725630734" className="text-[var(--navy)] no-underline hover:text-[var(--teal-dark)]">
                    072 563 0734
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3.5">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--r-default)] bg-[#dcfce7] text-[#1da851]">
                <WhatsAppIcon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--slate-soft)]">WhatsApp</div>
                <div className="mt-0.5 text-[14.5px] font-medium">
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--navy)] no-underline hover:text-[var(--teal-dark)]"
                  >
                    072 563 0734
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-5.5 border-t border-[var(--border)] pt-4.5 text-[13px] text-[var(--slate)]">
              Colombo, Sri Lanka
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
