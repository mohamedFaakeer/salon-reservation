import React from "react";
import { useParams } from "next/navigation";
import { fetchBookingByReference, type FindBookingResponse } from "../../lib/api-client";
import { useBooking } from "../../hooks/useBooking";
import { BookingSource } from "../../constants/booking-sources";

export default function BookingReferencePage() {
  const reference = useParams<{ reference: string }>()?.reference || "";
  const phone = useRef<string>("");

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
  } = useInitialSalonLoad();

  useEffect(() => {
    async function loadBooking() {
      if (!reference) return;
      setLoadingSalon(true);
      salonError = null;
      try {
        const result = await fetchBookingByReference(reference, phone.current);
        setBooking(result.reference, result.holdExpiresAt, {
          id: result.payment?.id || "",
          amountCents: result.payment?.amountCents || 0,
          status: result.payment?.status || "PENDING",
        });
      } catch (err) {
        salonError = err instanceof Error ? err.message : "Failed to fetch booking";
      } finally {
        setLoadingSalon(false);
      }
    }
    loadBooking();
  }, [reference, setBooking]);

  if (loadingSalon || !reference) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-slate-500">Loading booking...</p>
      </main>
    );
  }

  if (salonError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-red-500">Error: {salonError}</p>
        <p className="text-sm text-slate-400">
          <a href="/">← Choose salon</a>
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold text-slate-900">
        Booking Reference: {reference}
      </h1>

      {bookingReference && (
        <div className="max-w-3xl w-full space-y-6 p-8 rounded-lg border border-slate-300">
          <div className="rounded-lg border border-slate-300 p-6">
            <h2 className="text-2xl font-semibold text-slate-900">
              Appointment Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-600 mb-6">
              <div>
                <strong>Reference:</strong> {bookingReference}
              </div>
              <div>
                <strong>Status:</strong> {paymentIntent?.status.toLowerCase()}
              </div>
              <div>
                <strong>Hold expires:</strong> {new Date(holdExpiresAt).toLocaleString()}
              </div>
            </div>

            {paymentIntent?.status === "PENDING" && (
              <p className="text-slate-500 text-sm">
                Please complete payment within 10 minutes to confirm your appointment.
              </p>
            )}

            {paymentIntent?.status === "SUCCEEDED" && (
              <div>
                <p className="text-slate-600 mb-2">Customer:</p>
                <p className="font-medium text-slate-800">
                  {salon?.name} appointment confirmed
                </p>
              </div>
            )}

            {/* Actions */}
            {paymentIntent?.status === "PENDING" && (
              <div className="mt-6 p-4 rounded-lg border-t-4 border-primary-500 bg-primary-50">
                <h3 className="font-semibold text-slate-900">Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => cancelBooking(reference, phone.current)}
                    className="w-full rounded bg-red-500 px-4 py-2 text-sm font-medium text-white"
                  >
                    Cancel appointment
                  </button>
                  <button
                    onClick={() => window.location.href = `/`}
                    className="w-full rounded bg-teal-500 px-4 py-2 text-sm font-medium text-white"
                  >
                    Go home
                  </button>
                </div>
              </div>
            )}

            {paymentIntent?.status === "SUCCEEDED" && (
              <div className="mt-6 p-4 rounded-lg border-t-4 border-green-500 bg-green-50">
                <h3 className="font-semibold text-slate-900">Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => rescheduleBooking(reference, phone.current, "", "")}
                    className="w-full rounded bg-teal-500 px-4 py-2 text-sm font-medium text-white"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => window.location.href = `/`}
                    className="w-full rounded bg-teal-500 px-4 py-2 text-sm font-medium text-white"
                  >
                    Go home
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}