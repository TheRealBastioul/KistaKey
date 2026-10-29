// /legal/:key: the current version of a legal document, readable in any auth
// state (signup links open it in a new tab).
import { LegalKeySchema } from "@repo/types";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Markdown } from "../../components/Markdown";
import { Alert } from "../../components/ui";
import { APP_NAME } from "../../config";
import { useLegalDocuments } from "../../legal/useLegalDocuments";

export function LegalPage() {
  const { key } = useParams();
  const { documents, error } = useLegalDocuments();
  const parsedKey = LegalKeySchema.safeParse(key);
  const doc = parsedKey.success ? documents?.find((d) => d.key === parsedKey.data) : undefined;

  let body: ReactNode;
  if (error) body = <Alert tone="error">{error}</Alert>;
  else if (!documents) body = <p className="text-sm text-muted">Loading…</p>;
  else if (!doc) body = <p className="text-sm">There's no document at this address.</p>;
  else {
    body = (
      <>
        <p className="text-xs text-muted">
          Version {doc.version} · published {new Date(doc.publishedAt).toLocaleDateString()}
        </p>
        <Markdown source={doc.body} />
      </>
    );
  }

  return (
    <article className="flex flex-col gap-4">
      {body}
      <Link to="/" className="text-sm text-accent hover:underline">
        Back to {APP_NAME}
      </Link>
    </article>
  );
}
