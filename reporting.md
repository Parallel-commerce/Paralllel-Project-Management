# 🧭 Parallel Commerce – Shopify Weekly Reporting Instruction Document
**Version:** 2.0 (Standardized Data + Percentage-Based Scoring)  
**Last Updated:** February 2026  
**Author:** Matthew Collins, Parallel Commerce  
**Purpose:** To standardise the generation of weekly Shopify performance reports across all Parallel Commerce clients, with clear narrative summaries followed by data-backed bullet points for every section.
 
---
 
## Client Setup Information
Each client chat must begin with:
 
- **Client Name:** [Client Name]
- **Currency:** [Symbol]
- **Industry / Store Type:** [e.g., Fashion, Home Goods, Beauty]
- **Reporting Period:** [Week commencing date] to [Week ending date]
- **Notes:** [Any client-specific context]
---
 
## 1. Objective
To enable an LLM to generate a **comprehensive, plain-English weekly Shopify report**, combining:
- A visual scorecard with percentage-based performance score
- Rich narrative summaries  
- Data-backed bullet points  
- Clear, actionable recommendations  
- Consistent structure for all clients  
---
 
## 2. Required Input Files
 
**ALL files below must be provided for every client report.** This ensures consistency across all Parallel Commerce clients.
 
Each week, the following Shopify reports must be uploaded as CSV files:
 
| # | Category | Shopify Report Name | Filename Convention | Required For Section(s) |
|---|----------|---------------------|---------------------|------------------------|
| 1 | Sales | Total Sales Over Time | `total_sales_over_time.csv` | Scorecard, Section 2 |
| 2 | Sales | Average Order Value Over Time | `average_order_value_over_time.csv` | Scorecard, Section 2 |
| 3 | Conversion | Conversion Rate Over Time | `conversion_rate_over_time.csv` | Scorecard, Section 5 |
| 4 | Customers | New vs Returning Customers Over Time | `new_vs_returning_customers_over_time.csv` | Section 4 |
| 5 | Retention | Returning Customer Rate Over Time | `returning_customer_rate_over_time.csv` | Scorecard, Section 4 |
| 6 | Products | Products by Sell-Through Rate | `products_by_sell_through_rate.csv` | Section 6 |
| 7 | Traffic | Sessions Over Time | `sessions_over_time.csv` | Scorecard, Section 5, Section 7 |
| 8 | Channels | Net Sales by Sales Channel | `net_sales_by_sales_channel.csv` | Section 3 |
| 9 | Referrers | Sessions by Referrer | `sessions_by_referrer.csv` | Section 7 |
| 10 | Discounts | Discounts by Order | `discounts_by_order.csv` | Section 2 |
 
**Note:** All CSV files should contain data for at minimum the current week and previous week to enable week-over-week comparison.
 
---
 
## 3. Output Requirements
 
The model must output a complete client-ready report including:
 
1. **Header:** Client name, currency, reporting period  
2. **Scorecard Summary Table** with week-on-week change and visual indicators  
3. **Weekly Performance Score** (percentage-based, 0–100%)
4. **Narrative Sections**, each using the "Summary + Data + Takeaway" structure  
5. **Clear recommendations** for the upcoming week (Section 8)
6. **Closing summary sentence**  
---
 
## 4. Section Format Standard
 
**Every section in the report must use the following three-part structure:**
 
### **A. Rich Summary (2–3 Sentences)**
Explain:
- What changed  
- Why it changed  
- What matters most  
**Tone:** Concise, plain UK English, no jargon.
 
---
 
### **B. Supporting Data (Bullet Points)**
List the specific data points that support the summary.
 
**Example:**
- **Total Sales:** £8,240 (+4%)  
- **Orders:** 112 (−3%)  
- **AOV:** £75.18 (+7%)  
---
 
### **C. Key Takeaway (One Sentence)**
End every section with a single takeaway:
 
> **💡 Key Takeaway:** Growth was driven by higher basket value rather than more orders.
 
---
 
# 5. REPORT STRUCTURE
 
---
 
## Section 1: 📊 Scorecard Summary
 
Generate a table showing the six core metrics with week-over-week comparison:
 
| Metric | This Week | Last Week | Change | Trend |
|---------|------------|------------|---------|--------|
| Total Sales | £[x,xxx] | £[x,xxx] | [+x% / −x%] | 🟢🔴⚪ |
| Orders | [x] | [x] | [+x% / −x%] | 🟢🔴⚪ |
| Conversion Rate | [x%] | [x%] | [+x% / −x%] | 🟢🔴⚪ |
| Average Order Value | £[xx.xx] | £[xx.xx] | [+x% / −x%] | 🟢🔴⚪ |
| Returning Customer Rate | [x%] | [x%] | [+x% / −x%] | 🟢🔴⚪ |
| Sessions | [x,xxx] | [x,xxx] | [+x% / −x%] | 🟢🔴⚪ |
 
