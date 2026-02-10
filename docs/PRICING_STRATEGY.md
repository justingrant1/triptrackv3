# 💰 TripTrack Pricing Strategy

**Created:** February 6, 2026  
**Status:** Approved for Implementation

---

## 🎯 Core Pricing Philosophy

**"Let them feel the magic first, then gate the automation."**

The key insight: TripTrack's value isn't in *viewing* trips — it's in **not having to manually enter them**. The automation (email parsing, receipt OCR, AI concierge) is what people will pay for. So the free tier should let users experience the app's beautiful UI and manual workflow, while Pro unlocks the "it just works" automation layer.

---

## 📊 Pricing Tiers

### 🟢 **Free** — $0/forever
*"Beautiful trip tracking, by hand"*

| Feature | Limit |
|---------|-------|
| Trips | **3 active trips** |
| Reservations | Unlimited per trip |
| Receipts | **10 per month** |
| Manual entry | ✅ Full access |
| Email forwarding/parsing | ❌ |
| AI Concierge | **3 messages/day** (taste of magic) |
| Receipt OCR scanning | ❌ |
| Expense export | **Text only** |
| Push notifications | ✅ Basic reminders |
| Weather | ✅ |

**Why this works:** Users get a genuinely useful app. The 3-message AI limit lets them *feel* the concierge magic without giving it away. The trip limit creates natural upgrade pressure for frequent travelers.

---

### 🟡 **Pro** — **$11.99/mo** or **$99.99/yr** (save 30%)
*"Your trips, on autopilot"*

| Feature | Limit |
|---------|-------|
| Trips | **Unlimited** |
| Reservations | Unlimited |
| Receipts | **Unlimited** |
| Email forwarding/parsing | ✅ **Unlimited** |
| AI Concierge | ✅ **Unlimited** |
| Receipt OCR scanning | ✅ **Unlimited** |
| Expense export | ✅ **CSV + formatted reports** |
| Gmail auto-scan | ✅ |
| Push notifications | ✅ Smart reminders |
| Weather | ✅ Extended forecasts |
| Priority support | ✅ |

**Why $11.99/mo:** 
- It's below the $15 psychological barrier
- Annual at $99.99 is a clean number and ~30% savings (strong incentive)
- Undercuts TripIt Pro ($49/yr) on a feature basis while being more premium
- At 100 paying users = $1,200/mo revenue vs ~$300 costs = healthy margin

---

### 🔵 **Team** — **$39.99/mo** (up to 5 members, +$8/additional)
*"Travel management for your whole team"*

| Feature | Limit |
|---------|-------|
| Everything in Pro | ✅ |
| Team members | **5 included** (+$8/each) |
| Shared trip visibility | ✅ |
| Team expense reports | ✅ |
| Admin dashboard | ✅ |
| Centralized billing | ✅ |
| Dedicated support | ✅ |

**Why $39.99:** Lower than the $49-99 range for v1 team features. You want adoption over revenue initially. You can raise prices later once the team features are proven.

---

## 🚦 Paywall Trigger Points

These are the moments where we show the upgrade screen:

1. **4th trip creation** → "Upgrade to Pro for unlimited trips"
2. **Email forwarding tap** → "Pro feature: Auto-parse your travel emails"
3. **4th AI message of the day** → "You've used your 3 free messages today. Upgrade for unlimited AI assistance"
4. **Receipt OCR tap** → "Pro feature: Scan receipts with AI"
5. **11th receipt in a month** → "You've hit your free receipt limit"
6. **CSV/PDF export tap** → "Pro feature: Export formatted reports"
7. **Gmail connect tap** → "Pro feature: Auto-scan your Gmail"

**Key UX principle:** Never block the user harshly. Show a beautiful upgrade modal with the value proposition, and always offer a "Not now" dismiss.

---

## 📱 Implementation Plan

### 1. **Subscription Hook** (`src/lib/hooks/useSubscription.ts`)
- Check user's plan from profile
- Track usage counts (trips, messages, receipts)
- `canCreateTrip()`, `canUseAI()`, `canScanReceipt()`, `canExportCSV()` helper functions
- Gate features with clear boolean checks

### 2. **Upgrade Modal Component** (`src/components/UpgradeModal.tsx`)
- Beautiful modal with feature comparison
- Shows which feature triggered it
- Monthly vs Annual toggle
- "Start Free Trial" or "Upgrade" CTA
- Dismiss option

### 3. **Updated Subscription Screen** (`src/app/subscription.tsx`)
- New pricing tiers ($11.99/mo, $99.99/yr, $39.99/mo team)
- Current plan indicator
- Feature comparison grid
- *Purchase buttons ready for RevenueCat integration later*

### 4. **Feature Gating** across screens
- Trip creation check in `add-trip.tsx`
- AI message limit in `modal.tsx`
- Receipt OCR gate in `add-receipt.tsx`
- Export gate in `receipts.tsx`

