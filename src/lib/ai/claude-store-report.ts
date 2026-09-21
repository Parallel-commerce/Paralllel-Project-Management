import Anthropic from "@anthropic-ai/sdk";

import { formatAnthropicUserError } from "@/lib/ai/anthropic-error";
import {
  formatChangePct,
  formatStoreMoney,
  formatStoreNumber,
  formatStorePercent,
  formatStoreRange,
  trendDot,
  weekdayLabel,
} from "@/lib/store-report";
import { compactSpeedForAi, pageKindLabel } from "@/lib/store-report-speed";
import { formatCls, formatMs } from "@/lib/pagespeed";
import type { PeriodMetric, StoreReportDigest, StoreReportSpeed } from "@/types/database";

const MODEL =
  process.env.ANTHROPIC_STORE_REPORT_MODEL || "claude-haiku-4-5";

const STORE_REPORT_SYSTEM = `You write client-facing Shopify store reports for Parallel Commerce.

Follow this structure in markdown, in this order:
1. Header (client name, currency, reporting period)
2. Section 1: Scorecard Summary table with the six core metrics, period-over-period change, and trend dots, then the performance score and the provided interpretation
3. Section 2: Sales and Revenue
4. Section 3: Sales Channels Breakdown
5. Section 4: Customers
6. Section 5: Conversion Performance
7. Section 6: Inventory and Products
8. Section 7: Traffic and Sessions
9. Section 8: Site Performance (Lighthouse lab scores and real-visitor Core Web Vitals)
10. Section 9: Insights and Actions for Next Week (Sales, Marketing, Customer Experience / Conversion, Inventory, Site Performance, Additional Priority)
11. Section 10: Closing Summary (one sentence)

Every numbered section from 2–8 must use:
- A rich summary (2–3 sentences) that interprets the period: what changed, what that likely means from the numbers, and what matters most
- Supporting data as bullet points with the actual figures
- A single Key Takeaway sentence prefixed with **💡 Key Takeaway:**

Section 9 must give specific next-period actions tied to the figures, not generic advice. Use a ### heading for each theme (Sales, Marketing, Customer Experience / Conversion, Inventory, Site Performance, Additional Priority) and one markdown bullet per discrete action. Do not write a theme as a bold label on a paragraph.
Include a Site Performance action when lab scores or Core Web Vitals need work.

Rules:
- Use only facts in the digest JSON. Never invent metrics, days, products, channels, campaigns, site bugs, or events that are not implied by those numbers.
- You should analyse patterns that ARE in the digest: volume vs value, strongest/weakest days, channel mix, new vs returning, traffic vs conversion, top products and referrers, and site speed when speed is present.
- Copy scorecard numbers, trend dots, and the performance score exactly. Do not recalculate them.
- Headline metrics (scorecard, Section 2 Sales, Section 4 Customers, Section 5 Conversion, Section 6 Products) are Online Store only. Do not mix POS or other channel sales into those sections.
- Section 3 is the place for Point of Sale and every other sales channel. Treat that mix as supporting context, not the lead story, even if POS is larger than the website.
- If all_sales is present, you may say what share Online Store was of all-channel sales in Section 3 only.
- Talk about this reporting period versus the previous period of the same length. Do not say "this week" unless the range is a week.
- If a metric is null or listed in unavailable, write "Unavailable" and do not guess. Do not fill sessions, conversion, or referrers from sales.
- Do not mention ShopifyQL, Admin API, scopes, CSVs, digests, AI, PageSpeed Insights, CrUX, or internal tooling.
- Plain UK English. No em-dashes. No jargon. Be specific with numbers.
- Recommendations must be grounded in available data only. If a theme has no data, say what cannot be advised yet.
- Do not mention missing permissions. Say the figure was not available this week.

Site performance rules:
- Lab scores are a Lighthouse test on a mobile device, not real shoppers. Field / Core Web Vitals are real Chrome visitors.
- Never treat lab LCP as if it were the real-visitor LCP. Quote them separately.
- A lab score of 90–100 is good, 50–89 needs work, 0–49 is poor.
- If origin.passed is true, real visitors are passing Core Web Vitals even when lab scores are lower.
- Only cite Lighthouse opportunities that appear in the digest. If speed is null or lighthouse is unavailable, say site speed was not available this period and do not invent scores.`;

