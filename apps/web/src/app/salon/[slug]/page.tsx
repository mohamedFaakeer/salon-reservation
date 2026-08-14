import React from "react";
import { useParams } from "next/navigation";
import { SalonProfile } from "../../lib/api-client";
import { useBooking } from "../../hooks/useBooking";
import { BookingSource } from "../../constants/booking-sources";
import { SalonList } from "../../components/salon-list";

export default function SalonPage() {
  const slug = useParams<{ slug: string }>()?.slug || "";
  const {
    salon,
    loadingSalon,
    salonError,
    availability,
    loadingAvailability,
    availabilityError,
    setAvailability,
    bookingReference,
    holdExpiresAt,
    paymentIntent,
    setBooking,
    cancelBooking,
    rescheduleBooking,
  } = useBooking();

  // Override salon with the specific slug
  useEffect(() => {
    async function loadSalon() {
      setLoadingSalon(true);
      salonError = null;
      try {
        const profile = await fetchSalonProfile(slug);
        salon = profile;
        // Also load availability for today
        const today = new Date().toISOString().split("T")[0];
        if (profile.services.length > 0) {
          const firstServiceId = profile.services[0].id;
          await setAvailability(slug, {
            serviceIds: [firstServiceId],
            date: today,
          });
        }
      } catch (err) {
        salonError = err instanceof Error ? err.message : "Failed to load salon";
      } finally {
        setLoadingSalon(false);
      }
    }
    loadSalon();
  }, [slug, setAvailability]);

  if (loadingSalon) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-slate-500">Loading salon...</p>
      </main>
    );
  }

  if (salonError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-red-500">Error: {salonError}</p>
        <p className="text-sm text-slate-400">
          <a href="/">← Choose another salon</a>
        </p>
      </main>
    );
  }

  if (!salon) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-slate-500">No salon found</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <SalonList />

      <div className="max-w-3xl w-full space-y-6">
        <div className="rounded-lg border border-slate-300 p-6">
          <h2 className="text-2xl font-semibold text-slate-900">
            {salon.name}
            {salon.address && <span className="ml-2 text-slate-500">· {salon.address}</span>}
          </h2>

          {/* Hours */}
          {salon.hours.length > 0 && (
            <div className="mt-4 text-sm text-slate-500">
              <strong>Hours:</strong>
              {salon.hours.map((h) => (
                <span key={h.day}> {h.day}: {h.open} - {h.close} </span>
              ))}
            </div>
          )}

          {/* Services grid */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {salon.services.map((service) => (
              <div
                key={service.id}
                className="group rounded border border-slate-300 hover:border-primary-500 p-3 cursor-pointer"
                onClick={() => {}}
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-slate-700">{service.name}</span>
                  <span className="text-primary-600">
                    {service.priceCents / 100}, {service.durationMinutes} min
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Staff selector (any staff for MVP) */}
          {salon.staff.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm text-slate-600 mb-1">
                Staff
                <select className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Any staff</option>
                  {salon.staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Cancellation policy */}
          {salon.cancellationPolicy && (
            <p className="mt-4 text-sm text-slate-500">{salon.cancellationPolicy}</p>
          )}

          {/* Advance rule */}
          {salon.advanceRule && (
            <p className="mt-2 text-sm text-slate-500">{salon.advanceRule}</p>
          )}
        </div>

        {/* Availability section */}
        {availability.length > 0 && (
          <div className="mt-8 p-6 rounded-lg border border-slate-300">
            <h3 className="text-xl font-semibold text-slate-900">Available Slots</h3>
            <p className="text-slate-500 mb-4">
              Showing earliest slots for{" "}
              {salon.services.length > 0 ? salon.services[0].name : "selected service"}
            </p>
            <div className="space-y-2">
              {availability.map((slot, i) => (
                <div
                  key={i}
                  className="p-3 rounded border border-slate-200 hover:border-primary-400 cursor-pointer"
                  onClick={() => {}}
                >
                  <div className="font-medium text-slate-700">
                    {slot.staffName} — {slot.start} to {slot.end}
                  </div>
                  <div className="text-xs text-slate-400">
                    {slot.end} ({slot.duration || "?"} min remaining)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking form */}
        {availability.length > 0 && (
          <div className="mt-8 p-6 rounded-lg border border-slate-300">
            <h3 className="text-xl font-semibold text-slate-900">Book Appointment</h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  First Name
                  <input type="text" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" defaultValue="" />
                </label>
                <label className="block text-sm text-slate-600 mb-1">
                  Last Name
                  <input type="text" name="lastName" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" defaultValue="" />
                </label>
                <label className="block text-sm text-slate-600 mb-1">
                  Phone
                  <input type="tel" name="phone" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" defaultValue="" placeholder="+947X XXX XXXX" />
                </label>
                <label className="block text-sm text-slate-600 mb-1">
                  Email
                  <input type="email" name="email" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" defaultValue="" />
                </label>
                <label className="block text-sm text-slate-600 mb-1">
                  Notes (optional)
                  <textarea name="notes" rows={2} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"></textarea>
                </label>

                <button type="submit" className="w-full rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white">
                  Book Slot
                </button>
              </div>
            </form>

            {/* Booking result display */}
            {bookingReference && (
              <div className="mt-6 p-4 rounded-lg border-t-4 border-primary-500 bg-primary-50">
                <h4 className="font-semibold text-slate-900">Booking Confirmed</h4>
                <p className="text-slate-600 mb-2">Reference: <strong>{bookingReference}</strong></p>
                <p className="text-slate-600 mb-2">Hold expires at: <strong>{new Date(holdExpiresAt).toLocaleString()}</strong></p>
                <p className="text-slate-600">Payment status: <strong>{paymentIntent?.status.toLowerCase()}</strong></p>
                <p className="text-slate-500 text-sm">Please complete payment within 10 minutes to confirm your appointment.</p>
                <button className="mt-3 text-primary-600 underline cursor-pointer text-sm">Manage booking →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}