---

## 💡 Launch Strategy

**Phase 1 (Now — Early Access):**
- Free + Pro at $11.99/mo / $99.99/yr
- No team tier yet (build demand first)
- Offer "Founding Member" badge for first 100 Pro subscribers

**Phase 2 (After 500 users):**
- Introduce Team tier
- A/B test $11.99 vs $12.99 monthly
- Add annual-only discount codes for marketing

**Phase 3 (After 2000 users):**
- Raise to $13.99/mo if conversion holds
- Introduce enterprise tier
- Consider lifetime deal for early adopters

---

## 📊 Competitive Positioning

| Service | Price | TripTrack Advantage |
|---------|-------|---------------------|
| TripIt Pro | ~$60-70/yr | We have AI concierge, receipt OCR, better UI |
| Google Trips | Free | We have automation, AI, expense tracking |
| Traditional planners | Often free | We have email parsing, AI, real-time updates |

**Value proposition:** TripTrack at $11.99/mo is justified because of AI Concierge, email auto-parse, receipt extraction, and expense reports — features competitors don't have.

---

## 💰 Cost + Revenue Analysis

### Monthly Operating Costs (estimated)

| Service | Cost per 100 users |
|---------|-------------------|
| Supabase | $25-50/mo |
| OpenAI GPT-4 | ~$50-100/mo |
| Email ingestion | $15-30/mo |
| Storage | Included in Supabase |
| **Total** | **~$90-180/mo** |

### Revenue Projections

**At 100 paying users (Pro @ $11.99/mo):**
- Revenue: $1,199/mo
- Costs: ~$150/mo
- **Profit: ~$1,049/mo** ✅

**At 500 paying users:**
- Revenue: $5,995/mo
- Costs: ~$400/mo
- **Profit: ~$5,595/mo** ✅

**Break-even:** ~15 paying users

---

## 🎯 Success Metrics

### Week 1 Post-Launch
- [ ] 100+ downloads
- [ ] 50+ sign-ups
- [ ] 10+ trips created
- [ ] 5+ Pro conversions

### Month 1
- [ ] 500+ downloads
- [ ] 200+ active users
- [ ] 20+ paying subscribers ($240 MRR)
- [ ] 4.5+ App Store rating

### Month 3
- [ ] 2000+ downloads
- [ ] 800+ active users
- [ ] 100+ paying subscribers ($1,200 MRR)
- [ ] Featured in App Store

---

## 🧠 Key Differences from Generic Pricing Models

| Decision | Generic Advice | Our Choice | Why |
|----------|---------------|------------|-----|
| **Pro price** | $9.99-$15 range | **$11.99/mo** | Sweet spot — not too cheap (devalues), not too expensive (friction) |
| **Annual** | $99-$129 | **$99.99/yr** | Clean number, 30% savings is compelling, under $100 feels accessible |
| **Free AI access** | None | **3 messages/day** | Critical for conversion — users need to *feel* the AI before paying |
| **Free receipts** | None | **10/month** | Lets casual travelers use it, creates upgrade pressure for business travelers |
| **Pay-per-parse** | $1/parse | **Skip for v1** | Adds complexity, confuses users, just push them to Pro |
| **Team price** | $49-99 | **$39.99** | Lower barrier for v1, prove the feature, raise later |
| **Credits system** | Often suggested | **Skip entirely** | Credits are confusing and feel nickel-and-dime-y. Subscriptions are cleaner. |

---

## ✅ Implementation Checklist

- [ ] Create `useSubscription` hook with feature gating
- [ ] Build `UpgradeModal` component
- [ ] Update subscription screen with new pricing
- [ ] Add paywall triggers to:
  - [ ] Trip creation (4th trip)
  - [ ] AI concierge (4th message/day)
  - [ ] Receipt OCR button
  - [ ] Receipt creation (11th receipt/month)
  - [ ] CSV export button
  - [ ] Gmail connect button
- [ ] Add usage tracking to profile:
  - [ ] `trips_count` (current active trips)
  - [ ] `ai_messages_today` (reset daily)
  - [ ] `receipts_this_month` (reset monthly)
- [ ] Test all paywall flows
- [ ] Prepare for RevenueCat integration (Phase 3)

---

## 📝 Notes

- **No credits system** — Keep it simple with clear tier limits
- **Free tier is generous** — 3 trips + 10 receipts + 3 AI messages/day is genuinely useful
- **Pro tier is the money maker** — Most users will upgrade here
- **Team tier is future-proofing** — Build it after Pro is proven
- **Annual discount is key** — 30% savings drives annual subscriptions and reduces churn

---

*This pricing strategy is designed to maximize conversion while providing genuine value at every tier. The free tier is generous enough to be useful, while the Pro tier unlocks the automation that makes TripTrack magical.*
