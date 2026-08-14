import React from "react";
import { useState } from "react";

export function AdminBookingDrawer(): React.JSX.Element {
  const [customerName, setCustomerName] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBook = async () => {
    setLoading(true);
    setError(null);
    try {
      // Would call API to create booking
      alert(`Booking created for ${customerName}`);
    } catch (e: any) {
      setError(e.message || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-md">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Book Appointment</h2>

      <div className="mb-4">
        <label className="block text-sm text-slate-600 mb-1">Customer Name</label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Customer name"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-slate-600 mb-1">Services</label>
        <div className="space-y-1">
          <label className="flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedServices.includes("haircut")}
              onChange={(e) => {
                if (e.target.checked) setSelectedServices((prev) => [...prev, "haircut"]);
                else setSelectedServices(prev.filter((s) => s !== "haircut"));
              }}
              className="mr-2"
            />
            <span>Haircut — 30 min, 1500 LKR</span>
          </label>
          <label className="flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedServices.includes("color")}
              onChange={(e) => {
                if (e.target.checked) setSelectedServices((prev) => [...prev, "color"]);
                else setSelectedServices(prev.filter((s) => s !== "color"));
              }}
              className="mr-2"
            />
            <span>Color Treatment — 60 min, 4500 LKR</span>
          </label>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-slate-600 mb-1">Staff</label>
        <select
          value={selectedStaff}
          onChange={(e) => setSelectedStaff(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any staff</option>
          <option value="stylist-1">Senior Stylist</option>
          <option value="stylist-2">Junior Stylist</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-slate-600 mb-1">Preferred Time</label>
        <select
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Any available</option>
          <option value="10:00">10:00 AM</option>
          <option value="14:00">2:00 PM</option>
          <option value="16:00">4:00 PM</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border-l-4 border-red-500 bg-red-50 text-sm">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-primary-500">Creating booking...</p>
      )}

      <button
        onClick={handleBook}
        disabled={loading}
        className="w-full rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white"
      >
        {loading ? "Creating..." : "Book Appointment"}
      </button>
    </main>
  );
}