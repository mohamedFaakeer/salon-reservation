"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiRequestError,
  createTag,
  deleteTag,
  fetchTags,
  updateTag,
  type TagRecord,
} from "../lib/api-client";
import { canManageCustomerTags } from "../lib/permissions";
import { useAuth } from "../context/auth-context";
import { errorCopy } from "../lib/error-copy";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";

const FALLBACK_COLOR = "#64748b"; // slate-500 — an uncoloured tag still reads as a tag, not an error state.

/**
 * Select existing tags or create a new one inline. No precedent for this
 * shape exists elsewhere in the app (`ServiceCombobox` only picks from a
 * fixed list) — genuinely new. Creating a tag (not just applying one) and
 * the "Manage tags" entry are both hidden for anyone without
 * `MANAGE_CUSTOMER_TAGS`; a RECEPTIONIST can still apply any existing tag.
 */
export function TagMultiselect({
  selected,
  onChange,
}: {
  selected: TagRecord[];
  onChange: (tags: TagRecord[]) => void;
}) {
  const { user } = useAuth();
  const canManage = canManageCustomerTags(user?.roles ?? []);
  const [allTags, setAllTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    void loadTags();
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function loadTags(): Promise<void> {
    try {
      setAllTags(await fetchTags());
    } catch {
      // The picker still works with whatever's already selected; a failed
      // background refresh of the full list isn't worth an error toast.
    }
  }

  const selectedIds = new Set(selected.map((t) => t.id));
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTags
      .filter((t) => !selectedIds.has(t.id))
      .filter((t) => !q || t.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allTags, query, selected]);

  const exactMatch = allTags.some((t) => t.label.toLowerCase() === query.trim().toLowerCase());
  const canOfferCreate = canManage && query.trim().length > 0 && !exactMatch;

  function addTag(tag: TagRecord): void {
    onChange([...selected, tag]);
    setQuery("");
  }

  function removeTag(id: string): void {
    onChange(selected.filter((t) => t.id !== id));
  }

  async function handleCreate(): Promise<void> {
    const label = query.trim();
    if (!label) return;
    setCreating(true);
    setError(null);
    try {
      const tag = await createTag({ label });
      setAllTags((prev) => [...prev, tag]);
      addTag(tag);
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">Tags</span>
      <div ref={boxRef} className="relative">
        <div
          className="flex min-h-11 flex-wrap items-center gap-1.5 rounded border border-slate-300 bg-white p-2"
          onClick={() => setOpen(true)}
        >
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: tag.color ?? FALLBACK_COLOR }}
            >
              {tag.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag.id);
                }}
                aria-label={`Remove ${tag.label}`}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px] leading-none hover:bg-white/40"
              >
                ×
              </button>
            </span>
          ))}
          <input
            data-testid="tag-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? "Search or create a tag…" : ""}
            className="min-w-[8rem] flex-1 border-0 p-1 text-sm outline-none"
          />
        </div>

        {open ? (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
            {suggestions.length === 0 && !canOfferCreate ? (
              <p className="px-2 py-2 text-xs text-slate-500">
                {allTags.length === 0 ? "No tags yet." : "No matching tags."}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {suggestions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    data-testid={`tag-suggestion-${tag.id}`}
                    onClick={() => addTag(tag)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color ?? FALLBACK_COLOR }}
                    />
                    {tag.label}
                  </button>
                ))}
                {canOfferCreate ? (
                  <button
                    type="button"
                    data-testid="tag-create-new"
                    onClick={() => void handleCreate()}
                    disabled={creating}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                  >
                    <BusyLabel busy={creating} busyText="Creating…">
                      + Create "{query.trim()}"
                    </BusyLabel>
                  </button>
                ) : null}
              </div>
            )}
            {canManage ? (
              <button
                type="button"
                data-testid="tag-manage-open"
                onClick={() => setManaging(true)}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-slate-100 px-2 py-2 text-left text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                <GearIcon /> Manage tags
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {managing ? (
        <TagManagePanel
          tags={allTags}
          onClose={() => setManaging(false)}
          onChanged={(tags) => {
            setAllTags(tags);
            // A renamed/deleted tag must stay consistent with whatever's
            // already selected on this form, not silently drift from it.
            onChange(selected.map((s) => tags.find((t) => t.id === s.id)).filter((t): t is TagRecord => !!t));
          }}
        />
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

/** Rename or delete tag definitions. Only ever rendered for OWNER/MANAGER — the "Manage tags" trigger that opens it is itself permission-gated. */
function TagManagePanel({
  tags,
  onClose,
  onChanged,
}: {
  tags: TagRecord[];
  onClose: () => void;
  onChanged: (tags: TagRecord[]) => void;
}) {
  const [rows, setRows] = useState(tags);
  const [newLabel, setNewLabel] = useState("");
  const [busyId, setBusyId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function rename(id: string, label: string): Promise<void> {
    if (!label.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      const updated = await updateTag(id, { label: label.trim() });
      const next = rows.map((t) => (t.id === id ? updated : t));
      setRows(next);
      onChanged(next);
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await deleteTag(id);
      const next = rows.filter((t) => t.id !== id);
      setRows(next);
      onChanged(next);
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  async function create(): Promise<void> {
    if (!newLabel.trim()) return;
    setBusyId("new");
    setError(null);
    try {
      const tag = await createTag({ label: newLabel.trim() });
      const next = [...rows, tag];
      setRows(next);
      onChanged(next);
      setNewLabel("");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const copy = errorCopy(err);
        setError(copy.title);
        toast.error(copy.title, copy.detail);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="motion-rise w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Manage tags</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded text-slate-500 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {rows.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? FALLBACK_COLOR }} />
              <input
                defaultValue={tag.label}
                onBlur={(e) => e.target.value.trim() !== tag.label && void rename(tag.id, e.target.value)}
                disabled={busyId === tag.id}
                className="flex-1 rounded px-1.5 py-1 text-sm focus:bg-slate-50 focus:outline-none"
              />
              <button
                type="button"
                data-testid={`tag-delete-${tag.id}`}
                onClick={() => void remove(tag.id)}
                disabled={busyId === tag.id}
                aria-label={`Delete ${tag.label}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New tag name…"
            className="min-h-10 flex-1 rounded border border-slate-300 px-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={busyId === "new" || !newLabel.trim()}
            className="min-h-10 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <BusyLabel busy={busyId === "new"} busyText="Adding…">
              Add
            </BusyLabel>
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
