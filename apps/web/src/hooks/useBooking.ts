import { useState, useEffect, useCallback } from "react";
import {
  fetchSalons,
  fetchSalonProfile,
  checkAvailability,
  createBooking,
  fetchBookingByReference,
  cancelBooking,
  rescheduleBooking,
  type BookingSource,
  type SalonBrief,
  type SalonProfile,
  type AvailabilitySlot,
  type CreateBookingDto,
  type BookingResponse,
  type FindBookingResponse,
} from "../lib/api-client";

export type { BookingSource };

export interface UseAvailabilityResult {
  slots: AvailabilitySlot[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export interface UseBookingResult {
  // Salon
  salons: SalonBrief[];
  setSalon: (slug: string) => Promise<void>;
  salon: SalonProfile | null;
  loadingSalon: boolean;
  salonError: string | null;

  // Availability
  availability: AvailabilitySlot[];
  setAvailability: (slug: string, { serviceIds, staffId, date }: { serviceIds: string[]; staffId?: string; date: string }) => Promise<void>;
  loadingAvailability: boolean;
  availabilityError: string | null;

  // Booking
  bookingReference: string | null;
  holdExpiresAt: string | null;
  paymentIntent: { id: string; amountCents: number; status: "PENDING" | "SUCCEEDED" | "FAILED" } | null;
  setBooking: (reference: string, expiresAt: string, paymentIntent: { id: string; amountCents: number; status: "PENDING" | "SUCCEEDED" | "FAILED" }) => void;
  cancelBooking: (reference: string, phone: string) => Promise<{ ok: boolean; refundCents?: number }>;
  rescheduleBooking: (reference: string, phone: string, newStart: string, newStaffId?: string) => Promise<{ ok: boolean; appointment: FindBookingResponse }>;
  loadingBooking: boolean;
  bookingError: string | null;
}

export function useInitialSalonLoad(): UseBookingResult {
  const [
    salons,
    setSalons,
  ] = useState<SalonBrief[]>([]);
  const [salon, setSalonState] = useState<SalonProfile | null>(null);
  const [loadingSalon, setLoadingSalon] = useState(true);
  const [salonError, setSalonError] = useState<string | null>(null);

  const [availability, setAvailabilityState] = useState<AvailabilitySlot[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [bookingReference, setBookingRef] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAtState] = useState<string | null>(null);
  const [paymentIntent, setPaymentIntentState] = useState<
    | { id: string; amountCents: number; status: "PENDING" | "SUCCEEDED" | "FAILED" }
    | null
  >(null);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Load salons on mount
  useEffect(() => {
    async function loadSalons() {
      try {
        const data = await fetchSalons();
        setSalons(data);
        if (data.length > 0) {
          const first = data[0];
          await setSalonState({ ...first, services: [], staff: [] } as unknown as SalonProfile);
        }
      } catch (err) {
        setSalonError(err instanceof Error ? err.message : "Failed to load salons");
      } finally {
        setLoadingSalon(false);
      }
    }
    loadSalons();
  }, []);

  const setSalon = useCallback(async (slug: string) => {
    setLoadingSalon(true);
    setSalonError(null);
    try {
      const profile = await fetchSalonProfile(slug);
      setSalonState(profile);
    } catch (err) {
      setSalonError(err instanceof Error ? err.message : "Failed to load salon");
    } finally {
      setLoadingSalon(false);
    }
  }, []);

  const setAvailability = useCallback(
    async (slug: string, { serviceIds, staffId, date }: { serviceIds: string[]; staffId?: string; date: string }) => {
      setLoadingAvailability(true);
      setAvailabilityError(null);
      try {
        const slots = await checkAvailability(slug, { serviceIds, staffId, date });
        setAvailabilityState(slots);
      } catch (err) {
        setAvailabilityError(err instanceof Error ? err.message : "Failed to check availability");
      } finally {
        setLoadingAvailability(false);
      }
    },
    []
  );

  const cancelBookingAsync = useCallback(
    async (reference: string, phone: string) => {
      setLoadingBooking(true);
      setBookingError(null);
      try {
        const result = await cancelBooking(reference, { phone });
        return result;
      } catch (err) {
        setBookingError(err instanceof Error ? err.message : "Failed to cancel booking");
        throw err;
      } finally {
        setLoadingBooking(false);
      }
    },
    []
  );

  const rescheduleBookingAsync = useCallback(
    async (
      reference: string,
      phone: string,
      newStart: string,
      newStaffId?: string,
    ) => {
      setLoadingBooking(true);
      setBookingError(null);
      try {
        const result = await rescheduleBooking(reference, { phone, newStaffId, newStart });
        return result;
      } catch (err) {
        setBookingError(err instanceof Error ? err.message : "Failed to reschedule booking");
        throw err;
      } finally {
        setLoadingBooking(false);
      }
    },
    []
  );

  return {
    // Salon
    salons,
    setSalon,
    salon,
    loadingSalon,
    salonError,

    // Availability
    availability,
    setAvailability,
    loadingAvailability,
    availabilityError,

    // Booking
    bookingReference,
    holdExpiresAt,
    paymentIntent,
    setBooking: useCallback(
      (reference: string, expiresAt: string, paymentIntent: {
        id: string;
        amountCents: number;
        status: "PENDING" | "SUCCEEDED" | "FAILED";
      }) => {
        setBookingRef(reference);
        setHoldExpiresAtState(expiresAt);
        setPaymentIntentState(paymentIntent);
      },
      []
    ),
    cancelBooking: cancelBookingAsync,
    rescheduleBooking: rescheduleBookingAsync,
    loadingBooking,
    bookingError,
  };
}