"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { AppointmentRecord, StaffMember } from "../lib/api-client";
import { formatPriceCents, formatTime, statusStyle } from "../lib/format";
import { EmptyState } from "./empty-state";
import { Spinner } from "./spinner";

/** Default 08:00–20:00 window when there are no appointments to derive from. */
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 20 * 60;
const PX_PER_MIN = 1;
const FALLBACK_STAFF_COLOR = "#0D9488";

/**
 * Statuses that still occupy a real slot on the board — used only for the
 * drag-time "busy then" hint below, a presentational nudge, never the
 * authority on whether a drop is allowed. CANCELLED/NO_SHOW/EXPIRED/
 * RESCHEDULED have all freed their time and shouldn't shade a column as busy.
 */
const OCCUPYING_STATUSES = new Set(["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED"]);

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The day board — also the drag-and-drop surface for reassigning a
 * CONFIRMED appointment to another stylist (DECISIONS.md).
 *
 * The drop itself decides nothing: `onReassign` hands the appointment and
 * target stylist straight to the existing `rescheduleAppointment` engine,
 * which re-runs the full qualification/conflict check server-side exactly
 * as it would for a typed reschedule (CLAUDE.md — availability is never
 * computed on the frontend). The one client-side hint here — shading a
 * column "busy then" while dragging — reads only the appointments already
 * loaded for this board; it is not a qualification check and never blocks
 * a drop, it just saves a receptionist an obviously-doomed attempt.
 */
export function DayCalendar({
  appointments,
  staff,
  onSelect,
  onReassign,
  canReassign = false,
  reassigningId = null,
}: {
  appointments: AppointmentRecord[];
  staff: StaffMember[];
  onSelect: (id: string) => void;
  /** Fired when a CONFIRMED card is dropped on a different stylist's column. */
  onReassign?: (appointmentId: string, newStaffId: string) => void;
  /** Whether dragging is enabled at all — the board is read-only without it. */
  canReassign?: boolean;
  /** The appointment currently being reassigned server-side — dimmed with a spinner until the board reloads. */
  reassigningId?: string | null;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // A small activation distance so an ordinary tap/click still opens the
  // detail drawer — only a deliberate press-and-move starts a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStaff = new Map<string, AppointmentRecord[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staffId) ?? [];
    list.push(appt);
    byStaff.set(appt.staffId, list);
  }

  // Only staff with something on today's board get a column — a tenant can
  // accumulate far more staff rows over time than are actually working (or
  // ever worked) any given day, and rendering one column per staff row
  // regardless makes the grid unusably wide.
  const workingStaff = staff.filter((s) => byStaff.has(s.id));

  if (workingStaff.length === 0) {
    return <EmptyState title="No staff scheduled on today's board yet." />;
  }

  // Derive the visible window from the appointments themselves, so a booking
  // at 07:00 or 21:00 is never hidden by a hardcoded 08:00–20:00 frame.
  // Pad by 30 minutes so cards at the edges don't sit flush against the axis.
  const allTimes = appointments.flatMap((a) => [minutesOfDay(a.startTime), minutesOfDay(a.endTime)]);
  const dayStartMin = allTimes.length > 0 ? Math.max(0, Math.min(...allTimes) - 30) : DEFAULT_START_MIN;
  const dayEndMin = allTimes.length > 0 ? Math.min(1439, Math.max(...allTimes) + 30) : DEFAULT_END_MIN;
  const hours = Array.from(
    { length: Math.ceil((dayEndMin - dayStartMin) / 60) },
    (_, i) => Math.floor(dayStartMin / 60) + i,
  );

  const gridHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;

  const draggingAppt = draggingId ? (appointments.find((a) => a.id === draggingId) ?? null) : null;
  const draggingStart = draggingAppt ? minutesOfDay(draggingAppt.startTime) : null;
  const draggingEnd = draggingAppt ? minutesOfDay(draggingAppt.endTime) : null;

  function handleDragEnd(event: DragEndEvent): void {
    const appointmentId = String(event.active.id);
    setDraggingId(null);
    const targetStaffId = event.over?.id ? String(event.over.id) : null;
    if (!targetStaffId) {
      return;
    }
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt || appt.staffId === targetStaffId) {
      // Dropped back on its own column — nothing changed.
      return;
    }
    onReassign?.(appointmentId, targetStaffId);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="motion-fade flex overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="w-14 shrink-0 border-r border-slate-200">
          <div className="h-10 border-b border-slate-200" />
          <div style={{ height: gridHeight }} className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 -translate-y-1/2 px-1 text-right text-xs text-slate-500"
                style={{ top: (h * 60 - dayStartMin) * PX_PER_MIN }}
              >
                {h.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {workingStaff.map((s) => {
          const staffAppointments = byStaff.get(s.id) ?? [];
          const isSourceColumn = draggingAppt?.staffId === s.id;
          const isBusyAtDragTime =
            draggingAppt !== null &&
            !isSourceColumn &&
            staffAppointments.some(
              (other) =>
                OCCUPYING_STATUSES.has(other.status) &&
                overlaps(draggingStart!, draggingEnd!, minutesOfDay(other.startTime), minutesOfDay(other.endTime)),
            );
          return (
            <StaffColumn
              key={s.id}
              staffMember={s}
              appointments={staffAppointments}
              hours={hours}
              dayStartMin={dayStartMin}
              dayEndMin={dayEndMin}
              gridHeight={gridHeight}
              onSelect={onSelect}
              canReassign={canReassign}
              reassigningId={reassigningId}
              isDragActive={draggingAppt !== null}
              isSourceColumn={isSourceColumn}
              isBusyAtDragTime={isBusyAtDragTime}
            />
          );
        })}
      </div>

      <DragOverlay>{draggingAppt ? <DragCardPreview appt={draggingAppt} /> : null}</DragOverlay>
    </DndContext>
  );
}

