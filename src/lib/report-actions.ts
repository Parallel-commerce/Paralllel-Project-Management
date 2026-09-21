import { formatCls, formatMs } from "@/lib/pagespeed";
import { pageKindLabel } from "@/lib/store-report-speed";
import type { StoreReportSpeed, StoreReportSpeedPage } from "@/types/database";

export type ReportAction = {
  key: string;
  theme: string;
  body: string;
  title: string;
};

const MAX_TITLE = 110;

const THEME_ALIASES: { match: RegExp; theme: string }[] = [
  { match: /^customer experience\s*\/\s*conversion$/i, theme: "Customer Experience / Conversion" },
  { match: /^customer experience$/i, theme: "Customer Experience / Conversion" },
  { match: /^conversion$/i, theme: "Customer Experience / Conversion" },
  { match: /^site performance$/i, theme: "Site Performance" },
  { match: /^additional priority$/i, theme: "Additional Priority" },
  { match: /^sales$/i, theme: "Sales" },
  { match: /^marketing$/i, theme: "Marketing" },
  { match: /^inventory$/i, theme: "Inventory" },
];

const SKIP_THEMES = /^(summary|closing|closing summary|action)$/i;

const IMPERATIVE =
  /^(Investigate|Audit|Test|Launch|Confirm|Review|Check|Consider|Work|Monitor|Fix|Reduce|Avoid|Ensure|Prioritise|Prioritize|Replicate|Segment|Improve|Protect|Watch)\b/i;

export function collectReportActions(
  narrative: string | null | undefined,
  speed?: StoreReportSpeed | null,
): ReportAction[] {
  const fromSpeed = speedActionsFromReport(speed);
  const fromNarrative = parseReportActions(narrative).filter(
    (action) => fromSpeed.length === 0 || !/site performance/i.test(action.theme),
  );
  return dedupeActions([...fromNarrative, ...fromSpeed]).slice(0, 20);
}

export function parseReportActions(narrative: string | null | undefined): ReportAction[] {
  const section = extractActionsSection(narrative);
  if (!section) return [];

  const actions: ReportAction[] = [];
  let theme = "";
  let pending: string[] = [];

  const flushPending = () => {
    const body = pending.join(" ").trim();
    pending = [];
    if (!theme || !body) return;
    for (const piece of splitActionBodies(body)) {
      pushAction(actions, theme, piece);
    }
  };

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "---") continue;
    if (/^(?:💡\s*)?key takeaway\b/i.test(stripMarkdown(line))) continue;

    const labeled = labeledTheme(line);
    if (labeled) {
      flushPending();
      theme = labeled.theme;
      if (SKIP_THEMES.test(theme)) {
        theme = "";
        continue;
      }
      if (labeled.rest) pending.push(labeled.rest);
      continue;
    }

    const heading = headingTheme(line);
    if (heading) {
      flushPending();
      theme = SKIP_THEMES.test(heading) ? "" : heading;
      continue;
    }

    const bullet = bulletBody(line);
    if (bullet) {
      flushPending();
      if (theme) pushAction(actions, theme, bullet);
      continue;
    }

    if (theme && !looksLikeHeading(line)) {
      pending.push(stripMarkdown(line));
    }
  }

  flushPending();
  return dedupeActions(actions);
}

export function speedActionsFromReport(
  speed: StoreReportSpeed | null | undefined,
): ReportAction[] {
  if (!speed) return [];

  const actions: ReportAction[] = [];
  const theme = "Site Performance";
  const pages = speed.pages.filter((page) => !page.error);

  if (speed.origin.passed === false) {
    pushAction(actions, theme, originCwvAction(speed));
  }

  const weakest = [...pages]
    .filter((page) => page.lab_score != null)
    .sort((a, b) => (a.lab_score ?? 100) - (b.lab_score ?? 100))[0];
  if (weakest?.lab_score != null && weakest.lab_score < 90) {
    pushAction(actions, theme, weakestPageAction(weakest));
  }

  const grouped = groupOpportunities(pages);
  const shared = grouped.filter((item) => item.pages.length >= 2);
  const topShared = shared.sort((a, b) => b.savings_ms - a.savings_ms)[0];
  if (topShared) {
    pushAction(actions, theme, sharedOpportunityAction(topShared));
  } else if (!weakest || (weakest.lab_score ?? 100) >= 90) {
    const top = grouped.sort((a, b) => b.savings_ms - a.savings_ms)[0];
    if (top) pushAction(actions, theme, sharedOpportunityAction(top));
  }

  return dedupeActions(actions);
}

