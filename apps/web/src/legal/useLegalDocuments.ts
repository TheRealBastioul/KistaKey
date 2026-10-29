// The published Terms / Privacy (GET /legal/current), for signup, the legal
// pages and the acceptance gate. `reload` refetches after a version change.
import type { LegalDocument } from "@repo/types";
import { useCallback, useEffect, useState } from "react";
import { legalApi } from "../api/auth";
import { errorMessage } from "../api/client";

export function useLegalDocuments() {
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await legalApi.current();
      setDocuments(res.documents);
      return res.documents;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { documents, error, reload };
}
