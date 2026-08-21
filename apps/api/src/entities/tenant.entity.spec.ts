import { withDefaults } from "./tenant.entity";

/**
 * Regression coverage for a bug found while testing the attendance feature:
 * a tenant provisioned before `attendanceGraceMinutes` existed has a stored
 * settings blob that simply lacks the key. Read as plain JS, that made
 * `lateMinutesFor` compute `NaN` — which Postgres then refused to write to an
 * integer column — and, worse, made `discountCapPercent`'s authorization
 * check silently never trigger (`share > undefined` is always `false`).
 */
describe("Tenant.settings withDefaults", () => {
  it("fills in a field entirely absent from an old tenant's stored blob", () => {
    const stored = { advanceRule: "NO_ADVANCE" } as never;
    const resolved = withDefaults(stored);
    expect(resolved.attendanceGraceMinutes).toBe(10);
    expect(resolved.earlyDepartureGraceMinutes).toBe(10);
    expect(resolved.discountCapPercent).toBe(10);
  });

  it("never lets a stored field win over a default with undefined", () => {
    // A spread of `{ ...raw }` where `raw.attendanceGraceMinutes` is
    // explicitly `undefined` still shadows the default unless the merge
    // order accounts for it — this pins that the *values actually present*
    // in a legacy blob are preserved, not silently reset.
    const stored = { attendanceGraceMinutes: 5 } as never;
    expect(withDefaults(stored).attendanceGraceMinutes).toBe(5);
  });

  it("merges cancellationPolicy field-by-field rather than replacing it whole", () => {
    const stored = {
      cancellationPolicy: { selfServiceCutoffHours: 4 },
    } as never;
    const resolved = withDefaults(stored);
    expect(resolved.cancellationPolicy.selfServiceCutoffHours).toBe(4);
    // The other three fields of the policy came from the default, not from
    // an absent key on the partial stored object.
    expect(resolved.cancellationPolicy.refundPercentBeforeCutoff).toBe(100);
    expect(resolved.cancellationPolicy.refundPercentAfterCutoff).toBe(0);
    expect(resolved.cancellationPolicy.noShowRefundPercent).toBe(0);
  });

  it("handles a genuinely empty blob — the literal '{}' every tenant row defaults to", () => {
    const resolved = withDefaults({});
    expect(resolved.attendanceGraceMinutes).toBe(10);
    expect(resolved.bookingWindowDays).toBe(30);
  });

  it("handles null and undefined the same as an empty blob", () => {
    expect(withDefaults(null).attendanceGraceMinutes).toBe(10);
    expect(withDefaults(undefined).attendanceGraceMinutes).toBe(10);
  });
});