export async function generateStoreReportNarrative(input: {
  projectName: string;
  digest: StoreReportDigest;
}): Promise<{ narrative: string; usedAi: boolean; error?: string }> {
  const fallback = buildFallbackStoreNarrative(input.projectName, input.digest);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      narrative: fallback,
      usedAi: false,
      error: "ANTHROPIC_API_KEY is not set, so this draft is numbers only.",
    };
  }

  const userMessage = `Client / project: ${input.projectName}
Currency: ${input.digest.currency ?? "GBP"}
Reporting period: ${formatStoreRange(input.digest.week_start, input.digest.week_end)}
Previous period: ${formatStoreRange(input.digest.previous_week_start, input.digest.previous_week_end)}
Headline: Online Store only. Other channels, including POS, belong in Section 3.

Digest JSON (source of truth):
${JSON.stringify(compactDigest(input.digest), null, 2)}

Write the full report only.`;

  try {
    const client = new Anthropic({ apiKey });
    const text = await requestStoreNarrative(client, userMessage);
    if (!text) {
      return {
        narrative: fallback,
        usedAi: false,
        error:
          "Claude returned no report text. The draft below is numbers only. Try generating again.",
      };
    }

    return { narrative: text, usedAi: true };
  } catch (error) {
    const message = formatAnthropicUserError(error, "Claude request failed.");
    console.error("Claude store report narrative failed:", error);
    return { narrative: fallback, usedAi: false, error: message };
  }
}

async function requestStoreNarrative(client: Anthropic, userMessage: string) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "disabled" },
    system: STORE_REPORT_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function compactDigest(digest: StoreReportDigest) {
  return {
    shop_name: digest.shop_name,
    currency: digest.currency,
    week_start: digest.week_start,
    week_end: digest.week_end,
    previous_week_start: digest.previous_week_start,
    previous_week_end: digest.previous_week_end,
    unavailable: digest.unavailable,
    scorecard: digest.scorecard,
    sales: {
      scope: digest.sales_scope ?? "online_store",
      total_sales: digest.sales.total_sales,
      orders: digest.sales.orders,
      aov: digest.sales.aov,
      discounts: digest.sales.discounts,
      discount_order_pct: digest.sales.discount_order_pct,
      avg_discount: digest.sales.avg_discount,
      strongest_day: digest.sales.strongest_day,
      weakest_day: digest.sales.weakest_day,
    },
    all_sales: digest.all_sales ?? null,
    channels: digest.channels.slice(0, 8),
    customers: digest.customers,
    conversion: digest.conversion,
    products: digest.products.slice(0, 10),
    referrers: digest.referrers.slice(0, 8),
    sessions_daily_extremes: digest.conversion,
    speed: compactSpeedForAi(digest.speed),
  };
}

function metricLine(
  label: string,
  metric: PeriodMetric | null | undefined,
  format: "money" | "count" | "percent",
  currency: string | null,
) {
  if (!metric || metric.this_week == null) {
    return `- **${label}:** Unavailable`;
  }
  const value =
    format === "money"
      ? formatStoreMoney(metric.this_week, currency)
      : format === "percent"
        ? formatStorePercent(metric.this_week)
        : formatStoreNumber(metric.this_week);
  return `- **${label}:** ${value} (${formatChangePct(metric.change_pct)} vs previous period)`;
}