function StaffColumn({
  staffMember,
  appointments,
  hours,
  dayStartMin,
  dayEndMin,
  gridHeight,
  onSelect,
  canReassign,
  reassigningId,
  isDragActive,
  isSourceColumn,
  isBusyAtDragTime,
}: {
  staffMember: StaffMember;
  appointments: AppointmentRecord[];
  hours: number[];
  dayStartMin: number;
  dayEndMin: number;
  gridHeight: number;
  onSelect: (id: string) => void;
  canReassign: boolean;
  reassigningId: string | null;
  isDragActive: boolean;
  isSourceColumn: boolean;
  isBusyAtDragTime: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: staffMember.id, disabled: !canReassign });
  const showDropHint = canReassign && isDragActive && !isSourceColumn;

  return (
    <div
      ref={setNodeRef}
      data-testid={`calendar-staff-column-${staffMember.id}`}
      className={`min-w-[180px] flex-1 border-r border-slate-200 transition-colors last:border-r-0 ${
        showDropHint ? (isOver ? (isBusyAtDragTime ? "bg-amber-50" : "bg-teal-50") : "bg-slate-50") : ""
      }`}
    >
      <div
        data-testid={`calendar-staff-header-${staffMember.id}`}
        className="flex h-10 items-center gap-2 border-b border-slate-200 px-2 text-sm font-medium text-slate-700"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: staffMember.color ?? FALLBACK_STAFF_COLOR }}
        />
        <span className="truncate">{staffMember.name}</span>
        {showDropHint && isOver && isBusyAtDragTime ? (
          <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            Busy then
          </span>
        ) : null}
      </div>
      <div className="relative" style={{ height: gridHeight }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-b border-slate-100"
            style={{ top: (h * 60 - dayStartMin) * PX_PER_MIN }}
          />
        ))}
        {appointments.map((appt) => (
          <AppointmentCard
            key={appt.id}
            appt={appt}
            dayStartMin={dayStartMin}
            dayEndMin={dayEndMin}
            onSelect={onSelect}
            draggable={canReassign && appt.status === "CONFIRMED"}
            isPending={reassigningId === appt.id}
          />
        ))}
      </div>
    </div>
  );
}

function AppointmentCard({
  appt,
  dayStartMin,
  dayEndMin,
  onSelect,
  draggable,
  isPending,
}: {
  appt: AppointmentRecord;
  dayStartMin: number;
  dayEndMin: number;
  onSelect: (id: string) => void;
  draggable: boolean;
  isPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: appt.id,
    disabled: !draggable || isPending,
  });

  const startMin = Math.min(Math.max(minutesOfDay(appt.startTime), dayStartMin), dayEndMin);
  const endMin = Math.min(Math.max(minutesOfDay(appt.endTime), dayStartMin), dayEndMin);
  const top = (startMin - dayStartMin) * PX_PER_MIN;
  const height = Math.max((endMin - startMin) * PX_PER_MIN, 20);
  const status = statusStyle(appt.status);

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`calendar-card-${appt.id}`}
      onClick={() => onSelect(appt.id)}
      disabled={isPending}
      aria-label={
        draggable
          ? `${formatTime(appt.startTime)} appointment. Drag onto another stylist's column to reassign.`
          : undefined
      }
      {...listeners}
      {...attributes}
      className={`absolute left-1 right-1 overflow-hidden rounded p-1 text-left text-xs shadow-sm transition-shadow hover:shadow-md ${
        draggable ? "touch-none cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-30" : ""}`}
      style={{ top, height, backgroundColor: status.fill, color: status.fg }}
    >
      <p className="truncate font-medium">
        {formatTime(appt.startTime)}{" "}
        {appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}` : appt.bookingReference}
      </p>
      <p className="flex items-center gap-1 truncate">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.accent }} />
        {status.label}
        {appt.balanceCents > 0 ? ` · ${formatPriceCents(appt.balanceCents)} due` : ""}
      </p>
      {isPending ? (
        <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-slate-600">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}

/** The floating clone dnd-kit renders under the pointer while dragging — unclipped by any column's box, unlike moving the source element in place. */
function DragCardPreview({ appt }: { appt: AppointmentRecord }) {
  const status = statusStyle(appt.status);
  return (
    <div
      className="w-40 cursor-grabbing rounded p-1.5 text-left text-xs shadow-xl ring-2 ring-teal-600"
      style={{ backgroundColor: status.fill, color: status.fg }}
    >
      <p className="truncate font-medium">
        {formatTime(appt.startTime)}{" "}
        {appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}` : appt.bookingReference}
      </p>
    </div>
  );
}
