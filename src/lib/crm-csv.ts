import {
  COMPANY_KINDS,
  COMPANY_STATUSES,
  type CompanyKind,
  type CompanyStatus,
} from "@/types/database";

export const COMPANY_IMPORT_HEADERS = [
  "company_name",
  "website",
  "status",
  "kind",
  "notes",
  "follow_up_at",
  "follow_up_note",
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_title",
  "contact_notes",
  "primary",
] as const;

export const COMPANY_IMPORT_TEMPLATE = `${COMPANY_IMPORT_HEADERS.join(",")}
Acme Ltd,https://acme.com,lead,prospect,Met at a trade show,2026-09-15,Follow up after summer,Jane Smith,jane@acme.com,+44 20 0000 0000,Buying manager,,true
Acme Ltd,,,,,,,Bob Jones,bob@acme.com,+44 20 0000 0001,Finance,,
Northwind,https://northwind.example,contacted,prospect,,,,Priya Patel,priya@northwind.example,,,
`;

const STATUS_VALUES = new Set<CompanyStatus>(
  COMPANY_STATUSES.map((item) => item.value),
);

const KIND_VALUES = new Set<CompanyKind>(
  COMPANY_KINDS.map((item) => item.value),
);

const KIND_ALIASES: Record<string, CompanyKind> = {
  prospect: "prospect",
  lost_opportunity: "lost_opportunity",
  lostopportunity: "lost_opportunity",
  lost: "lost_opportunity",
  customer: "customer",
  client: "customer",
  agency: "agency",
  evangelist: "agency",
  agency_evangelist: "agency",
  another_agency: "agency",
  another_agency_evangelist: "agency",
};

const HEADER_ALIASES: Record<string, (typeof COMPANY_IMPORT_HEADERS)[number]> = {
  company_name: "company_name",
  company: "company_name",
  website: "website",
  url: "website",
  status: "status",
  kind: "kind",
  type: "kind",
  company_type: "kind",
  company_kind: "kind",
  notes: "notes",
  company_notes: "notes",
  follow_up_at: "follow_up_at",
  follow_up: "follow_up_at",
  followup: "follow_up_at",
  follow_up_note: "follow_up_note",
  follow_up_notes: "follow_up_note",
  contact_name: "contact_name",
  contact: "contact_name",
  full_name: "contact_name",
  contact_email: "contact_email",
  email: "contact_email",
  contact_phone: "contact_phone",
  phone: "contact_phone",
  contact_title: "contact_title",
  title: "contact_title",
  job_title: "contact_title",
  contact_notes: "contact_notes",
  primary: "primary",
  is_primary: "primary",
};

export type ImportRowError = { row: number; message: string };

export type ParsedImportContact = {
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  notes: string | null;
  is_primary: boolean;
  row: number;
};

export type ParsedImportCompany = {
  name: string;
  website: string | null;
  status: CompanyStatus;
  kind: CompanyKind;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  contacts: ParsedImportContact[];
};

export type ParsedImport = {
  companies: ParsedImportCompany[];
  errors: ImportRowError[];
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeWebsite(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function parseStatus(raw: string): CompanyStatus | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return "lead";
  const slug = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (STATUS_VALUES.has(slug as CompanyStatus)) {
    return slug as CompanyStatus;
  }
  const byLabel = COMPANY_STATUSES.find(
    (item) => item.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) return byLabel.value;
  return {
    error: `Status must be ${COMPANY_STATUSES.map((item) => item.value).join(", ")}.`,
  };
}

function parseKind(raw: string): CompanyKind | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return "prospect";
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const aliased = KIND_ALIASES[slug];
  if (aliased) return aliased;
  if (KIND_VALUES.has(slug as CompanyKind)) {
    return slug as CompanyKind;
  }
  const byLabel = COMPANY_KINDS.find(
    (item) => item.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) return byLabel.value;
  return {
    error: `Type must be ${COMPANY_KINDS.map((item) => item.value).join(", ")}.`,
  };
}

function parseDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "Follow-up date must be YYYY-MM-DD." } as const;
  }
  return value;
}

function parseEmail(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { error: "Enter a valid email address." } as const;
  }
  return value;
}

function parseBoolean(raw: string) {
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "y";
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function parseCompanyImportCsv(text: string): ParsedImport | { error: string } {
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    return { error: "CSV needs a header row and at least one data row." };
  }

  const headers = records[0].map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const indexes = new Map<(typeof COMPANY_IMPORT_HEADERS)[number], number>();
  headers.forEach((header, index) => {
    const canonical = HEADER_ALIASES[header];
    if (canonical && !indexes.has(canonical)) {
      indexes.set(canonical, index);
    }
  });

  if (!indexes.has("company_name")) {
    return {
      error:
        "CSV must include a company_name column. Download the template for the expected headers.",
    };
  }

  const cell = (record: string[], key: (typeof COMPANY_IMPORT_HEADERS)[number]) => {
    const index = indexes.get(key);
    if (index === undefined) return "";
    return record[index] ?? "";
  };

  const errors: ImportRowError[] = [];
  const companies = new Map<string, ParsedImportCompany>();

  records.slice(1).forEach((record, offset) => {
    const row = offset + 2;
    const name = cell(record, "company_name").trim();
    if (!name) {
      errors.push({ row, message: "company_name is required." });
      return;
    }

    const statusResult = parseStatus(cell(record, "status"));
    if (typeof statusResult === "object") {
      errors.push({ row, message: statusResult.error });
      return;
    }
    const kindResult = parseKind(cell(record, "kind"));
    if (typeof kindResult === "object") {
      errors.push({ row, message: kindResult.error });
      return;
    }
    const followUp = parseDate(cell(record, "follow_up_at"));
    if (followUp && typeof followUp === "object") {
      errors.push({ row, message: followUp.error });
      return;
    }
    const emailResult = parseEmail(cell(record, "contact_email"));
    if (emailResult && typeof emailResult === "object") {
      errors.push({ row, message: emailResult.error });
      return;
    }

    const key = name.toLowerCase();
    let company = companies.get(key);
    if (!company) {
      company = {
        name,
        website: normalizeWebsite(cell(record, "website")),
        status: statusResult,
        kind: kindResult,
        notes: emptyToNull(cell(record, "notes")),
        follow_up_at: followUp,
        follow_up_note: emptyToNull(cell(record, "follow_up_note")),
        contacts: [],
      };
      companies.set(key, company);
    } else {
      if (!company.website) {
        company.website = normalizeWebsite(cell(record, "website"));
      }
      if (!company.notes) {
        company.notes = emptyToNull(cell(record, "notes"));
      }
      if (!company.follow_up_at) {
        company.follow_up_at = followUp;
      }
      if (!company.follow_up_note) {
        company.follow_up_note = emptyToNull(cell(record, "follow_up_note"));
      }
    }

    const contactName = cell(record, "contact_name").trim();
    if (!contactName) {
      return;
    }

    company.contacts.push({
      full_name: contactName,
      email: emailResult,
      phone: emptyToNull(cell(record, "contact_phone")),
      title: emptyToNull(cell(record, "contact_title")),
      notes: emptyToNull(cell(record, "contact_notes")),
      is_primary: parseBoolean(cell(record, "primary")),
      row,
    });
  });

  for (const company of companies.values()) {
    let sawPrimary = false;
    company.contacts = company.contacts.map((contact) => {
      if (!contact.is_primary) return contact;
      if (sawPrimary) return { ...contact, is_primary: false };
      sawPrimary = true;
      return contact;
    });
  }

  return { companies: [...companies.values()], errors };
}
