import React from "react";
import { useParams } from "next/navigation";

export default function DaySchedulePage(): React.JSX.Element {
  const date = useParams<{ date: string }>()?.date || new Date().toISOString().split("T")[0];

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Day Schedule — {date}</h1>
      <p className="text-slate-500 mb-4">Calendar view for {date}</p>
      <div className="border rounded-lg p-4 mb-6">
        <p className="text-slate-400">Day schedule placeholder — will show appointments per staff with status colors.</p>
      </div>
      <p className="text-slate-500">Schedule management features coming in P12.</p>
    </main>
  );
}