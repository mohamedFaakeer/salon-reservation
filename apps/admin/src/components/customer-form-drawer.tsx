"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  createCustomer,
  fetchTenantSettings,
  lookupCustomerByPhone,
  removeCustomerPhoto,
  updateCustomer,
  updateTenantSettings,
  uploadCustomerPhoto,
  type CustomerDetail,
  type CustomerRecord,
  type ProvinceValue,
  type TagRecord,
} from "../lib/api-client";
import { errorCopy } from "../lib/error-copy";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel, Spinner } from "./spinner";
import { TagMultiselect } from "./tag-multiselect";
import { useToast } from "./toast";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

const BUILT_IN_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr."];
const BUILT_IN_SOURCES = ["Walk-in", "Web app", "Referral"];
const ADD_NEW = "__add_new__";

const PROVINCES: Array<{ value: ProvinceValue; label: string }> = [
  { value: "WESTERN", label: "Western" },
  { value: "CENTRAL", label: "Central" },
  { value: "SOUTHERN", label: "Southern" },
  { value: "NORTHERN", label: "Northern" },
  { value: "EASTERN", label: "Eastern" },
  { value: "NORTH_WESTERN", label: "North Western" },
  { value: "NORTH_CENTRAL", label: "North Central" },
  { value: "UVA", label: "Uva" },
  { value: "SABARAGAMUWA", label: "Sabaragamuwa" },
];

const ACCEPTED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_PHOTO_BYTES = 2_000_000;

/**
 * One component, two modes — the field set, validation, live-phone-lookup
 * behavior, and tag/title/source pickers are identical either way; only the
 * endpoint called, the pre-filled values, and the phone-duplicate-exclude-
 * self behavior differ. Mirrors BookingDrawer's conventions throughout.
 */