function buildFallbackStoreNarrative(projectName: string, digest: StoreReportDigest) {
  const currency = digest.currency;
  const period = formatStoreRange(digest.week_start, digest.week_end);
  const scorecardRows = digest.scorecard.metrics
    .map((metric) => {
      const thisWeek =
        !metric.available || metric.this_week == null
          ? "Unavailable"
          : metric.format === "money"
            ? formatStoreMoney(metric.this_week, currency)
            : metric.format === "percent"
              ? formatStorePercent(metric.this_week)
              : formatStoreNumber(metric.this_week);
      const lastWeek =
        metric.last_week == null
          ? "Unavailable"
          : metric.format === "money"
            ? formatStoreMoney(metric.last_week, currency)
            : metric.format === "percent"
              ? formatStorePercent(metric.last_week)
              : formatStoreNumber(metric.last_week);
      return `| ${metric.label} | ${thisWeek} | ${lastWeek} | ${formatChangePct(metric.change_pct)} | ${trendDot(metric.trend)} |`;
    })
    .join("\n");

  const channelLines =
    digest.channels.length > 0
      ? digest.channels
          .slice(0, 5)
          .map((channel) => {
            const share =
              channel.share_pct != null ? `, ${formatStorePercent(channel.share_pct)} of total` : "";
            return `- **${channel.name}:** ${formatStoreMoney(channel.sales, currency)}${share} (${formatChangePct(channel.change_pct)})`;
          })
          .join("\n")
      : "- Channel mix: Unavailable";

  const productLines =
    digest.products.length > 0
      ? digest.products
          .slice(0, 3)
          .map((product, index) => {
            const units =
              product.units != null ? `${formatStoreNumber(product.units)} units` : "units unavailable";
            const sellThrough =
              product.sell_through != null
                ? `, ${formatStorePercent(product.sell_through)} sell-through`
                : "";
            return `${index + 1}. ${product.title} – ${units}${sellThrough}`;
          })
          .join("\n")
      : "Unavailable";

  const referrerLines =
    digest.referrers.length > 0
      ? digest.referrers
          .slice(0, 3)
          .map((referrer, index) => {
            const share =
              referrer.share_pct != null ? ` (${formatStorePercent(referrer.share_pct)} of total)` : "";
            return `${index + 1}. ${referrer.source} – ${formatStoreNumber(referrer.sessions)} sessions${share}`;
          })
          .join("\n")
      : "Unavailable";

  const strongest = digest.sales.strongest_day
    ? `${weekdayLabel(digest.sales.strongest_day.date)} (${formatStoreMoney(digest.sales.strongest_day.sales, currency)})`
    : "Unavailable";
  const weakest = digest.sales.weakest_day
    ? `${weekdayLabel(digest.sales.weakest_day.date)} (${formatStoreMoney(digest.sales.weakest_day.sales, currency)})`
    : "Unavailable";

  return `**${digest.shop_name ?? projectName}**
Currency: ${currency ?? "GBP"}
Reporting period: ${period}

## Section 1: Scorecard Summary

| Metric | This period | Previous period | Change | Trend |
|---------|------------|------------|---------|--------|
${scorecardRows}

**Performance Score: ${digest.scorecard.score}%**

${digest.scorecard.interpretation}

## Section 2: Sales and Revenue

Sales, orders and average order value are shown below. Causes beyond these figures are not inferred.

${metricLine("Online sales", digest.sales.total_sales, "money", currency)}
${metricLine("Orders", digest.sales.orders, "count", currency)}
${metricLine("Average Order Value", digest.sales.aov, "money", currency)}
${metricLine("Discount impact (% of orders)", digest.sales.discount_order_pct, "percent", currency)}
- **Average Discount Amount:** ${formatStoreMoney(digest.sales.avg_discount, currency)}
- **Strongest Day:** ${strongest}
- **Weakest Day:** ${weakest}

**💡 Key Takeaway:** ${salesTakeaway(digest)}

## Section 3: Sales Channels Breakdown

${digest.channels.length ? "All sales channels, including POS. The scorecard above is Online Store only." : "Sales by channel were not available this week."}

${channelLines}

**💡 Key Takeaway:** ${
    digest.channels[0]
      ? `${digest.channels[0].name} was the largest channel this week.`
      : "Channel mix could not be reported this week."
  }

## Section 4: Customers

${metricLine("New Customers", digest.customers.new, "count", currency)}
${metricLine("Returning Customers", digest.customers.returning, "count", currency)}
${metricLine("Returning Customer Rate", digest.customers.returning_rate, "percent", currency)}

**💡 Key Takeaway:** ${
    digest.customers.returning_rate?.this_week != null
      ? `Returning customer rate was ${formatStorePercent(digest.customers.returning_rate.this_week)}.`
      : "Customer mix figures were not available this week."
  }

## Section 5: Conversion Performance

${metricLine("Conversion Rate", digest.conversion.rate, "percent", currency)}
${metricLine("Total Sessions", digest.conversion.sessions, "count", currency)}
${metricLine("Total Orders", digest.sales.orders, "count", currency)}
- **Best Converting Day:** ${
    digest.conversion.best_day
      ? `${weekdayLabel(digest.conversion.best_day.date)} (${formatStorePercent(digest.conversion.best_day.rate)})`
      : "Unavailable"
  }
- **Worst Converting Day:** ${
    digest.conversion.worst_day
      ? `${weekdayLabel(digest.conversion.worst_day.date)} (${formatStorePercent(digest.conversion.worst_day.rate)})`
      : "Unavailable"
  }

**💡 Key Takeaway:** ${
    digest.conversion.rate?.this_week != null
      ? `Conversion was ${formatStorePercent(digest.conversion.rate.this_week)} this week.`
      : "Conversion and sessions were not available this week."
  }

## Section 6: Inventory and Products

Top sellers this week:

${productLines}

Sell-through above 80% or below 20% is listed only when Shopify provided it.

**💡 Key Takeaway:** ${
    digest.products[0]
      ? `${digest.products[0].title} led product sales this week.`
      : "Product ranking was not available this week."
  }

## Section 7: Traffic and Sessions

${metricLine("Total Sessions", digest.conversion.sessions, "count", currency)}
- **Top referrer sources:**
${referrerLines}

**💡 Key Takeaway:** ${
    digest.referrers[0]
      ? `${digest.referrers[0].source} was the largest referrer this week.`
      : "Traffic sources were not available this week."
  }

${speedFallbackSection(digest.speed)}

## Section 9: Insights and Actions for Next Week

### Sales
- Review the strongest and weakest sales days above before planning promotions.
### Marketing
- ${digest.referrers[0] ? `Protect traffic from ${digest.referrers[0].source}, the leading referrer this week.` : "Traffic sources were unavailable, so no marketing action is inferred."}
### Customer Experience / Conversion
- ${digest.conversion.rate?.this_week != null ? `Watch conversion at ${formatStorePercent(digest.conversion.rate.this_week)} against last week.` : "Conversion was unavailable, so no conversion action is inferred."}
### Inventory
- ${digest.products[0] ? `Check stock on ${digest.products[0].title}.` : "Product data was unavailable, so no inventory action is inferred."}
### Site Performance
- ${speedFallbackAction(digest.speed)}

## Section 10: Closing Summary

${closingSentence(digest, projectName, period)}
`;
}

