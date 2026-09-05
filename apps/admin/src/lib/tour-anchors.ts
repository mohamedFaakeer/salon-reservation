/**
 * Single source of truth for `data-tour-id` values.
 *
 * Deliberately separate from `data-testid`: those exist for Playwright and
 * are free to be renamed for testing reasons; these exist for the tour
 * engine and are free to be renamed for product-copy reasons. Importing this
 * object from both the component (`data-tour-id={TOUR_ANCHORS.x.y}`) and the
 * tour step definition that targets it means a typo in either place is a
 * compile error, not a step that silently points at nothing in production.
 *
 * Named by UI concept, not by tour — several tours can and do point at the
 * same element (e.g. the booking drawer's submit button matters to the
 * `bookingCreate` tour today and will matter to others later).
 *
 * A handful of these values are deliberately applied to every row of a list
 * (e.g. `services.toggleServiceButton`, one per service). driver.js resolves
 * an anchor with `document.querySelector`, which returns the first match —
 * for a per-row action that's the first row currently on screen, which is
 * exactly what a tour wants to demonstrate on ("here's how you retire one").
 */
export const TOUR_ANCHORS = {
  today: {
    newBookingButton: "today.new-booking-button",
  },
  bookingDrawer: {
    modeSwitch: "booking-drawer.mode-switch",
    customerField: "booking-drawer.customer-field",
    servicesField: "booking-drawer.services-field",
    staffSelect: "booking-drawer.staff-select",
    dateField: "booking-drawer.date-field",
    timeSlots: "booking-drawer.time-slots",
    submitButton: "booking-drawer.submit-button",
  },
  services: {
    newServiceButton: "services.new-service-button",
    /** Shared by every row's Retire/Restore button — see file-level note. */
    toggleServiceButton: "services.toggle-service-button",
  },
  serviceDrawer: {
    nameField: "service-drawer.name-field",
    durationPriceFields: "service-drawer.duration-price-fields",
    saveButton: "service-drawer.save-button",
  },
  staff: {
    addStaffButton: "staff.add-staff-button",
    teamTab: "staff.team-tab",
    matrixTab: "staff.matrix-tab",
    /** Shared by every row's Deactivate/Restore button — see file-level note. */
    toggleStaffButton: "staff.toggle-staff-button",
    /** Shared by every row's Skills/Assign-skills button. */
    skillsShortcutButton: "staff.skills-shortcut-button",
  },
  staffDrawer: {
    nameField: "staff-drawer.name-field",
    phoneField: "staff-drawer.phone-field",
    saveButton: "staff-drawer.save-button",
  },
  skillsMatrix: {
    /** Shared by every stylist's row in the matrix. */
    row: "skills-matrix.row",
    saveButton: "skills-matrix.save-button",
  },
  team: {
    newTeamButton: "team.new-team-button",
    newLoginCredentials: "team.new-login-credentials",
    /** Shared by every row's role <select>. */
    roleSelect: "team.role-select",
    /** Shared by every row's Reset password button. */
    resetPasswordButton: "team.reset-password-button",
  },
  teamDrawer: {
    nameField: "team-drawer.name-field",
    emailField: "team-drawer.email-field",
    roleFields: "team-drawer.role-fields",
    saveButton: "team-drawer.save-button",
  },
  availability: {
    rotaTab: "availability.rota-tab",
    leaveTab: "availability.leave-tab",
    closuresTab: "availability.closures-tab",
    addLeaveButton: "availability.add-leave-button",
    addClosureButton: "availability.add-closure-button",
    /** Shared by every stylist/weekday cell in the rota grid. */
    rotaCell: "availability.rota-cell",
    /** Shared by every leave row's Remove button. */
    removeLeaveButton: "availability.remove-leave-button",
    /** Shared by every closure row's Remove button. */
    removeClosureButton: "availability.remove-closure-button",
  },
  scheduleDrawer: {
    hoursFields: "schedule-drawer.hours-fields",
    saveButton: "schedule-drawer.save-button",
  },
  leaveDrawer: {
    staffField: "leave-drawer.staff-field",
    datesField: "leave-drawer.dates-field",
    saveButton: "leave-drawer.save-button",
  },
  closureDrawer: {
    nameField: "closure-drawer.name-field",
    datesField: "closure-drawer.dates-field",
    saveButton: "closure-drawer.save-button",
  },
  appointments: {
    /** Shared by every row's date/time link — opens AppointmentDetailDrawer. */
    openRowButton: "appointments.open-row-button",
  },
  appointmentDetail: {
    statusBadge: "appointment-detail.status-badge",
    actionCheckIn: "appointment-detail.action-check-in",
    actionInService: "appointment-detail.action-in-service",
    actionComplete: "appointment-detail.action-complete",
    actionCancel: "appointment-detail.action-cancel",
    cancelReasonField: "appointment-detail.cancel-reason-field",
    confirmCancelButton: "appointment-detail.confirm-cancel-button",
    showAddServiceButton: "appointment-detail.show-add-service-button",
    /** Shared by every option in the add-service picker. */
    addServiceOption: "appointment-detail.add-service-option",
    submitAddServiceButton: "appointment-detail.submit-add-service-button",
    actionReschedule: "appointment-detail.action-reschedule",
    /** Shared by every open-slot option in the reschedule picker. */
    rescheduleSlotOption: "appointment-detail.reschedule-slot-option",
    showRecordPaymentButton: "appointment-detail.show-record-payment-button",
    recordPaymentAmountField: "appointment-detail.record-payment-amount-field",
    recordPaymentMethodField: "appointment-detail.record-payment-method-field",
    recordPaymentTypeField: "appointment-detail.record-payment-type-field",
    submitRecordPaymentButton: "appointment-detail.submit-record-payment-button",
  },
  invoicePanel: {
    root: "invoice-panel.root",
    issueButton: "invoice-panel.issue-button",
    viewButton: "invoice-panel.view-button",
    sendButton: "invoice-panel.send-button",
  },
  attendanceRequests: {
    pendingTab: "attendance-requests.pending-tab",
    /** Shared by every pending request's card. */
    requestCard: "attendance-requests.request-card",
    /** Shared by every card's Approve/Decline button pair. */
    decisionButtons: "attendance-requests.decision-buttons",
  },
  reports: {
    rangeBar: "reports.range-bar",
    takingsPanel: "reports.takings-panel",
    staffPanel: "reports.staff-panel",
    servicesPanel: "reports.services-panel",
    busyHoursPanel: "reports.busy-hours-panel",
  },
  floorRequests: {
    newButton: "floor-requests.new-button",
  },
  floorRequestForm: {
    dayField: "floor-request-form.day-field",
    timeFields: "floor-request-form.time-fields",
    reasonField: "floor-request-form.reason-field",
    sendButton: "floor-request-form.send-button",
  },
  customers: {
    searchField: "customers.search-field",
    addButton: "customers.add-button",
    /** Shared by every row's name link — opens the customer detail page. */
    rowLink: "customers.row-link",
  },
  customerFormDrawer: {
    nameFields: "customer-form-drawer.name-fields",
    phoneField: "customer-form-drawer.phone-field",
    saveButton: "customer-form-drawer.save-button",
  },
  customerDetail: {
    profileCard: "customer-detail.profile-card",
    editButton: "customer-detail.edit-button",
    historyStats: "customer-detail.history-stats",
    bookingHistoryTable: "customer-detail.booking-history-table",
  },
  products: {
    createButton: "products.create-button",
    /** Shared by every row — opens ProductDetailDrawer. */
    rowLink: "products.row-link",
  },
  productDrawer: {
    nameField: "product-drawer.name-field",
    trackingFields: "product-drawer.tracking-fields",
    submitButton: "product-drawer.submit-button",
  },
  productDetailDrawer: {
    variantFields: "product-detail-drawer.variant-fields",
    addVariantButton: "product-detail-drawer.add-variant-button",
  },
  stock: {
    receiveButton: "stock.receive-button",
    adjustButton: "stock.adjust-button",
  },
  stockReceiveDrawer: {
    /** Shared by every batch row (variant + quantity + cost together). */
    batchRow: "stock-receive-drawer.batch-row",
    submitButton: "stock-receive-drawer.submit-button",
  },
  stockAdjustDrawer: {
    directionField: "stock-adjust-drawer.direction-field",
    submitButton: "stock-adjust-drawer.submit-button",
  },
  bundles: {
    createButton: "bundles.create-button",
  },
  bundleDrawer: {
    nameField: "bundle-drawer.name-field",
    componentPicker: "bundle-drawer.component-picker",
    submitButton: "bundle-drawer.submit-button",
  },
  quickSale: {
    searchField: "quick-sale.search-field",
    /** Shared by every product tile in the grid. */
    productTile: "quick-sale.product-tile",
    attachCustomerButton: "quick-sale.attach-customer-button",
    chargeOpenButton: "quick-sale.charge-open-button",
    /** Shared by every payment-method option. */
    chargeMethodOption: "quick-sale.charge-method-option",
    chargeConfirmButton: "quick-sale.charge-confirm-button",
  },
  sales: {
    searchField: "sales.search-field",
    /** Shared by every row — opens the sale detail page. */
    rowLink: "sales.row-link",
  },
  saleDetail: {
    itemsCard: "sale-detail.items-card",
    recordReturnButton: "sale-detail.record-return-button",
  },
} as const;
