import { companyReengageValue } from "@/lib/company-reengage";
import {
  normalizeCompanyLinkedInUrl,
  normalizePersonLinkedInUrl,
} from "@/lib/linkedin";
import { parseVerticalName, verticalNamesEqual } from "@/lib/verticals";
import {
  COMPANY_KINDS,
  COMPANY_REENGAGES,
  COMPANY_STATUSES,
  type CompanyKind,
  type CompanyReengage,
  type CompanyStatus,
} from "@/types/database";

export const COMPANY_IMPORT_HEADERS = [
  "company_id",
  "company_name",
  "website",
  "status",
  "kind",
  "can_reengage",
  "verticals",
  "summary",
  "linkedin_url",
  "notes",
  "follow_up_at",
  "follow_up_note",
  "contact_id",
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_title",
  "contact_linkedin",
  "contact_notes",
  "primary",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  ex_customer: "ex_customer",
  excustomer: "ex_customer",
  former_customer: "ex_customer",
  former: "ex_customer",
  agency: "agency",
  evangelist: "agency",
  agency_evangelist: "agency",
  another_agency: "agency",
  another_agency_evangelist: "agency",
};

const HEADER_ALIASES: Record<string, (typeof COMPANY_IMPORT_HEADERS)[number]> = {
  company_id: "company_id",
  company_name: "company_name",
  company: "company_name",
  website: "website",
  url: "website",
  status: "status",
  kind: "kind",
  type: "kind",
  company_type: "kind",
  company_kind: "kind",
  can_reengage: "can_reengage",
  reengage: "can_reengage",
  re_engage: "can_reengage",
  verticals: "verticals",
  vertical: "verticals",
  company_verticals: "verticals",
  industry: "verticals",
  industries: "verticals",
  sector: "verticals",
  sectors: "verticals",
  vertical_names: "verticals",
  summary: "summary",
  linkedin_url: "linkedin_url",
  company_linkedin: "linkedin_url",
  notes: "notes",
  company_notes: "notes",
  follow_up_at: "follow_up_at",
  follow_up: "follow_up_at",
  followup: "follow_up_at",
  follow_up_note: "follow_up_note",
  follow_up_notes: "follow_up_note",
  contact_id: "contact_id",
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
  contact_linkedin: "contact_linkedin",
  contact_notes: "contact_notes",
  primary: "primary",
  is_primary: "primary",
};

export type ImportRowError = { row: number; message: string };

export type ParsedImportContact = {
  id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  notes: string | null;
  is_primary: boolean;
  row: number;
};

export type ParsedImportCompany = {
  id: string | null;
  name: string;
  website: string | null;
  status: CompanyStatus;
  kind: CompanyKind;
  can_reengage: CompanyReengage | null;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  summary: string | null;
  linkedin_url: string | null;
  verticals: string[];
  contacts: ParsedImportContact[];
};

export type ParsedImport = {
  companies: ParsedImportCompany[];
  errors: ImportRowError[];
  hasVerticalsColumn: boolean;
};

export type CompanyExportContact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  notes: string | null;
  is_primary: boolean;
};

