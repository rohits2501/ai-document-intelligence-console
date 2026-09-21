import type { ExtractedField } from "./types";

/**
 * Group review fields into labelled sections for the job console, mirroring how the reference
 * editor groups results (Invoice, Seller, Buyer, ...). This is a presentation concern only: it
 * never touches the event/schema contract in `types.ts`. Grouping is derived from field keys.
 */
export interface FieldGroup {
  label: string;
  fields: ExtractedField[];
}

/**
 * Known keys from the default mock/extract set map to curated section labels. Anything not listed
 * falls back to the first `snake_case` token, title-cased (`buyer_gstin` -> "Buyer").
 */
const KNOWN_GROUPS: Record<string, string> = {
  document_type: "Document",
  invoice_number: "Invoice",
  invoice_date: "Invoice",
  vendor_name: "Vendor",
  gstin: "Vendor",
  total_amount: "Totals",
};

function titleCase(token: string): string {
  if (!token) return "Other";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** Resolve the section label for a single field key. */
export function groupLabelForKey(key: string): string {
  const known = KNOWN_GROUPS[key];
  if (known) return known;
  const firstToken = key.split("_")[0] ?? "";
  return titleCase(firstToken);
}

/**
 * Partition fields into groups, preserving first-seen group order (stream order) and arrival order
 * within each group. Every group is returned even if it holds a single field.
 */
export function groupReviewFields(fields: ExtractedField[]): FieldGroup[] {
  const order: string[] = [];
  const byLabel = new Map<string, ExtractedField[]>();

  for (const field of fields) {
    const label = groupLabelForKey(field.key);
    let bucket = byLabel.get(label);
    if (!bucket) {
      bucket = [];
      byLabel.set(label, bucket);
      order.push(label);
    }
    bucket.push(field);
  }

  return order.map((label) => ({ label, fields: byLabel.get(label) ?? [] }));
}
