import React from "react";

export default function TodayPage(): React.JSX.Element {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Today's Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-slate-300 p-4">
          <h3 className="text-sm text-slate-500">Appointments Today</h3>
          <p className="text-3xl font-semibold text-slate-900">0</p>
          <p className="text-slate-400 text-xs">Total</p>
        </div>
        <div className="rounded-lg border border-slate-300 p-4">
          <h3 className="text-sm text-slate-500">Revenue</h3>
          <p className="text-3xl font-semibold text-slate-900">0</p>
          <p className="text-slate-400 text-xs">LKR</p>
        </div>
        <div className="rounded-lg border border-slate-300 p-4">
          <h3 className="text-sm text-slate-500">Checked In</h3>
          <p className="text-3xl font-semibold text-slate-900">0</p>
          <p className="text-slate-400 text-xs">Appointments</p>
        </div>
        <div className="rounded-lg border border-slate-300 p-4">
          <h3 className="text-sm text-slate-500">Outstanding</h3>
          <p className="text-3xl font-semibold text-slate-900">0</p>
          <p className="text-slate-400 text-xs">LKR</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-slate-600">Recent Appointments</h3>
          <p className="text-slate-400 text-sm">No appointments scheduled for today</p>
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-600">Quick Actions</h3>
          <ul className="list-disc list-inside space-y-2 text-slate-500">
            <li>Add new appointment</li>
            <li>View day schedule</li>
            <li>Check in customer</li>
            <li>Mark as no-show</li>
          </ul>
        </div>
      </div>
    </main>
  );
}