export type CompanyExportCompany = {
  id: string;
  name: string;
  website: string | null;
  status: CompanyStatus;
  kind: CompanyKind;
  can_reengage: CompanyReengage | null;
  verticals: string[];
  summary: string | null;
  linkedin_url: string | null;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  contacts: CompanyExportContact[];
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

function csvField(value: string | null | undefined) {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function dateCell(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export function buildCompanyExportCsv(companies: CompanyExportCompany[]) {
  const lines = [COMPANY_IMPORT_HEADERS.join(",")];
  for (const company of companies) {
    const companyCells = [
      csvField(company.id),
      csvField(company.name),
      csvField(company.website),
      csvField(company.status),
      csvField(company.kind),
      csvField(companyReengageValue(company.can_reengage)),
      csvField(company.verticals.join(", ")),
      csvField(company.summary),
      csvField(company.linkedin_url),
      csvField(company.notes),
      csvField(dateCell(company.follow_up_at)),
      csvField(company.follow_up_note),
    ];
    const contacts =
      company.contacts.length > 0 ? company.contacts : [null];
    for (const contact of contacts) {
      lines.push(
        [
          ...companyCells,
          csvField(contact?.id),
          csvField(contact?.full_name),
          csvField(contact?.email),
          csvField(contact?.phone),
          csvField(contact?.title),
          csvField(contact?.linkedin_url),
          csvField(contact?.notes),
          csvField(contact ? (contact.is_primary ? "true" : "false") : ""),
        ].join(","),
      );
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

export const COMPANY_IMPORT_TEMPLATE = buildCompanyExportCsv([
  {
    id: "",
    name: "Acme Ltd",
    website: "https://acme.com",
    status: "lead",
    kind: "prospect",
    can_reengage: "yes",
    verticals: ["Fashion", "Retail"],
    summary: "",
    linkedin_url: "https://www.linkedin.com/company/acme",
    notes: "Met at a trade show",
    follow_up_at: "2026-09-15",
    follow_up_note: "Follow up after summer",
    contacts: [
      {
        id: "",
        full_name: "Jane Smith",
        email: "jane@acme.com",
        phone: "+44 20 0000 0000",
        title: "Buying manager",
        linkedin_url: "",
        notes: "",
        is_primary: true,
      },
      {
        id: "",
        full_name: "Bob Jones",
        email: "bob@acme.com",
        phone: "+44 20 0000 0001",
        title: "Finance",
        linkedin_url: "",
        notes: "",
        is_primary: false,
      },
    ],
  },
  {
    id: "",
    name: "Northwind",
    website: "https://northwind.example",
    status: "contacted",
    kind: "prospect",
    can_reengage: null,
    verticals: [],
    summary: "",
    linkedin_url: "",
    notes: "",
    follow_up_at: "",
    follow_up_note: "",
    contacts: [
      {
        id: "",
        full_name: "Priya Patel",
        email: "priya@northwind.example",
        phone: "",
        title: "",
        linkedin_url: "",
        notes: "",
        is_primary: false,
      },
    ],
  },
]);

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

function parseCanReengage(
  raw: string,
): CompanyReengage | null | { error: string } {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s./-]+/g, "_");
  if (!value) return null;
  if (value === "yes" || value === "true" || value === "1" || value === "y") {
    return "yes";
  }
  if (value === "no" || value === "false" || value === "0" || value === "n") {
    return "no";
  }
  if (value === "not_applicable" || value === "n_a" || value === "na") {
    return "not_applicable";
  }
  const byLabel = COMPANY_REENGAGES.find(
    (item) => item.label.toLowerCase().replace(/[\s./-]+/g, "_") === value,
  );
  if (byLabel) return byLabel.value;
  return { error: "can_reengage must be yes, no, or not_applicable." };
}

function parseDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dmy = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year =
      dmy[3].length === 2
        ? Number(dmy[3]) > 50
          ? `19${dmy[3]}`
          : `20${dmy[3]}`
        : dmy[3];
    const iso = `${year}-${month}-${day}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return { error: "Follow-up date must be YYYY-MM-DD." } as const;
    }
    return iso;
  }
  return { error: "Follow-up date must be YYYY-MM-DD." } as const;
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

function parseUuid(raw: string, label: string): string | null | { error: string } {
  const value = raw.trim();
  if (!value) return null;
  if (!UUID_RE.test(value)) {
    return { error: `${label} must be a valid id from the export.` };
  }
  return value.toLowerCase();
}

function parseCompanyLinkedIn(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const normalized = normalizeCompanyLinkedInUrl(value);
  if (!normalized) {
    return { error: "linkedin_url must be a LinkedIn company page." } as const;
  }
  return normalized;
}

function parsePersonLinkedIn(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const normalized = normalizePersonLinkedInUrl(value);
  if (!normalized) {
    return { error: "contact_linkedin must be a LinkedIn profile URL." } as const;
  }
  return normalized;
}

function parseVerticals(raw: string): { names: string[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { names: [] };

  let source = trimmed;
  if (source.startsWith("[")) {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        source = parsed.map((item) => String(item ?? "")).join(", ");
      }
    } catch {
      source = source.replace(/^\[|\]$/g, "");
    }
  }

  const names: string[] = [];
  let error: string | undefined;
  for (const part of source.split(/[,;|/]+|\r?\n/)) {
    const parsed = parseVerticalName(part.replace(/^["']|["']$/g, ""));
    if (parsed && typeof parsed === "object") {
      error = parsed.error;
      continue;
    }
    if (!parsed) continue;
    if (!names.some((name) => verticalNamesEqual(name, parsed))) {
      names.push(parsed);
    }
  }
  return error ? { names, error } : { names };
}

function addVerticals(target: string[], incoming: string[]) {
  for (const name of incoming) {
    if (!target.some((item) => verticalNamesEqual(item, name))) {
      target.push(name);
    }
  }
}

function verticalsFromNotes(notes: string | null): string[] {
  if (!notes) return [];
  const match = notes.match(/Industry:\s*([^.;\n]+)/i);
  if (!match) return [];
  return parseVerticals(match[1]).names;
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < first.length; i += 1) {
    const char = first[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "," || char === ";" || char === "\t")) {
      counts[char] += 1;
    }
  }
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const delimiter = detectDelimiter(text);

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
    } else if (char === delimiter) {
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
    header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
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
        "CSV must include a company_name column. Download the export or template for the expected headers.",
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

    const companyIdResult = parseUuid(cell(record, "company_id"), "company_id");
    if (companyIdResult && typeof companyIdResult === "object") {
      errors.push({
        row,
        message: `${companyIdResult.error} Matching by company name instead.`,
      });
    }
    const contactIdResult = parseUuid(cell(record, "contact_id"), "contact_id");
    if (contactIdResult && typeof contactIdResult === "object") {
      errors.push({
        row,
        message: `${contactIdResult.error} Treating this as a new contact.`,
      });
    }
    const companyId =
      typeof companyIdResult === "string" ? companyIdResult : null;
    const contactId =
      typeof contactIdResult === "string" ? contactIdResult : null;
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
    const canReengage = parseCanReengage(cell(record, "can_reengage"));
    if (canReengage && typeof canReengage === "object") {
      errors.push({ row, message: canReengage.error });
      return;
    }
    const followUpResult = parseDate(cell(record, "follow_up_at"));
    if (followUpResult && typeof followUpResult === "object") {
      errors.push({ row, message: followUpResult.error });
    }
    const followUp =
      typeof followUpResult === "string" ? followUpResult : null;
    const emailResult = parseEmail(cell(record, "contact_email"));
    if (emailResult && typeof emailResult === "object") {
      errors.push({ row, message: emailResult.error });
      return;
    }
    const companyLinkedInResult = parseCompanyLinkedIn(
      cell(record, "linkedin_url"),
    );
    if (companyLinkedInResult && typeof companyLinkedInResult === "object") {
      errors.push({ row, message: companyLinkedInResult.error });
    }
    const companyLinkedIn =
      typeof companyLinkedInResult === "string" ? companyLinkedInResult : null;
    const contactLinkedInResult = parsePersonLinkedIn(
      cell(record, "contact_linkedin"),
    );
    if (contactLinkedInResult && typeof contactLinkedInResult === "object") {
      errors.push({ row, message: contactLinkedInResult.error });
    }
    const contactLinkedIn =
      typeof contactLinkedInResult === "string" ? contactLinkedInResult : null;
    const verticalsResult = parseVerticals(cell(record, "verticals"));
    if (verticalsResult.error) {
      errors.push({ row, message: verticalsResult.error });
    }
    const verticals = verticalsResult.names;

    const key = companyId ?? `name:${name.toLowerCase()}`;
    let company = companies.get(key);
    if (!company) {
      company = {
        id: companyId,
        name,
        website: normalizeWebsite(cell(record, "website")),
        status: statusResult,
        kind: kindResult,
        can_reengage: canReengage,
        notes: emptyToNull(cell(record, "notes")),
        follow_up_at: followUp,
        follow_up_note: emptyToNull(cell(record, "follow_up_note")),
        summary: emptyToNull(cell(record, "summary")),
        linkedin_url: companyLinkedIn,
        verticals,
        contacts: [],
      };
      if (company.verticals.length === 0) {
        addVerticals(company.verticals, verticalsFromNotes(company.notes));
      }
      companies.set(key, company);
    } else {
      if (!company.website) {
        company.website = normalizeWebsite(cell(record, "website"));
      }
      if (!company.notes) {
        company.notes = emptyToNull(cell(record, "notes"));
      }
      if (!company.summary) {
        company.summary = emptyToNull(cell(record, "summary"));
      }
      if (!company.linkedin_url) {
        company.linkedin_url = companyLinkedIn;
      }
      addVerticals(company.verticals, verticals);
      if (company.verticals.length === 0) {
        addVerticals(company.verticals, verticalsFromNotes(company.notes));
      }
      if (company.can_reengage === null && canReengage !== null) {
        company.can_reengage = canReengage;
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
      id: contactId,
      full_name: contactName,
      email: emailResult,
      phone: emptyToNull(cell(record, "contact_phone")),
      title: emptyToNull(cell(record, "contact_title")),
      linkedin_url: contactLinkedIn,
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

  return {
    companies: [...companies.values()],
    errors,
    hasVerticalsColumn: indexes.has("verticals"),
  };
}
