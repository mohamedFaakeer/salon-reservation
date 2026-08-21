"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/auth-context";
import { isStaffOnly, isSuperAdmin } from "../lib/permissions";

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    } else if (isSuperAdmin(user.roles)) {
      router.replace("/platform");
    } else if (isStaffOnly(user.roles)) {
      router.replace("/floor");
    } else {
      router.replace("/today");
    }
  }, [loading, user, router]);

  return null;
}