export function reportActionDescription(
  action: ReportAction,
  reportTitle: string,
  reportPath: string,
) {
  return `${action.body}\n\nTheme: ${action.theme}\nFrom report: ${reportTitle}\n${reportPath}`;
}

function extractActionsSection(narrative: string | null | undefined) {
  if (!narrative?.trim()) return null;

  let start = narrative.search(/^#{1,4}\s+.*insights and actions.*$/im);
  if (start < 0) {
    start = narrative.search(/^#{1,4}\s+(?:section\s*)?9\b.*$/im);
  }
  if (start < 0) {
    start = narrative.search(/^#{1,4}\s+(?:section\s*)?8\b.*insights.*$/im);
  }
  if (start < 0) return null;

  const fromHeading = narrative.slice(start);
  const afterHeading = fromHeading.replace(/^[^\n]*\n/, "");
  const end = afterHeading.search(
    /^#{1,4}\s+(?:section\s*)?(?:9|10)\b.*$|^#{1,4}\s+.*\b(closing summary|summary)\s*$/im,
  );
  const body = (end >= 0 ? afterHeading.slice(0, end) : afterHeading).trim();
  return body || null;
}

function labeledTheme(line: string): { theme: string; rest: string } | null {
  const bold = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
  if (bold) {
    const theme = canonicalTheme(stripMarkdown(bold[1] ?? "").replace(/:$/, ""));
    if (!theme) return null;
    return { theme, rest: stripMarkdown(bold[2] ?? "") };
  }

  const plain = line.match(/^([^:]{2,60}):\s+(.+)$/);
  if (!plain) return null;
  const theme = canonicalTheme(plain[1] ?? "");
  if (!theme) return null;
  return { theme, rest: stripMarkdown(plain[2] ?? "") };
}

function headingTheme(line: string) {
  const heading = line.match(/^#{2,4}\s+(.*)$/);
  const bold = !heading ? line.match(/^\*\*(.+)\*\*$/) : null;
  const raw = heading?.[1] ?? bold?.[1];
  if (!raw) return null;
  const theme = stripMarkdown(raw)
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^💡\s*/, "")
    .replace(/:$/, "")
    .trim();
  if (!theme || /^section\s*\d+/i.test(theme)) return null;
  if (/insights and actions/i.test(theme)) return null;
  if (SKIP_THEMES.test(theme)) return theme;
  return canonicalTheme(theme) ?? theme;
}

function canonicalTheme(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const alias = THEME_ALIASES.find((item) => item.match.test(value));
  return alias?.theme ?? null;
}

function bulletBody(line: string) {
  const match = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  return stripMarkdown(match[1] ?? "").trim();
}

function looksLikeHeading(line: string) {
  return /^#{1,4}\s+/.test(line) || /^\*\*[^*].*\*\*$/.test(line);
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s*/, "")
    .trim();
}

function splitActionBodies(body: string) {
  const sentences = splitSentences(body);
  const actionable = sentences.filter((sentence) => IMPERATIVE.test(sentence));
  if (actionable.length >= 2) return actionable;
  return [body];
}

function pushAction(actions: ReportAction[], theme: string, body: string) {
  const text = body.replace(/^💡\s*/, "").trim();
  if (!text || text.length < 8) return;
  if (SKIP_THEMES.test(theme)) return;
  const enriched =
    theme === "Site Performance" ? text : enrichInsightAction(theme, text);
  actions.push({
    key: reportActionKey(theme, text),
    theme,
    body: enriched,
    title: actionTitle(enriched),
  });
}

function actionTitle(body: string) {
  const firstLine = body.split(/\n/)[0]?.trim() ?? body;
  const sentence = firstLine.split(/(?<=[.!?])\s+/)[0] ?? firstLine;
  if (sentence.length <= MAX_TITLE) return sentence;
  return `${sentence.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function actionHeadline(insight: string) {
  const sentences = splitSentences(insight);
  const imperative = sentences.find((sentence) => IMPERATIVE.test(sentence));
  return (imperative ?? sentences[0] ?? insight).trim();
}

function enrichInsightAction(theme: string, insight: string) {
  if (/\nWork:\n/.test(insight)) return insight;
  const headline = actionHeadline(insight);
  const steps = insightWorkSteps(theme, insight);
  const numbered = steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");
  const trimmed = insight.trim();
  const showContext =
    trimmed !== headline &&
    !trimmed.startsWith(headline.replace(/[.…]+$/, ""));
  return [
    headline,
    showContext ? `From the report:\n${trimmed}` : null,
    numbered ? `Work:\n${numbered}` : null,
    insightDoneWhen(theme),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function insightWorkSteps(theme: string, insight: string) {
  const text = insight.toLowerCase();
  const dates = extractDates(insight);
  const steps: string[] = [];
  const weakDay = dates[0];
  const strongDay =
    dates.find((value) => /saturday|sunday/i.test(value)) ?? dates[1];

  if (theme === "Sales") {
    if (/refund|cancel|negative/.test(text)) {
      steps.push(
        `In Shopify admin → Orders, filter to Online Store${weakDay ? ` for ${weakDay}` : " for the weak day in the report"}. List refunds, cancellations, and order edits. Note whether the negative total is real (returns) or a reporting artefact.`,
      );
    }
    if (/replicat|peaked|strongest|conversion hit|daily sales/.test(text)) {
      steps.push(
        `Open Shopify Analytics (Online Store) for ${strongDay ?? "the strongest day in the report"}. Capture sessions, conversion, discount codes, top products, and landing pages so that mix can be reused.`,
      );
    }
    if (/promo|promotional|mid-week|wednesday/.test(text)) {
      steps.push(
        "Check whether a campaign, discount, or email was live on the strong day and missing mid-week. If a weekday had traffic but zero conversions, rule out checkout and stock before adding a sale. If you do run a mid-week promo, cap the code, set an end date, and tag it so next week's report can see it.",
      );
    }
    if (steps.length === 0) {
      steps.push(
        "In Shopify Analytics, compare this period's Online Store sales and orders to the previous period for the days named in the report. Pick one change (promo, merchandising, or ops) and write it on this task.",
      );
    }
  } else if (theme === "Marketing") {
    if (/email/.test(text)) {
      steps.push(
        "In the email platform, check last send date, bounces, and unsubscribes against the email session count in the report. Send one product or restock email with UTM parameters (utm_source=email) to a live Online Store collection — do not blast a generic newsletter.",
      );
    }
    if (/social/.test(text)) {
      steps.push(
        "In Shopify Analytics, split Social by source (Instagram, Facebook, TikTok, etc.). In the ads manager, confirm landing pages match in-stock products and that the pixel fires. If sessions arrive but do not convert, pause weak ads and retarget cart viewers rather than buying more top-of-funnel traffic.",
      );
    }
    if (/direct/.test(text)) {
      steps.push(
        "Treat Direct as possibly untagged email or SMS. Add UTM links to the next email and SMS so next week's report can show whether Direct shrinks.",
      );
    }
    if (
      /referrer|google|organic|protect traffic/.test(text) &&
      steps.length === 0
    ) {
      steps.push(
        "In Shopify Analytics → Sessions by referrer, confirm the named source is still the largest. Check Search Console or ads for that source, and do not change the homepage template until the source drop is explained.",
      );
    }
    if (steps.length === 0) {
      steps.push(
        "In Shopify Analytics, open Sessions by referrer for this period. Pick the weakest named channel and either fix tracking (UTMs) or schedule one campaign that can be seen in next week's report.",
      );
    }
  } else if (theme === "Customer Experience / Conversion") {
    if (/checkout|abandon|cart recovery|payment/.test(text)) {
      steps.push(
        "In Shopify admin → Settings → Checkout, confirm Shop Pay and wallets are on, extra required fields are not blocking, and abandoned checkout recovery is enabled.",
      );
      steps.push(
        "Place a test Online Store order on mobile through cart → checkout. Fix theme or app errors (shipping, discounts, sold-out variants) that would drop conversion while sessions stay flat.",
      );
    }
    if (/segment|saturday|landing|audience|messaging/.test(text)) {
      steps.push(
        `In Shopify Analytics, compare ${strongDay ?? "the best conversion day"} by referrer, device, landing page, and new vs returning against a mid-week day with poor conversion. Reuse the winning landing page or campaign; do not guess.`,
      );
    }
    if (/conversion/.test(text) && steps.length === 0) {
      steps.push(
        "In Shopify Analytics, compare sessions → checkouts → orders for this period vs last. If checkouts fell with sessions flat, the leak is on-site; if checkouts held and orders fell, the leak is payment or stock at checkout.",
      );
    }
    if (steps.length === 0) {
      steps.push(
        "Run one mobile test purchase on the Online Store and note where the journey is slow or confusing. Put that finding on this task before changing the theme.",
      );
    }
  } else if (theme === "Inventory") {
    if (/stock|inventory|units|sell-through|carrying/.test(text)) {
      steps.push(
        'Open the product named in the report in Shopify. Check Online Store inventory per variant, "Continue selling when out of stock", and whether the bestseller is hidden, drafted, or sold out on the colour that is carrying sales.',
      );
    }
    if (/black|colour|color/.test(text)) {
      steps.push(
        "For bestsellers, confirm the leading colour is in stock in the sizes that sell. Merchandise that colour on the homepage or collection if it can cover a week; do not advertise it if it cannot.",
      );
    }
    if (/bundle|promo|prioritis|prioritize/.test(text)) {
      steps.push(
        "Only bundle or promote the product if inventory can cover it. If not, ask the merchant for a restock date rather than discounting a thin SKU.",
      );
    }
    if (steps.length === 0) {
      steps.push(
        "In Shopify, open the top product from the report and confirm sellable Online Store stock. Raise a restock or merchandising change on this task.",
      );
    }
  } else if (theme === "Additional Priority") {
    if (/win-back|returning|60 days|repeat/.test(text)) {
      steps.push(
        "In Shopify or the email platform, build a segment: customers who ordered in the last 60 days and have not ordered this period. Send one win-back email or SMS with a live in-stock product and UTM tags. Do not blast the whole list.",
      );
    }
    if (/new customer|acquisition/.test(text)) {
      steps.push(
        "Compare new-customer sessions by channel this period vs last. If paid social or email dropped, that is an ads or email fix, not a theme change.",
      );
    }
    if (steps.length === 0) {
      steps.push(
        "Turn the report note into one dated action (email, merchandising, or ops) and record the owner and due date on this task.",
      );
    }
  } else {
    steps.push(
      "Turn this report note into a dated Online Store action. Write the result on this task when it is done.",
    );
  }

  return [...new Set(steps)].slice(0, 5);
}

function insightDoneWhen(theme: string) {
  switch (theme) {
    case "Sales":
      return "Done when: this task has a one-line cause for the weak day and a dated next action for this week.";
    case "Marketing":
      return "Done when: the next email or ad is scheduled with UTMs, or tracking is fixed so the channel will show in next week's report.";
    case "Customer Experience / Conversion":
      return "Done when: a test checkout has been completed on mobile, or the winning day's traffic mix is written on this task.";
    case "Inventory":
      return "Done when: inventory is updated or the merchant has a restock date, and the product is not being promoted if it cannot cover demand.";
    case "Additional Priority":
      return "Done when: the segment exists and the send is scheduled, or the acquisition drop is assigned to ads or email.";
    default:
      return "Done when: the action above is completed and the outcome is noted on this task.";
  }
}

function extractDates(text: string) {
  const tagged =
    text.match(
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?/gi,
    ) ?? [];
  const weekdays =
    text.match(
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/gi,
    ) ?? [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of [...tagged, ...weekdays]) {
    const key = value.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    values.push(key);
  }
  return values;
}

type GroupedOpportunity = {
  id: string;
  title: string;
  savings_ms: number;
  pages: StoreReportSpeedPage[];
};

function groupOpportunities(pages: StoreReportSpeedPage[]) {
  const grouped = new Map<string, GroupedOpportunity>();
  for (const page of pages) {
    for (const item of page.opportunities) {
      const id = opportunityId(item);
      const current = grouped.get(id);
      if (current) {
        current.savings_ms = Math.max(current.savings_ms, item.savings_ms);
        if (!current.pages.includes(page)) current.pages.push(page);
      } else {
        grouped.set(id, {
          id,
          title: item.title,
          savings_ms: item.savings_ms,
          pages: [page],
        });
      }
    }
  }
  return [...grouped.values()];
}

function opportunityId(item: { id?: string; title: string }) {
  return (
    item.id?.trim() ||
    item.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
}

function pageRef(page: StoreReportSpeedPage) {
  const kind = pageKindLabel(page.page_kind);
  const name =
    page.title && page.title.toLowerCase() !== kind.toLowerCase()
      ? `${kind} (${page.title})`
      : kind;
  return page.url ? `${name} — ${page.url}` : name;
}

function originCwvAction(speed: StoreReportSpeed) {
  const fails: string[] = [];
  if (speed.origin.lcp_ms != null && speed.origin.lcp_ms > 2500) {
    fails.push(`LCP ${formatMs(speed.origin.lcp_ms)} (target under 2.5s)`);
  }
  if (speed.origin.inp_ms != null && speed.origin.inp_ms > 200) {
    fails.push(`INP ${formatMs(speed.origin.inp_ms)} (target under 200ms)`);
  }
  if (speed.origin.cls != null && speed.origin.cls > 0.1) {
    fails.push(`CLS ${formatCls(speed.origin.cls)} (target under 0.1)`);
  }
  const where = speed.origin.url ? ` on ${speed.origin.url}` : "";
  const failing = fails.length
    ? fails.join("; ")
    : `LCP ${formatMs(speed.origin.lcp_ms)}, INP ${formatMs(speed.origin.inp_ms)}, CLS ${formatCls(speed.origin.cls)}`;
  return [
    `Get real visitors passing Core Web Vitals${where}.`,
    `Field data is failing: ${failing}. Lab scores on individual templates can look different — fix the field metric that is over the threshold, then wait for the next speed snapshot to confirm CrUX has moved.`,
  ].join("\n\n");
}

function weakestPageAction(page: StoreReportSpeedPage) {
  const kind = pageKindLabel(page.page_kind).toLowerCase();
  const issues = metricIssues(page);
  const fine: string[] = [];
  if (page.lab_tbt_ms != null && page.lab_tbt_ms < 200) {
    fine.push(`TBT ${formatMs(page.lab_tbt_ms)} is already fine`);
  }
  const diagnosis = issues.length
    ? `${issues.join("; ")}${fine.length ? `. ${fine.join("; ")}` : ""}.`
    : `Lab LCP ${formatMs(page.lab_lcp_ms)}, TBT ${formatMs(page.lab_tbt_ms)}, CLS ${formatCls(page.lab_cls)}.`;

  const steps = pageWorkSteps(page);
  const remainingLcp =
    page.lab_lcp_ms != null
      ? page.lab_lcp_ms -
        page.opportunities.reduce((sum, item) => sum + item.savings_ms, 0)
      : null;
  if (remainingLcp != null && remainingLcp > 2500) {
    steps.push(
      `Redirects and script savings do not explain a ${formatMs(page.lab_lcp_ms)} LCP. In DevTools, find the LCP element on this URL (often a large image or an app banner) and preload it — do not lazy-load it.`,
    );
  }
  if (page.lab_cls != null && page.lab_cls >= 0.1) {
    steps.push(
      `Bring CLS under 0.1: set width and height on images, reserve space for cart drawers and banners, and stop late-loading app blocks from pushing content down.`,
    );
  }

  const numbered = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return [
    `Raise the ${kind} Lighthouse score from ${page.lab_score}.`,
    `Page: ${pageRef(page)}\nMobile lab: ${diagnosis}`,
    numbered ? `Work:\n${numbered}` : null,
    `After the theme change, re-run PageSpeed Insights (mobile) on this URL.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function pageWorkSteps(page: StoreReportSpeedPage) {
  return page.opportunities.map((item) => {
    const saving = item.savings_ms ? ` (~${formatMs(item.savings_ms)})` : "";
    return `${item.title}${saving}. ${opportunityGuidance(opportunityId(item), [page.url])}`;
  });
}

function sharedOpportunityAction(item: GroupedOpportunity) {
  const labels = item.pages.map((page) => pageKindLabel(page.page_kind).toLowerCase());
  const where =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
      : labels[0];
  const urls = item.pages.map((page) => page.url).filter(Boolean);
  const list = item.pages.map((page) => `- ${pageRef(page)}`).join("\n");
  const saving = item.savings_ms ? ` (~${formatMs(item.savings_ms)} each)` : "";
  return [
    `Fix “${item.title}” on the ${where}.`,
    `Lighthouse flagged this${saving} on:\n${list}`,
    `Work:\n${opportunityGuidance(item.id, urls)}`,
    labels.length > 1
      ? "This is a store-wide hop, not a single-template issue. Fixing it should lift every lab test."
      : "Retest the URL in PageSpeed Insights (mobile) after the change.",
  ].join("\n\n");
}

function metricIssues(page: StoreReportSpeedPage) {
  const issues: string[] = [];
  if (page.lab_lcp_ms != null && page.lab_lcp_ms >= 2500) {
    issues.push(`LCP ${formatMs(page.lab_lcp_ms)} (target under 2.5s)`);
  }
  if (page.lab_cls != null && page.lab_cls >= 0.1) {
    issues.push(`CLS ${formatCls(page.lab_cls)} (target under 0.1)`);
  }
  if (page.lab_tbt_ms != null && page.lab_tbt_ms >= 200) {
    issues.push(`TBT ${formatMs(page.lab_tbt_ms)} (target under 200ms)`);
  }
  return issues;
}

function opportunityGuidance(id: string, urls: string[]) {
  const myshopify = urls.some((url) => url.includes(".myshopify.com"));
  switch (id) {
    case "redirects":
      return [
        "Open each URL in a private window and count 301/302 hops before the HTML arrives.",
        myshopify
          ? "These tests currently hit a *.myshopify.com host. If customers use a custom domain, confirm the primary domain in Shopify and that http→https, www, and myshopify→custom-domain are not stacked."
          : "On Shopify this is usually stacked domain hops: http→https, www, a market/locale prefix, or an app rewriting the first request.",
        "Check Shopify admin → Domains, Markets/geolocation redirects, and any theme or app script that sets window.location on first load.",
      ].join(" ");
    case "unused-javascript":
      return "Audit theme.liquid and this template for storewide app scripts (reviews, chat, upsell, analytics). Load those scripts only on the templates that need them — cart and collection should not run homepage or PDP apps.";
    case "unused-css-rules":
      return "Split or defer CSS so this template does not load homepage/section styles it never uses.";
    case "render-blocking-resources":
      return "Defer non-critical CSS and JavaScript in theme.liquid. Do not block first paint with scripts that belong on a later template.";
    case "unminified-javascript":
    case "unminified-css":
      return "Serve minified theme assets. If an app injects a full development bundle, replace or remove it.";
    case "uses-text-compression":
      return "Confirm the theme and CDN gzip/brotli HTML, JS, and CSS. Shopify normally does this; leftover uncompressed app assets are the usual cause.";
    case "uses-responsive-images":
    case "uses-optimized-images":
    case "modern-image-formats":
    case "offscreen-images":
      return "Use Shopify image_url with width/srcset, serve WebP/AVIF where the theme allows, and lazy-load below-the-fold images only — never the LCP image.";
    case "preload-lcp-image":
    case "lcp-lazy-loaded":
      return "Identify the LCP image on this URL and preload it. Remove loading=lazy from that image.";
    case "unsized-images":
      return "Set width and height (or aspect-ratio) on images so the layout does not jump when they load.";
    case "server-response-time":
      return "Reduce Liquid and app blocks on this template. Heavy cart or collection sections and storefront filters are the usual Shopify TTFB cost.";
    case "font-display":
      return "Add font-display: swap (or optional) on custom webfonts so text is not held back.";
    case "uses-rel-preconnect":
      return "Preconnect only to origins this page actually uses (Shopify CDN, font host). Do not preconnect unused app origins.";
    case "legacy-javascript":
    case "duplicative-javascript":
      return "Remove legacy polyfills and duplicate jQuery/app copies. Shopify themes should not ship two copies of the same library.";
    case "bootup-time":
    case "mainthread-work-breakdown":
      return "Cut or defer third-party widgets on this template. Chat, reviews, and personalization scripts are usually the main-thread cost.";
    default:
      return "Work through this Lighthouse audit on the listed URLs, then retest mobile lab.";
  }
}

function reportActionKey(theme: string, body: string) {
  const normalized = `${theme}|${body}`.trim().toLowerCase().replace(/\s+/g, " ");
  return fnv1a(normalized);
}

function fnv1a(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function dedupeActions(actions: ReportAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.key)) return false;
    seen.add(action.key);
    return true;
  });
}
