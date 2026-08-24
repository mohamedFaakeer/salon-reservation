import { Injectable } from "@nestjs/common";
import Handlebars from "handlebars";
import { NotificationChannel } from "@salon/shared";

type NotificationChannelString = "console" | "email" | "sms" | "whatsapp";

/**
 * Central registry of all variables available in notification templates.
 * Each variable has:
 * - key: the Handlebars variable name (e.g., "customerName")
 * - description: human-readable description for the variable picker UI
 * - example: example value for preview
 * - channels: which channels this variable is valid for
 * - required: whether the variable is required (used for validation)
 */
export interface TemplateVariable {
  key: string;
  description: string;
  example: string;
  channels: NotificationChannelString[];
  required?: boolean;
}

/**
 * Context object passed to Handlebars for rendering.
 * Contains all available variables with their resolved values.
 */
export interface TemplateContext {
  // Customer
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  
  // Appointment
  appointmentDate: string;
  appointmentTime: string;
  appointmentDateTime: string;
  appointmentTimezone: string;
  staffName: string;
  serviceNames: string;
  bookingReference: string;
  cancelUrl?: string;
  rescheduleUrl?: string;
  
  // Salon
  salonName: string;
  salonPhone?: string;
  salonEmail?: string;
  salonAddress?: string;
  
  // Transaction
  totalAmount?: string;
  paymentMethod?: string;
  
  // Gift Card
  giftCardCode?: string;
  giftCardBalance?: string;
  
  // Package
  packageName?: string;
  packageSessionsRemaining?: string;
  
  // Review/Feedback
  reviewUrl?: string;
  
  // Custom
  [key: string]: string | undefined;
}

/**
 * Result of template rendering.
 */
export interface RenderResult {
  subject: string | null;
  body: string;
  usedVariables: string[];
  missingRequiredVariables: string[];
}

/**
 * Template rendering service using Handlebars.
 * Provides variable registry, validation, and rendering for all channels.
 */
@Injectable()
export class TemplateRendererService {
  private readonly variableRegistry: Map<string, TemplateVariable> = new Map();

  constructor() {
    this.registerDefaultVariables();
    this.registerDefaultHelpers();
  }

  /**
   * Register all default template variables with metadata.
   * This registry powers the variable picker in the admin UI.
   */
  private registerDefaultVariables(): void {
    const variables: TemplateVariable[] = [
      // Customer variables
      {
        key: "customerName",
        description: "Customer's full name",
        example: "Jane Doe",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "customerEmail",
        description: "Customer's email address",
        example: "jane@example.com",
        channels: ["email"],
      },
      {
        key: "customerPhone",
        description: "Customer's phone number",
        example: "+94 77 123 4567",
        channels: ["sms", "whatsapp"],
      },

      // Appointment variables
      {
        key: "appointmentDate",
        description: "Appointment date (formatted)",
        example: "December 15, 2024",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "appointmentTime",
        description: "Appointment time (formatted)",
        example: "2:30 PM",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "appointmentDateTime",
        description: "Full appointment date and time",
        example: "December 15, 2024 at 2:30 PM",
        channels: ["console", "email", "sms", "whatsapp"],
      },
      {
        key: "appointmentTimezone",
        description: "Appointment timezone",
        example: "Asia/Colombo",
        channels: ["console", "email"],
      },
      {
        key: "staffName",
        description: "Assigned staff member's name",
        example: "Sarah Smith",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "serviceNames",
        description: "Comma-separated list of service names",
        example: "Haircut, Color, Treatment",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "bookingReference",
        description: "Unique booking reference code",
        example: "BK-20241215-0042",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "cancelUrl",
        description: "URL for customer to cancel appointment",
        example: "https://salon.example.com/cancel/BK-20241215-0042",
        channels: ["email"],
      },
      {
        key: "rescheduleUrl",
        description: "URL for customer to reschedule appointment",
        example: "https://salon.example.com/reschedule/BK-20241215-0042",
        channels: ["email"],
      },

      // Salon variables
      {
        key: "salonName",
        description: "Salon business name",
        example: "Elegance Salon & Spa",
        channels: ["console", "email", "sms", "whatsapp"],
        required: true,
      },
      {
        key: "salonPhone",
        description: "Salon contact phone",
        example: "+94 11 234 5678",
        channels: ["console", "email", "sms", "whatsapp"],
      },
      {
        key: "salonEmail",
        description: "Salon contact email",
        example: "hello@elegancesalon.lk",
        channels: ["email"],
      },
      {
        key: "salonAddress",
        description: "Salon physical address",
        example: "123 Galle Road, Colombo 03",
        channels: ["console", "email"],
      },

      // Transaction variables
      {
        key: "totalAmount",
        description: "Total amount charged (formatted)",
        example: "LKR 5,500.00",
        channels: ["console", "email", "sms", "whatsapp"],
      },
      {
        key: "paymentMethod",
        description: "Payment method used",
        example: "Card ending in 4242",
        channels: ["console", "email"],
      },

      // Gift Card variables
      {
        key: "giftCardCode",
        description: "Gift card code",
        example: "GC-ABCD-1234",
        channels: ["console", "email", "sms", "whatsapp"],
      },
      {
        key: "giftCardBalance",
        description: "Gift card remaining balance",
        example: "LKR 5,000.00",
        channels: ["console", "email", "sms", "whatsapp"],
      },

      // Package variables
      {
        key: "packageName",
        description: "Service package name",
        example: "Bridal Package - 6 Sessions",
        channels: ["console", "email", "sms", "whatsapp"],
      },
      {
        key: "packageSessionsRemaining",
        description: "Remaining sessions in package",
        example: "5",
        channels: ["console", "email", "sms", "whatsapp"],
      },

      // Review/Feedback
      {
        key: "reviewUrl",
        description: "URL for leaving a review",
        example: "https://salon.example.com/review/BK-20241215-0042",
        channels: ["email"],
      },
    ];

    for (const variable of variables) {
      this.variableRegistry.set(variable.key, variable);
    }
  }