export function CustomerFormDrawer({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  /** Required in edit mode; ignored in create mode. */
  initial?: CustomerDetail;
  onClose: () => void;
  onSaved: (customer: CustomerDetail) => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [clientSource, setClientSource] = useState(initial?.clientSource ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [province, setProvince] = useState<ProvinceValue | "">(initial?.province ?? "");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<TagRecord[]>(initial?.tags ?? []);

  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [customSources, setCustomSources] = useState<string[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.profileImageUrl ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [phoneLookup, setPhoneLookup] = useState<{ status: "idle" | "checking" | "ok" | "dup"; match: CustomerRecord | null }>({
    status: "idle",
    match: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    void fetchTenantSettings().then((s) => {
      setCustomTitles(s.customTitleOptions ?? []);
      setCustomSources(s.customClientSourceOptions ?? []);
    });
  }, []);

  // Debounced live duplicate check — proactive, not just a post-submit error.
  useEffect(() => {
    const trimmed = phone.trim();
    if (trimmed.length < 7) {
      setPhoneLookup({ status: "idle", match: null });
      return;
    }
    let stale = false;
    setPhoneLookup((prev) => ({ ...prev, status: "checking" }));
    const timer = setTimeout(() => {
      lookupCustomerByPhone(trimmed)
        .then((match) => {
          if (stale) return;
          // In edit mode, finding the customer being edited is not a duplicate.
          const isSelf = mode === "edit" && match?.id === initial?.id;
          setPhoneLookup(
            match && !isSelf ? { status: "dup", match } : { status: "ok", match: null },
          );
        })
        .catch(() => {
          if (!stale) setPhoneLookup({ status: "idle", match: null });
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [phone, mode, initial?.id]);

  function handlePhotoFile(file: File): void {
    setPhotoError(null);
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("That isn't a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`That file is too large — the limit is ${MAX_PHOTO_BYTES / 1_000_000} MB.`);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function addCustomOption(kind: "title" | "source", value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (kind === "title") {
      const next = [...customTitles, trimmed];
      setCustomTitles(next);
      setTitle(trimmed);
      await updateTenantSettings({ customTitleOptions: next }).catch(() => undefined);
    } else {
      const next = [...customSources, trimmed];
      setCustomSources(next);
      setClientSource(trimmed);
      await updateTenantSettings({ customClientSourceOptions: next }).catch(() => undefined);
    }
  }

  const canSubmit =
    firstName.trim().length >= 1 &&
    lastName.trim().length >= 1 &&
    phone.trim().length >= 5 &&
    phoneLookup.status !== "dup";

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        title: title.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        clientSource: clientSource.trim() || undefined,
        address: address.trim() || undefined,
        province: province || undefined,
        notes: notes.trim() || undefined,
        tagIds: tags.map((t) => t.id),
      };

      let saved: CustomerDetail;
      if (mode === "create") {
        const created = await createCustomer(payload);
        saved = { ...created, notes: null, marketingOptOut: false } as CustomerDetail;
      } else {
        saved = await updateCustomer(initial!.id, {
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
          email: email.trim() || null,
          title: title.trim() || null,
          dateOfBirth: dateOfBirth || null,
          clientSource: clientSource.trim() || null,
          address: address.trim() || null,
          province: province || null,
          tagIds: tags.map((t) => t.id),
        });
      }

      // Photo is a second call, sequenced behind the same Save click — a
      // failure here doesn't roll back the customer record itself, since
      // the record is the important artifact and the photo is not worth
      // blocking on.
      if (photoFile) {
        try {
          saved = await uploadCustomerPhoto(saved.id, photoFile);
        } catch {
          toast.warn("Customer saved", "The photo didn't upload — add it again from the customer's page.");
        }
      }

      toast.success(
        mode === "create" ? "Customer added" : "Customer updated",
        `${saved.firstName} ${saved.lastName}`,
      );
      onSaved(saved);
    } catch (err) {
      const copy = errorCopy(err);
      // A duplicate is a recoverable, expected situation — the amber banner
      // already covers it live; don't also shout it as the generic red error.
      if (err instanceof ApiRequestError && err.code === "DUPLICATE_CUSTOMER") {
        toast.warn(copy.title, copy.detail);
      } else {
        setError(copy.title);
        toast.error(copy.title, copy.detail);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={mode === "create" ? "Add customer" : "Edit customer"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[7rem_1fr] gap-3" data-tour-id={TOUR_ANCHORS.customerFormDrawer.nameFields}>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Title</span>
            <SelectWithAddNew
              value={title}
              builtIn={BUILT_IN_TITLES}
              custom={customTitles}
              placeholder="—"
              onChange={setTitle}
              onAddNew={(v) => void addCustomOption("title", v)}
              testId="customer-title"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">First name</span>
            <input
              data-testid="customer-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Last name</span>
          <input
            data-testid="customer-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm" data-tour-id={TOUR_ANCHORS.customerFormDrawer.phoneField}>
          <span className="font-medium text-slate-700">Mobile number</span>
          <span className="relative flex items-center">
            <input
              data-testid="customer-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={phoneLookup.status === "dup"}
              className="min-h-11 w-full rounded border border-slate-300 px-3 pr-9 text-sm aria-invalid:border-amber-400"
            />
            <span className="absolute right-3 flex items-center">
              {phoneLookup.status === "checking" ? <Spinner /> : null}
              {phoneLookup.status === "ok" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" aria-hidden="true">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              ) : null}
            </span>
          </span>
          {phoneLookup.status === "dup" && phoneLookup.match ? (
            <div role="status" className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
              <p className="font-medium">This number already belongs to a customer</p>
              <p className="mt-0.5">
                {phoneLookup.match.firstName} {phoneLookup.match.lastName} — {phoneLookup.match.phone}
              </p>
            </div>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Email <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="customer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Date of birth <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="customer-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Profile photo <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-slate-300">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M4.5 20c0-3.5 3-6 7.5-6s7.5 2.5 7.5 6" />
                </svg>
              )}
            </span>
            <div className="flex-1">
              <input
                ref={photoInputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES.join(",")}
                data-testid="customer-photo-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoFile(file);
                }}
                className="hidden"
                id="customer-photo-input"
              />
              <div className="flex gap-2">
                <label
                  htmlFor="customer-photo-input"
                  className="min-h-8 cursor-pointer rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {photoPreview ? "Replace" : "Upload photo"}
                </label>
                {photoPreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview(null);
                      if (photoInputRef.current) photoInputRef.current.value = "";
                      if (mode === "edit" && initial?.profileImageUrl) {
                        void removeCustomerPhoto(initial.id).catch(() => undefined);
                      }
                    }}
                    className="min-h-8 rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">PNG, JPEG or WebP, up to 2MB. Saved with this customer.</p>
            </div>
          </div>
          {photoError ? (
            <p role="alert" className="text-xs text-red-600">
              {photoError}
            </p>
          ) : null}
        </div>

        <div className="mt-1 border-t border-slate-200 pt-4 text-[11px] font-bold uppercase tracking-[0.07em] text-slate-400">
          Additional info
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Client source <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <SelectWithAddNew
            value={clientSource}
            builtIn={BUILT_IN_SOURCES}
            custom={customSources}
            placeholder="—"
            onChange={setClientSource}
            onAddNew={(v) => void addCustomOption("source", v)}
            testId="customer-source"
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Address <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="customer-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Province <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <select
            data-testid="customer-province"
            value={province}
            onChange={(e) => setProvince(e.target.value as ProvinceValue | "")}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          >
            <option value="">—</option>
            {PROVINCES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <TagMultiselect selected={tags} onChange={setTags} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Notes <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea
            data-testid="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything staff should know before their next visit"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="customer-save"
            data-tour-id={TOUR_ANCHORS.customerFormDrawer.saveButton}
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText={mode === "create" ? "Adding…" : "Saving…"}>
              {mode === "create" ? "Add customer" : "Save changes"}
            </BusyLabel>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

/** A built-in list plus tenant-custom additions, with a trailing "+ Add new…" that reveals an inline text field rather than a native `prompt()`. */
function SelectWithAddNew({
  value,
  builtIn,
  custom,
  placeholder,
  onChange,
  onAddNew,
  testId,
}: {
  value: string;
  builtIn: string[];
  custom: string[];
  placeholder: string;
  onChange: (value: string) => void;
  onAddNew: (value: string) => void;
  testId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          data-testid={`${testId}-new-input`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddNew(draft);
              setAdding(false);
              setDraft("");
            }
          }}
          className="min-h-11 flex-1 rounded border border-slate-300 px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            onAddNew(draft);
            setAdding(false);
            setDraft("");
          }}
          disabled={!draft.trim()}
          className="min-h-11 rounded border border-teal-300 bg-teal-50 px-3 text-xs font-semibold text-teal-800 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    );
  }

  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      className="min-h-11 rounded border border-slate-300 px-3 text-sm"
    >
      <option value="">{placeholder}</option>
      {builtIn.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      {custom.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      <option value={ADD_NEW}>+ Add new…</option>
    </select>
  );
}
