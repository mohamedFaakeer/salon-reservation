export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm text-slate-600">{title}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-md border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