  /**
   * Register Handlebars helpers for common formatting needs.
   */
  private registerDefaultHelpers(): void {
    // Format currency
    Handlebars.registerHelper("formatCurrency", (amount: number | string, currency: unknown) => {
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      if (isNaN(num)) return amount;
      const curr = typeof currency === "string" ? currency : "LKR";
      return new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: curr,
        minimumFractionDigits: 2,
      }).format(num);
    });

    // Format date
    Handlebars.registerHelper("formatDate", (date: Date | string, options?: unknown) => {
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return date;
      const format = options && typeof options === "object" && "hash" in options && (options as { hash?: { format?: "short" | "medium" | "long" } }).hash?.format
        ? (options as { hash: { format: "short" | "medium" | "long" } }).hash.format
        : "medium";
      return d.toLocaleDateString("en-LK", {
        dateStyle: format,
        timeZone: "Asia/Colombo",
      });
    });

    // Format time
    Handlebars.registerHelper("formatTime", (date: Date | string, options?: unknown) => {
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return date;
      const format = options && typeof options === "object" && "hash" in options && (options as { hash?: { format?: "short" | "medium" } }).hash?.format
        ? (options as { hash: { format: "short" | "medium" } }).hash.format
        : "short";
      return d.toLocaleTimeString("en-LK", {
        timeStyle: format,
        timeZone: "Asia/Colombo",
      });
    });

    // Conditional helper
    Handlebars.registerHelper("ifEquals", function (this: unknown, arg1: unknown, arg2: unknown, options: Handlebars.HelperOptions) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("unlessEquals", function (this: unknown, arg1: unknown, arg2: unknown, options: Handlebars.HelperOptions) {
      return arg1 !== arg2 ? options.fn(this) : options.inverse(this);
    });

    // Truncate text
    Handlebars.registerHelper("truncate", (text: string, length: number) => {
      if (!text || typeof length !== "number" || text.length <= length) return text;
      return text.slice(0, length - 3) + "...";
    });

    // Join array
    Handlebars.registerHelper("join", (array: string[], separator: unknown) => {
      if (!Array.isArray(array)) return array;
      const sep = typeof separator === "string" ? separator : ", ";
      return array.join(sep);
    });

    // Default value
    Handlebars.registerHelper("default", (value: string | undefined, defaultValue: string) => {
      return value ?? (typeof defaultValue === "string" ? defaultValue : "");
    });
  }

  /**
   * Get all registered variables, optionally filtered by channel.
   */
  getVariables(channel?: NotificationChannel): TemplateVariable[] {
    const variables = Array.from(this.variableRegistry.values());
    if (channel) {
      const channelStr = channel as NotificationChannelString;
      return variables.filter((v) => v.channels.includes(channelStr));
    }
    return variables;
  }

  /**
   * Get a specific variable by key.
   */
  getVariable(key: string): TemplateVariable | undefined {
    return this.variableRegistry.get(key);
  }

  /**
   * Validate that all required variables for a channel are present in the template.
   * Returns missing required variables.
   */
  validateTemplate(templateBody: string, channel: NotificationChannel): string[] {
    const requiredVars = this.getVariables(channel).filter((v) => v.required);
    const missing: string[] = [];

    for (const variable of requiredVars) {
      const regex = new RegExp(`\\{\\{\\s*${variable.key}\\s*\\}\\}`, "g");
      if (!regex.test(templateBody)) {
        missing.push(variable.key);
      }
    }

    return missing;
  }

  /**
   * Extract all Handlebars variables used in a template string.
   */
  extractVariables(template: string): string[] {
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = regex.exec(template)) !== null) {
      const varName = match[1];
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }
    return variables;
  }

  /**
   * Render a template with the given context.
   * Returns subject (null if not applicable for channel), body, used variables, and missing required variables.
   */
  render(
    templateSubject: string | null,
    templateBody: string,
    context: Partial<TemplateContext>,
    channel: NotificationChannel,
  ): RenderResult {
    // Compile templates
    const subjectTemplate = templateSubject ? Handlebars.compile(templateSubject, { noEscape: true }) : null;
    const bodyTemplate = Handlebars.compile(templateBody, { noEscape: true });

    // Prepare full context with defaults
    const fullContext: TemplateContext = {
      customerName: "",
      appointmentDate: "",
      appointmentTime: "",
      appointmentDateTime: "",
      appointmentTimezone: "Asia/Colombo",
      staffName: "",
      serviceNames: "",
      bookingReference: "",
      salonName: "",
      ...context,
    };

    // Render
    const subject = subjectTemplate ? subjectTemplate(fullContext) : null;
    const body = bodyTemplate(fullContext);

    // Track used variables
    const usedVariables = [
      ...this.extractVariables(templateSubject || ""),
      ...this.extractVariables(templateBody),
    ];

    // Check missing required variables
    const missingRequiredVariables = this.validateTemplate(templateBody, channel);
    if (subjectTemplate && templateSubject) {
      missingRequiredVariables.push(...this.validateTemplate(templateSubject, channel));
    }

    return {
      subject: subject?.trim() || null,
      body: body.trim(),
      usedVariables: [...new Set(usedVariables)],
      missingRequiredVariables: [...new Set(missingRequiredVariables)],
    };
  }

  /**
   * Render a template for preview with example data.
   */
  renderPreview(
    templateSubject: string | null,
    templateBody: string,
    channel: NotificationChannel,
    overrides: Partial<TemplateContext> = {},
  ): RenderResult {
    const exampleContext: TemplateContext = {
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhone: "+94 77 123 4567",
      appointmentDate: "December 15, 2024",
      appointmentTime: "2:30 PM",
      appointmentDateTime: "December 15, 2024 at 2:30 PM",
      appointmentTimezone: "Asia/Colombo",
      staffName: "Sarah Smith",
      serviceNames: "Haircut, Color",
      bookingReference: "BK-20241215-0042",
      cancelUrl: "https://salon.example.com/cancel/BK-20241215-0042",
      rescheduleUrl: "https://salon.example.com/reschedule/BK-20241215-0042",
      salonName: "Elegance Salon & Spa",
      salonPhone: "+94 11 234 5678",
      salonEmail: "hello@elegancesalon.lk",
      salonAddress: "123 Galle Road, Colombo 03",
      totalAmount: "LKR 5,500.00",
      paymentMethod: "Card ending in 4242",
      giftCardCode: "GC-ABCD-1234",
      giftCardBalance: "LKR 5,000.00",
      packageName: "Bridal Package - 6 Sessions",
      packageSessionsRemaining: "5",
      reviewUrl: "https://salon.example.com/review/BK-20241215-0042",
      ...overrides,
    };

    return this.render(templateSubject, templateBody, exampleContext, channel);
  }

  /**
   * Register a custom variable (for tenant-specific extensions).
   */
  registerVariable(variable: TemplateVariable): void {
    this.variableRegistry.set(variable.key, variable);
  }

  /**
   * Register a custom Handlebars helper.
   */
  registerHelper(name: string, helper: Handlebars.HelperDelegate): void {
    Handlebars.registerHelper(name, helper);
  }
}