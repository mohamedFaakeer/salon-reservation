"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createCustomer,
  searchCustomers,
  type CustomerRecord,
} from "../lib/api-client";
import { EmptyState } from "./empty-state";
import { BusyLabel } from "./spinner";

export function CustomerSearch({ onSelect }: { onSelect: (customer: CustomerRecord) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      searchCustomers(query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">Customer</label>
      <input
        data-testid="customer-search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or phone…"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {loading ? <p className="text-xs text-slate-500">Searching…</p> : null}
      {!loading && query.trim().length >= 2 && results.length === 0 && !showCreate ? (
        <EmptyState
          title={`No customers match "${query.trim()}"`}
          action={{ label: "Create customer", onClick: () => setShowCreate(true) }}
        />
      ) : null}
      {results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded border border-slate-200">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-testid={`customer-result-${c.id}`}
                onClick={() => onSelect(c)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  {c.firstName} {c.lastName}
                </span>
                <span className="text-slate-500">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="self-start text-sm text-teal-700 hover:text-teal-800"
        >
          + New customer
        </button>
      ) : (
        <NewCustomerForm onCreated={onSelect} onCancel={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function NewCustomerForm({
  onCreated,
  onCancel,
}: {
  onCreated: (customer: CustomerRecord) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [existing, setExisting] = useState<CustomerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setExisting(null);
    try {
      const created = await createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "DUPLICATE_CUSTOMER") {
        setExisting((err.details?.existing as CustomerRecord) ?? null);
        setError("A customer with this phone or email already exists.");
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Could not create customer.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 p-3">
      <input
        data-testid="new-customer-first-name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        data-testid="new-customer-last-name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Last name"
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        data-testid="new-customer-phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        data-testid="new-customer-email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {existing ? (
        <button
          type="button"
          data-testid="use-existing-customer"
          onClick={() => onCreated(existing)}
          className="rounded border border-teal-600 px-2 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
        >
          Use existing: {existing.firstName} {existing.lastName} ({existing.phone})
        </button>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="create-customer-submit"
          onClick={() => void handleCreate()}
          disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
          className="flex-1 rounded bg-teal-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <BusyLabel busy={submitting} busyText="Creating…">
            Create
          </BusyLabel>
        </button>
      </div>
    </div>
  );
}
