import type { SecurityEventAction } from "@salon/shared";

export interface EventExplanation {
  title: string;
  plainLanguage: string;
  recommendedAction: string;
}

export interface SecurityEventFacts {
  action: SecurityEventAction;
  actorName: string | null;
  tenantName: string | null;
  recentCount: number;
  metadata: Record<string, unknown>;
}

/**
 * Translates a raw audit action into something a non-technical super admin
 * can read and act on without knowing what "REFRESH_TOKEN_REUSE_DETECTED"
 * means. Pure and exhaustively testable — see classify-severity.ts's sibling
 * file for why severity is computed the same way.
 */
export function explainSecurityEvent(facts: SecurityEventFacts): EventExplanation {
  const who = facts.actorName ?? "someone";
  const where = facts.tenantName ? ` at ${facts.tenantName}` : "";

  switch (facts.action) {
    case "REFRESH_TOKEN_REUSE_DETECTED":
      return {
        title: "Stolen session detected and blocked",
        plainLanguage: `The system noticed someone trying to reuse an old login session for ${who}${where} — usually a sign a login was leaked or stolen. It has already been blocked automatically and that person was logged out everywhere.`,
        recommendedAction: `Consider asking ${who} to change their password as a precaution.`,
      };
    case "CROSS_TENANT_TOKEN_REJECTED": {
      const reason = typeof facts.metadata.reason === "string" ? facts.metadata.reason : null;
      const reasonText =
        reason === "TENANT_SUSPENDED"
          ? "the salon account is suspended"
          : reason === "TENANT_ACCESS_DENIED"
            ? "that person's access to the salon was removed"
            : "the salon account no longer exists";
      return {
        title: "Blocked access attempt to another salon's data",
        plainLanguage: `A login token tried to access${where || " a salon's"} data, but ${reasonText}. Access was automatically denied — no action was taken on the account.`,
        recommendedAction: "No action needed unless this keeps happening for the same person.",
      };
    }
    case "LOGIN_FAILED":
      if (facts.recentCount >= 5) {
        return {
          title: "Repeated failed logins — possible break-in attempt",
          plainLanguage: `Someone tried the wrong password ${facts.recentCount} times in a short window for ${who}${where}. This looks like someone trying to guess the password rather than a genuine mistake.`,
          recommendedAction: `Consider contacting ${who === "someone" ? "the account holder" : who} to confirm it's really them, or resetting that login's password.`,
        };
      }
      return {
        title: "Wrong password attempt",
        plainLanguage: `Someone tried to log in as ${who}${where} with the wrong password.`,
        recommendedAction: "No action needed unless this repeats.",
      };
    case "ACCOUNT_LOCKED": {
      const attempts = typeof facts.metadata.failedLoginAttempts === "number" ? facts.metadata.failedLoginAttempts : 5;
      return {
        title: "Account locked after repeated failed logins",
        plainLanguage: `${who}${where} entered the wrong password ${attempts} times in a row and is now locked out — nobody can attempt that login again until it's reset.`,
        recommendedAction: `Confirm with ${who === "someone" ? "them" : who} that it was really a forgotten password before resetting it, in case someone else was guessing.`,
      };
    }
    case "TEAM_MEMBER_PASSWORD_RESET": {
      const resetBy = typeof facts.metadata.resetByRole === "string" ? facts.metadata.resetByRole : null;
      const byText = resetBy ? ` by a ${resetBy.toLowerCase()}` : "";
      return {
        title: "A password was reset",
        plainLanguage: `${who}${where}'s password was reset${byText} — a new temporary password was issued and any existing sessions were signed out.`,
        recommendedAction: "No action needed — this is routine, expected remediation.",
      };
    }
    case "RATE_LIMIT_EXCEEDED": {
      const rule = typeof facts.metadata.bucketKey === "string" ? facts.metadata.bucketKey.split(":")[0] : "a feature";
      return {
        title: facts.recentCount >= 5 ? "Unusual, sustained burst of requests" : "Unusually high number of requests",
        plainLanguage: `A visitor sent far more requests than normal to ${rule} in a short time and was automatically slowed down. This is often a bot or script, sometimes just a busy moment.`,
        recommendedAction:
          facts.recentCount >= 5
            ? "Worth a look if this keeps recurring from the same visitor."
            : "No action needed — this is what the automatic protection is for.",
      };
    }
    default:
      return {
        title: "Security event",
        plainLanguage: `A security-related event (${facts.action}) was recorded${where}.`,
        recommendedAction: "Review the technical details below.",
      };
  }
}

export interface ErrorLogFacts {
  statusCode: number;
  code: string;
  path: string;
  tenantName: string | null;
  recentCount: number;
}

export function explainErrorLog(facts: ErrorLogFacts): EventExplanation {
  const where = facts.tenantName ? ` for ${facts.tenantName}` : "";
  if (facts.recentCount >= 10) {
    return {
      title: "A feature is currently broken",
      plainLanguage: `Something has failed ${facts.recentCount} times recently${where} while using ${facts.path} — this isn't a one-off, it's actively affecting people right now.`,
      recommendedAction: "Treat this as urgent — investigate what changed or contact support.",
    };
  }
  if (facts.recentCount >= 3) {
    return {
      title: "A feature has failed more than once",
      plainLanguage: `An error has happened ${facts.recentCount} times recently${where} while using ${facts.path}. Whoever hit it likely saw an error message instead of what they expected.`,
      recommendedAction: "Worth investigating before it happens to more people.",
    };
  }
  return {
    title: "Something went wrong once",
    plainLanguage: `Someone hit an error${where} while using ${facts.path}. They likely saw an error message.`,
    recommendedAction: "No action needed unless this repeats.",
  };
}
