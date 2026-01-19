# Architecture Clarification Request

**Date**: 2026-01-19  
**From**: Implementation Agent  
**To**: Architecture Agent  
**Re**: Feature Clarifications for Pending Implementation

---

## Background

The implementation agent has completed a comprehensive analysis of the codebase (see docs/IMPLEMENTED.md). The current implementation is ~70% complete with solid infrastructure (95%) and backend APIs (80%), but several features require clarification before proceeding with Phase 1 implementation.

**Current Status**: ✅ Approved for QA - Ready to proceed with testing and remaining features

---

## Questions Requiring Clarification

### 1. Character Usage Tracking (MEDIUM Priority)

**Context**: Architecture document mentions "使用キャラクター記録（戦略分析用）" but details are minimal.

**Database Schema Impact**:
```prisma
// Proposed addition to BMMatch, MRMatch, GPMatch models
player1Character String? // "Mario", "Luigi", etc.
player2Character String?
```

**Questions**:
1. **Requirement Level**: Should character data be **required** or **optional**?
   - If optional: What happens when participants don't select character?
   - If required: Should we block score entry without character selection?

2. **Scope**: Should we track character selection in:
   - All 4 modes (BM, MR, GP, TA)? 
   - Only specific modes (e.g., BM and MR)?
   - Time Trial seems less relevant - confirm?

3. **Character List**: 
   - Should we use a predefined list (Mario, Luigi, Yoshi, etc.)?
   - Free text input?
   - How many characters in Super Mario Kart (SNES)?

4. **Analytics Requirements**:
   - What specific reports/analytics are needed from this data?
   - Examples: Win rate by character? Most popular character? Character matchup matrix?
   - Should we add a dedicated analytics page?

5. **Migration Strategy**:
   - What happens to existing tournament data when we add this field?
   - Should existing matches have null characters or require backfill?

---

### 2. Real-time Ranking Display (HIGH Priority)

**Context**: Architecture doc states "リアルタイム順位表示" as a key feature, but implementation details unclear.

**Questions**:
1. **Page Structure**:
   - Separate page (`/tournaments/[id]/leaderboard`) or embedded in tournament dashboard?
   - Should this be a tab on the tournament page or a standalone view?

2. **Spectator Mode**:
   - Do we need a **spectator-only mode** (no admin controls visible)?
   - Should this be accessible without authentication (public URL)?
   - Different UI for projector/large screen display?

3. **Update Frequency**:
   - What update frequency is acceptable: 3s, 5s, 10s?
   - Architecture doc mentions "最大3秒遅延" but should we use 5s for better performance?
   - Should update interval be configurable per tournament?

4. **Data Display**:
   - Should rankings show:
     - Current standings only?
     - Recent match results (live feed)?
     - Match schedule (upcoming matches)?
     - All of the above?

5. **Game Mode Support**:
   - Single leaderboard for all modes or mode-specific tabs?
   - How to handle tournaments with multiple modes active?

---

### 3. Excel Export Enhancement (MEDIUM Priority)

**Context**: Basic export is implemented using `xlsx` library, but architecture doc mentions "Excel形式でエクスポート" without details.

**Questions**:
1. **Priority Level**:
   - Is the current **basic export sufficient for MVP**?
   - Or should we implement advanced features (charts, multi-sheet) before launch?

2. **Export Format**:
   - Single worksheet with all data?
   - **Multi-sheet workbook** (one sheet per mode)?
   - Recommended structure?

3. **Visual Enhancements**:
   - Should we add **charts** (win/loss distribution, time trends)?
   - If yes, which chart types are needed (bar, line, pie)?
   - Priority order?

4. **Finals Bracket Export**:
   - How should finals brackets be exported?
   - As **tables** (match progression)?
   - As **images** (visual bracket diagram)?
   - Or both?

5. **Styling**:
   - Plain data or formatted tables (colors, borders, bold headers)?
   - Should we follow a specific template/style guide?

---

### 4. Testing Strategy (CRITICAL Priority)

**Context**: No automated tests currently exist. This is a blocker for production deployment.

**Questions**:
1. **Test Coverage Target**:
   - What is the **required test coverage percentage** for production?
   - Industry standard is 70-80% - is this acceptable?
   - Critical paths that must be 100% covered?

2. **Test Types Priority**:
   - Unit tests: High priority?
   - Integration tests: Medium priority?
   - E2E tests: Can be deferred post-launch?

