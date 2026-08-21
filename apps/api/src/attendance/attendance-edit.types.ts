import type { AttendanceEditRequestStatus } from "@salon/shared";

export interface AttendanceEditRequestView {
  id: string;
  staffId: string;
  staffName: string;
  workDate: string;
  previousCheckInAt: string | null;
  previousCheckOutAt: string | null;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reason: string;
  status: AttendanceEditRequestStatus;
  requestedByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}