**Trend Key:**
- 🟢 Improved from last week
- ⚪ No significant change (within ±2%)
- 🔴 Declined from last week
---
 
### **Weekly Performance Score: X%**
 
**Calculation Method:**
- Count the number of 🟢 (improved metrics)
- Divide by total number of metrics (6)
- Multiply by 100
**Formula:** `(Number of 🟢 / 6) × 100 = X%`
 
**Interpretation Guide:**
- **80–100%:** Strong week – most metrics trending positively
- **50–79%:** Mixed performance – some wins, some areas need attention
- **25–49%:** Challenging week – more declines than improvements
- **0–24%:** Difficult week – most metrics declined
**Example:** If 4 out of 6 metrics improved:  
**(4 / 6) × 100 = 67%** – "This week showed positive momentum with 67% of core metrics improving."
 
---
 
## Section 2: 💰 Sales and Revenue
 
**Data Sources:** `total_sales_over_time.csv`, `average_order_value_over_time.csv`, `discounts_by_order.csv`
 
### **Summary**
Explain top-line sales performance, key drivers, and notable patterns. Focus on whether growth came from volume (more orders) or value (higher AOV), and the role of discounting.
 
### **Supporting Data**
- **Total Sales:** £[x,xxx] ([+x% / −x%] vs last week)
- **Orders:** [x] ([+x% / −x%])  
- **Average Order Value:** £[xx.xx] ([+x% / −x%])  
- **Discount Impact:** [x%] of orders used discounts ([+x% / −x%])
- **Average Discount Amount:** £[xx.xx]
- **Strongest Day:** [Day] (£[x,xxx] in sales)
- **Weakest Day:** [Day] (£[x,xxx] in sales)
### **Key Takeaway**
> 💡 [One sentence summarizing the main driver of sales performance]
 
---
 
## Section 3: 🛒 Sales Channels Breakdown
 
**Data Sources:** `net_sales_by_sales_channel.csv`
 
### **Summary**
Describe which channels drove growth and which declined. Explain any notable shifts in channel mix.
 
### **Supporting Data**
- **Online Store:** £[x,xxx] ([xx%] of total sales, [+x% / −x%])  
- **[Channel 2]:** £[x,xxx] ([xx%] of total, [+x% / −x%])  
- **[Channel 3]:** £[x,xxx] ([xx%] of total, [+x% / −x%])
- **Channel with Biggest Growth:** [Channel name]
- **Channel with Biggest Decline:** [Channel name]
### **Key Takeaway**
> 💡 [One sentence identifying the strongest or weakest performing channel]
 
---
 
## Section 4: 👥 Customers
 
**Data Sources:** `new_vs_returning_customers_over_time.csv`, `returning_customer_rate_over_time.csv`
 
### **Summary**
Explain the balance between new customer acquisition and repeat purchases. Highlight whether growth is driven by attracting new shoppers or retaining existing ones.
 
### **Supporting Data**
- **New Customers:** [x] ([+x% / −x%])
- **Returning Customers:** [x] ([+x% / −x%])
- **Returning Customer Rate:** [x%] ([+x% / −x%])
- **New vs Returning Split:** [x%] new, [x%] returning
- **Shift from Last Week:** [Describe any notable change in the mix]
### **Key Takeaway**
> 💡 [One sentence stating whether the week was driven by acquisition or retention]
 
---
 
## Section 5: 🎯 Conversion Performance
 
**Data Sources:** `conversion_rate_over_time.csv`, `sessions_over_time.csv`, `total_sales_over_time.csv`
 
### **Summary**
Explain changes in conversion rate and what this indicates about traffic quality or site performance. Note any patterns in when conversion was strongest or weakest.
 
### **Supporting Data**
- **Conversion Rate:** [x%] ([+x% / −x%])
- **Total Sessions:** [x,xxx] ([+x% / −x%])
- **Total Orders:** [x] ([+x% / −x%])
- **Best Converting Day:** [Day] ([x%] conversion)
- **Worst Converting Day:** [Day] ([x%] conversion)
### **Key Takeaway**
> 💡 [One sentence explaining the primary factor affecting conversion]
 
---
 
## Section 6: 📦 Inventory and Products
 
**Data Sources:** `products_by_sell_through_rate.csv`
 
### **Summary**
Highlight best sellers, slow movers, and any stock concerns. Identify products requiring restock attention or promotional support.
 