3. **Production Gate**:
   - Are **E2E tests needed before production** or can they be deferred?
   - Minimum test suite required for first deployment?

4. **Test Data**:
   - Should we create seed data for testing?
   - How to handle test isolation (separate test database)?

---

### 5. Security - CAPTCHA Implementation (MEDIUM Priority)

**Context**: Architecture doc mentions CAPTCHA as optional feature for participant score entry.

**Questions**:
1. **Trigger Conditions**:
   - When should CAPTCHA be triggered?
   - After X failed attempts?
   - Based on IP reputation?
   - Always-on for all participant entries?

2. **CAPTCHA Provider**:
   - Google reCAPTCHA v2 (checkbox)?
   - reCAPTCHA v3 (invisible)?
   - hCaptcha (privacy-focused alternative)?
   - Turnstile (Cloudflare)?

3. **Scope**:
   - Only for participant score entry?
   - Also for tournament creation?
   - Player registration?

4. **MVP Status**:
   - Should this be implemented for MVP or deferred?
   - Risk assessment: How critical is this for first tournament?

---

### 6. Security - IP Restrictions (LOW Priority)

**Context**: Architecture mentions "IP制限（オプション）" as an optional security feature.

**Questions**:
1. **Scope Level**:
   - Tournament-level (different tournaments have different IP whitelists)?
   - System-level (global whitelist)?
   - Or both?

2. **Use Case**:
   - What is the expected use case?
   - Venue-only access (tournament location)?
   - VPN/organization restriction?

3. **Implementation**:
   - Static IP whitelist?
   - IP range (CIDR notation)?
   - Dynamic IP support (how to handle)?

4. **MVP Status**:
   - Required for first deployment or can be deferred?

---

### 7. Deployment Strategy

**Questions**:
1. **Staging Environment**:
   - Is a **staging environment needed** before production?
   - Or can we deploy directly to production with feature flags?

2. **Deployment Method**:
   - Blue-green deployment?
   - Canary deployment?
   - Direct rollout?

3. **Rollback Plan**:
   - How to handle failed deployments?
   - Database migration rollback strategy?

4. **First Tournament**:
   - Is there a specific date for the first tournament?
   - This will drive our MVP timeline

---

## Recommended Priorities (Pending Your Input)

Based on analysis, I propose the following priority order:

### Phase 1 (Week 1-2) - MVP Blockers
1. **Testing Infrastructure** 🔴 (CRITICAL)
2. **Real-time Ranking Display** 🟡 (HIGH) - *Pending your clarification*
3. **Character Tracking** 🟢 (MEDIUM) - *Pending your clarification*

### Phase 2 (Week 3-4) - Polish & Launch
4. **Enhanced Excel Export** 🟢 (MEDIUM) - *Pending your clarification*
5. **Error Boundaries & UX** 🟢 (MEDIUM)
6. **Documentation** 📝 (MEDIUM)

### Phase 3 (Post-MVP) - Advanced Features
7. **CAPTCHA** 🔐 (OPTIONAL) - *Pending your decision*
8. **IP Restrictions** 🔐 (OPTIONAL) - *Pending your decision*
9. **Performance Optimization** ⚡ (ONGOING)

**Does this priority order align with your vision?**

---

## Additional Questions

1. **Timeline Constraints**:
   - What is the target launch date?
   - Are there any hard deadlines we need to meet?

2. **User Acceptance Testing**:
   - Should we conduct UAT with tournament organizers before launch?
   - How many test tournaments should we run?

3. **Feature Flags**:
   - Should we implement feature flags for gradual rollout?
   - Or full deployment of all features at once?

4. **Post-Launch Support**:
   - Expected support model (24/7, business hours, community-driven)?
   - Bug fix SLA?

---

## Summary

**Total Questions**: 20+ across 7 categories

**Most Critical for Immediate Progress**:
1. Character tracking requirements (affects database schema)
2. Real-time ranking display structure (affects UI architecture)
3. Testing strategy (blocks production deployment)

**Can Be Deferred**:
1. CAPTCHA details (optional feature)
2. IP restrictions (optional feature)
3. Advanced Excel features (nice-to-have)

**Requested Action**: Please review and provide guidance on the questions above, prioritizing the critical items. This will enable the implementation agent to proceed with Phase 1 development.

---

**Prepared By**: Implementation Agent  
**Date**: 2026-01-19  
**Status**: ⏳ Awaiting Architecture Agent Response  
**Reference**: docs/IMPLEMENTED.md (Implementation Analysis Report)