function speedFallbackSection(speed: StoreReportSpeed | null | undefined) {
  if (!speed) {
    return `## Section 8: Site Performance

Lighthouse lab scores and real-visitor Core Web Vitals were not available for this period.

**💡 Key Takeaway:** Site speed could not be reported this period.`;
  }

  const origin =
    speed.origin.passed == null
      ? "Not enough real-visitor data yet"
      : speed.origin.passed
        ? "Real visitors are passing Core Web Vitals"
        : "Real visitors are not passing Core Web Vitals";
  const pageLines = speed.pages
    .map((page) => {
      const lab =
        page.lab_score != null ? `${page.lab_score} lab` : "lab unavailable";
      const change =
        page.lab_score_change != null
          ? ` (${page.lab_score_change > 0 ? "+" : ""}${page.lab_score_change} vs previous snapshot)`
          : "";
      return `- **${pageKindLabel(page.page_kind)} (${page.title}):** ${lab}${change}`;
    })
    .join("\n");
  const opportunity = speed.pages
    .flatMap((page) => page.opportunities)
    .sort((a, b) => b.savings_ms - a.savings_ms)[0];

  return `## Section 8: Site Performance

${origin}. Lab scores are a Lighthouse mobile test, not real shoppers.

- **Real-visitor LCP:** ${formatMs(speed.origin.lcp_ms)}
- **Real-visitor INP:** ${formatMs(speed.origin.inp_ms)}
- **Real-visitor CLS:** ${formatCls(speed.origin.cls)}
${pageLines || "- Page lab scores: Unavailable"}
${opportunity ? `- **Largest lab opportunity:** ${opportunity.title} (${formatMs(opportunity.savings_ms)})` : ""}

**💡 Key Takeaway:** ${origin}.`;
}

function speedFallbackAction(speed: StoreReportSpeed | null | undefined) {
  if (!speed) {
    return "Site speed was unavailable, so no performance action is inferred.";
  }
  const weakest = [...speed.pages]
    .filter((page) => page.lab_score != null)
    .sort((a, b) => (a.lab_score ?? 100) - (b.lab_score ?? 100))[0];
  const opportunity = speed.pages
    .flatMap((page) => page.opportunities)
    .sort((a, b) => b.savings_ms - a.savings_ms)[0];
  if (opportunity && weakest) {
    return `Work through ${opportunity.title.toLowerCase()} on the ${pageKindLabel(weakest.page_kind).toLowerCase()} (Lighthouse ${weakest.lab_score}).`;
  }
  if (weakest?.lab_score != null) {
    return `Review the ${pageKindLabel(weakest.page_kind).toLowerCase()} Lighthouse score of ${weakest.lab_score}.`;
  }
  return "Keep watching real-visitor Core Web Vitals.";
}

function salesTakeaway(digest: StoreReportDigest) {
  const salesChange = digest.sales.total_sales.change_pct;
  const orderChange = digest.sales.orders.change_pct;
  const aovChange = digest.sales.aov.change_pct;
  if (salesChange == null) return "Top-line sales comparison was not available this week.";
  if ((aovChange ?? 0) > 2 && (orderChange ?? 0) <= 2) {
    return "Basket value moved more than order volume this week.";
  }
  if ((orderChange ?? 0) > 2 && (aovChange ?? 0) <= 2) {
    return "Order volume moved more than basket value this week.";
  }
  return `Total sales were ${formatChangePct(salesChange)} versus last week.`;
}

function closingSentence(
  digest: StoreReportDigest,
  projectName: string,
  period: string,
) {
  const score = digest.scorecard.score;
  return `For ${projectName} in ${period}, the performance score was ${score}%, with ${digest.scorecard.greens} of 6 core metrics improving.`;
}
