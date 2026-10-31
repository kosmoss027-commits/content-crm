"use client";

import { useEffect } from "react";
import { LAST_PROJECT_COOKIE } from "@/lib/constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Запоминает открытый проект, чтобы после следующего входа вернуться в него. */
export function RememberProject({ projectId }: { projectId: string }) {
  useEffect(() => {
    document.cookie = `${LAST_PROJECT_COOKIE}=${encodeURIComponent(projectId)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, [projectId]);
  return null;
}
