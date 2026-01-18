# Task 1: Update Prisma Schema with Version Fields

## Objective
Add optimistic locking version fields to all Tournament, Player, and Match-related models according to ARCHITECTURE.md section 8.2 specifications.

## Files to Modify
- `/Users/azumag/work/JSMKC/jsmkc-app/prisma/schema.prisma`

## Specific Requirements

### 1. Add Version Fields to These Models:
- **Tournament**: Add `version Int @default(0)`
- **Player**: Add `version Int @default(0)`
- **BMMatch**: Add `version Int @default(0)`
- **MRMatch**: Add `version Int @default(0)`
- **GPMatch**: Add `version Int @default(0)`
- **TTEntry**: Add `version Int @default(0)`

### 2. Follow Exact Architecture Pattern:
```prisma
model Tournament {
  id        String   @id @default(cuid())
  name      String
  date      DateTime
  status    String   @default("draft")
  version   Int      @default(0) // 楽観的ロック用バージョン
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // ... rest of fields
}
```

### 3. Validation Requirements:
- All version fields must have `@default(0)`
- Place version fields after the primary identifier fields but before timestamps
- Maintain existing field ordering and relationships
- Ensure no syntax errors in schema

### 4. Critical Review Points:
- [ ] Are all target models updated with version fields?
- [ ] Is the field placement consistent across models?
- [ ] Are default values correctly set to 0?
- [ ] Does the schema remain syntactically correct?
- [ ] Are all existing relationships preserved?

## Implementation Notes
- This is the foundation for the entire optimistic locking system
- Any syntax errors will break database migrations
- Version fields must be integers starting from 0
- Do not modify any other aspects of the models

## Next Steps
After this task is complete, the next subagent will:
1. Generate Prisma migration for the new version columns
2. Implement the OptimisticLockError class and utilities
3. Update API routes to use version checking

## Success Criteria
- Schema compiles without errors using `npx prisma validate`
- All target models have version fields with proper defaults
- No existing functionality is broken