### **Supporting Data**
- **Top 3 Sellers:** 
  1. [Product A] – [x units], [x%] sell-through
  2. [Product B] – [x units], [x%] sell-through
  3. [Product C] – [x units], [x%] sell-through
- **Products with High Sell-Through (>80%):** [List products at risk of stock-out]
- **Products with Low Sell-Through (<20%):** [List slow movers]
- **Stock Action Required:** [Yes/No – explain]
### **Key Takeaway**
> 💡 [One sentence identifying the key inventory action needed]
 
---
 
## Section 7: 🌐 Traffic and Sessions
 
**Data Sources:** `sessions_over_time.csv`, `sessions_by_referrer.csv`
 
### **Summary**
Interpret traffic levels, quality, and sources. Explain notable changes in visitor numbers and where they came from.
 
### **Supporting Data**
- **Total Sessions:** [x,xxx] ([+x% / −x%])
- **Top 3 Referrer Sources:**
  1. [Source A] – [x,xxx] sessions ([xx%] of total)
  2. [Source B] – [x,xxx] sessions ([xx%] of total)
  3. [Source C] – [x,xxx] sessions ([xx%] of total)
- **Strongest Traffic Day:** [Day] ([x,xxx] sessions)
- **Notable Shifts:** [Describe any significant changes in referrer mix]
### **Key Takeaway**
> 💡 [One sentence explaining what drove traffic changes]
 
---
 
## Section 8: 💡 Insights and Actions for Next Week
 
Provide 4–6 actionable recommendations grouped by theme. Be specific and reference the data points that support each recommendation.
 
### **Sales**
- [Specific action based on sales data]
### **Marketing**
- [Specific action based on traffic/channel data]
### **Customer Experience / Conversion**
- [Specific action based on conversion or customer data]
### **Inventory**
- [Specific action based on product performance]
### **Additional Priority**
- [Any other critical action]
---
 
## Section 9: Closing Summary
 
End the report with a single sentence that captures the overall story of the week.
 
**Example:**  
"This was a week of strong momentum driven by higher average order values and improved customer retention, with online store performance leading the way."
 
---
 
# 6. Tone and Language Rules
 
- **Use plain UK English** – avoid Americanisms
- **No em-dashes** – use commas or full stops
- **Avoid jargon** – write for business owners, not analysts
- **Keep explanations clear and helpful** – focus on "what this means" not just "what happened"
- **Be specific with numbers** – always include the actual figures alongside percentages
- **Focus on insights, not just data** – explain the "why" behind changes
---
 
# 7. Quality Standards Checklist
 
Before finalizing any report, verify:
 
- [ ] All six scorecard metrics are present with week-over-week comparison
- [ ] Weekly Performance Score is calculated correctly and includes interpretation
- [ ] Every section uses the Summary + Data + Takeaway structure
- [ ] All percentages show direction of change (+x% or −x%)
- [ ] Currency symbol is correct for the client
- [ ] Recommendations are specific and actionable (not generic)
- [ ] Closing summary captures the week's overall narrative
- [ ] No jargon or overly technical language
- [ ] Numbers are formatted consistently (e.g., £1,234 not £1234)
- [ ] Trend indicators (🟢🔴⚪) are accurate
---
 
# 8. Workflow Logic
 
1. **Receive CSV files** – Verify all 10 required files are present
2. **Extract current week and previous week data** from each CSV
3. **Calculate week-over-week changes** for all metrics
4. **Generate Scorecard** with trend indicators
5. **Calculate Weekly Performance Score** 
6. **Write narrative sections** following the three-part structure
7. **Generate recommendations** based on patterns identified
8. **Quality check** against standards checklist
9. **Output final report** in markdown format
---
 
# 9. File Naming Convention
 
**Output filename format:**  
`[ClientName]_Weekly_Report_[WeekEndingDate].md`
 
**Example:**  
`FortyClothing_Weekly_Report_2026-02-09.md`
 
---
 
# 10. Example Calculation: Weekly Performance Score
 
**Scenario:**
- Total Sales: £8,450 (↑ 5%) → 🟢
- Orders: 115 (↓ 2%) → 🔴
- Conversion Rate: 2.8% (↑ 0.3%) → 🟢
- AOV: £73.48 (↑ 7%) → 🟢
- Returning Customer Rate: 24% (↔ 0%) → ⚪
- Sessions: 4,100 (↑ 3%) → 🟢
**Calculation:**
- Number of 🟢: 4
- Total metrics: 6
- Score: (4/6) × 100 = **67%**
**Interpretation to include in report:**  
"**Weekly Performance Score: 67%** – This week showed positive momentum with two-thirds of core metrics improving, particularly in sales value and traffic quality."
 
---
 
**END OF INSTRUCTION DOCUMENT**
 