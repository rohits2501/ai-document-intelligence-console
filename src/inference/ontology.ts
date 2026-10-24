/**
 * The one synthetic invoice ontology (spec 0008). The TypeScript engine evaluates these rules in
 * code; the shapes and rule text below are what the local `open-ontologies` binary receives. The
 * two can drift: the committed expected results lock the TypeScript side only.
 */

export const ONTOLOGY_VERSION = "invoice-v1";

export const DOC_NAMESPACE = "http://example.invalid/doc#";
export const SUBJECT_NAMESPACE = "http://example.invalid/id/";
export const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema#";

export const GSTIN_PATTERN_SOURCE = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$";

export const RULE_IDS = {
  required: "SHACL-INV-REQUIRED",
  gstinFormat: "SHACL-GSTIN-FORMAT",
  dateOrder: "RULE-DATE-ORDER",
  totalReconciliation: "RULE-TOTAL-RECONCILIATION",
  approvalTier: "RULE-DERIVE-APPROVAL-TIER",
  gstState: "RULE-DERIVE-GST-STATE",
  provenanceConfidence: "RULE-PROVENANCE-CONFIDENCE",
} as const;

/** `₹1,00,000.00`. At or above this total the derived tier is `senior_signoff`. */
export const SENIOR_SIGNOFF_MIN_PAISE = 10000000n;
export const LOW_CONFIDENCE_CUTOFF = 0.75;
/** One row in Phase 1. Add a prefix only when a later spec names it. */
export const GST_STATE_BY_PREFIX: Readonly<Record<string, string>> = {
  "29": "IN-KA (Karnataka)",
};

export const PREFIXES_TURTLE = `@prefix doc: <${DOC_NAMESPACE}> .
@prefix xsd: <${XSD_NAMESPACE}> .
`;

export const SHAPES_TURTLE = `@prefix doc: <${DOC_NAMESPACE}> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <${XSD_NAMESPACE}> .

# ${RULE_IDS.required}
doc:InvoiceRequiredShape
    a sh:NodeShape ;
    sh:targetSubjectsOf doc:hasDocumentType ;
    sh:property [ sh:path doc:hasInvoiceNumber ; sh:minCount 1 ] ;
    sh:property [ sh:path doc:hasInvoiceDate ; sh:minCount 1 ] ;
    sh:property [ sh:path doc:hasVendorName ; sh:minCount 1 ] ;
    sh:property [ sh:path doc:hasTotalAmountPaise ; sh:minCount 1 ] .

# ${RULE_IDS.gstinFormat}
doc:GstinFormatShape
    a sh:NodeShape ;
    sh:targetSubjectsOf doc:hasVendorGstin ;
    sh:property [
        sh:path doc:hasVendorGstin ;
        sh:pattern "${GSTIN_PATTERN_SOURCE}"
    ] .
`;

export const RULES_TURTLE = `@prefix doc: <${DOC_NAMESPACE}> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <${XSD_NAMESPACE}> .

doc:InvoiceRules
    a sh:NodeShape ;
    sh:targetSubjectsOf doc:hasDocumentType ;

    # ${RULE_IDS.dateOrder}: the due date is strictly before the invoice date.
    sh:rule [
        a sh:SPARQLRule ;
        sh:construct """
            CONSTRUCT { $this doc:hasContradiction "${RULE_IDS.dateOrder}" }
            WHERE { $this doc:hasDueDate ?due ; doc:hasInvoiceDate ?inv . FILTER (?due < ?inv) }
        """
    ] ;

    # ${RULE_IDS.totalReconciliation}: subtotal plus tax differs from the total, in paise.
    sh:rule [
        a sh:SPARQLRule ;
        sh:construct """
            CONSTRUCT { $this doc:hasContradiction "${RULE_IDS.totalReconciliation}" }
            WHERE {
                $this doc:hasSubtotalPaise ?s ; doc:hasTaxAmountPaise ?t ; doc:hasTotalAmountPaise ?total .
                FILTER (xsd:integer(?s) + xsd:integer(?t) != xsd:integer(?total))
            }
        """
    ] ;

    # ${RULE_IDS.approvalTier}: total at or above ${SENIOR_SIGNOFF_MIN_PAISE} paise is senior_signoff.
    sh:rule [
        a sh:SPARQLRule ;
        sh:construct """
            CONSTRUCT { $this doc:hasApprovalTier ?tier }
            WHERE {
                $this doc:hasTotalAmountPaise ?total .
                BIND (IF(xsd:integer(?total) >= ${SENIOR_SIGNOFF_MIN_PAISE}, "senior_signoff", "standard_signoff") AS ?tier)
            }
        """
    ] ;

    # ${RULE_IDS.gstState}: a valid GSTIN with prefix 29 gives IN-KA (Karnataka).
    sh:rule [
        a sh:SPARQLRule ;
        sh:construct """
            CONSTRUCT { $this doc:hasVendorStateCode "IN-KA (Karnataka)" }
            WHERE {
                $this doc:hasVendorGstin ?g .
                FILTER (REGEX(?g, "${GSTIN_PATTERN_SOURCE}") && STRSTARTS(?g, "29"))
            }
        """
    ] .
`;
