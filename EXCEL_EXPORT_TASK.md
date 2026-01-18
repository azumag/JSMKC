# Excel Export Implementation Task

## Overview
Implement Excel export functionality for tournament results in the JSMKC scoring system using the xlsx library (SheetJS).

## Requirements

### 1. Install xlsx Library
- Install `xlsx` (SheetJS) library as a production dependency

### 2. API Endpoints (Backend)
Create export API endpoints for each game mode:

#### Time Trial Export
- `GET /api/tournaments/[id]/ta/export`
- Export qualification standings, finals results, and match details

#### Battle Mode Export
- `GET /api/tournaments/[id]/bm/export`
- Export qualification standings, finals results (double elimination), and match details

#### Match Race Export
- `GET /api/tournaments/[id]/mr/export`
- Export qualification standings, finals results, and match details

#### Grand Prix Export
- `GET /api/tournaments/[id]/gp/export`
- Export qualification standings, finals results, and match details

### 3. Excel File Structure

Each export should include:
- **Sheet 1: Tournament Summary**
  - Tournament name
  - Date
  - Game mode
  - Number of participants

- **Sheet 2: Qualification Standings** (if applicable)
  - Player name
  - Score/Time
  - Rank
  - All match results

- **Sheet 3: Finals Results** (if applicable)
  - Round/Bracket information
  - Match results
  - Winner/Runner-up

- **Sheet 4: Match Details** (all matches)
  - Match ID
  - Players involved
  - Course/Arena
  - Scores/Times
  - Match timestamp

### 4. Excel Formatting
- Use bold headers with background colors
- Freeze header rows
- Auto-fit column widths
- Apply cell borders for readability
- Use date/time formatting where appropriate
- Include title at the top of each sheet

### 5. Frontend Integration
Add export buttons to tournament detail pages:

#### Time Trial Page (`/tournaments/[id]/ta/page.tsx`)
- Add "Export to Excel" button in the header area
- Button should be mobile-friendly
- Show loading state during export
- Download the file with name format: `[tournament-name]-ta-[date].xlsx`

#### Battle Mode Page (`/tournaments/[id]/bm/page.tsx`)
- Add "Export to Excel" button
- Same naming format: `[tournament-name]-bm-[date].xlsx`

#### Match Race Page (`/tournaments/[id]/mr/page.tsx`)
- Add "Export to Excel" button
- Same naming format: `[tournament-name]-mr-[date].xlsx`

#### Grand Prix Page (`/tournaments/[id]/gp/page.tsx`)
- Add "Export to Excel" button
- Same naming format: `[tournament-name]-gp-[date].xlsx`

### 6. Data Collection

For each game mode, collect comprehensive data:

**Time Trial:**
- All course times for each player
- Total time calculations
- Qualification standings
- Finals bracket results (if applicable)

**Battle Mode:**
- Group stage matches
- Win/loss records
- Points earned
- Finals double elimination bracket

**Match Race:**
- Group stage matches
- Win/loss records
- Finals bracket

**Grand Prix:**
- Cup selections
- Driver's points
- Race results per course

### 7. Implementation Details

**API Response:**
- Return Excel file as a downloadable blob
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Set appropriate headers for file download

**Error Handling:**
- Handle cases where no data exists
- Return appropriate error messages
- Validate tournament ID exists

**Security:**
- No authentication required for viewing results (read-only)
- Log export requests in audit logs

## Technical Constraints

1. Use existing database models (check Prisma schema)
2. Follow existing code patterns and conventions
3. Use TypeScript for type safety
4. Follow the project's existing error handling patterns
5. Ensure mobile-friendly UI components

## Deliverables

1. Updated `package.json` with xlsx dependency
2. API route files for each game mode export
3. Updated tournament detail page components with export buttons
4. Comprehensive data collection and formatting
5. Test exports for each game mode

## Testing Checklist

- [ ] Export works for Time Trial tournaments
- [ ] Export works for Battle Mode tournaments
- [ ] Export works for Match Race tournaments
- [ ] Export works for Grand Prix tournaments
- [ ] Excel files have proper formatting
- [ ] Export buttons work on mobile
- [ ] Files download with correct names
- [ ] All necessary data is included in exports
- [ ] No TypeScript errors
- [ ] No ESLint errors

## Notes

- Refer to existing API route implementations for patterns
- Check the Prisma schema for available data models
- Use existing UI components from `/src/components/ui/`
- Follow the code style of existing files
