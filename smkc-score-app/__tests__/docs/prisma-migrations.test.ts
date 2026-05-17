import fs from "fs";
import path from "path";

function readMigration(...segments: string[]) {
  return fs.readFileSync(path.join(__dirname, "../../prisma/migrations", ...segments), "utf8");
}

function migrationSqlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return migrationSqlFiles(entryPath);
    }

    return entry.name === "migration.sql" ? [entryPath] : [];
  });
}

describe("Prisma migration compatibility", () => {
  it("does not use JSONB in any migration because Cloudflare D1 applies SQLite SQL", () => {
    const migrationsDir = path.join(__dirname, "../../prisma/migrations");
    // Prisma SQLite Json columns are generated as JSONB, but D1 migration execution
    // accepts SQLite-compatible storage classes. A global guard prevents future
    // generated migrations from reintroducing the unsupported type silently.
    const jsonbMigrations = migrationSqlFiles(migrationsDir)
      .filter((file) => readMigration(path.relative(migrationsDir, file)).includes("JSONB"))
      .map((file) => path.relative(migrationsDir, file));

    expect(jsonbMigrations).toEqual([]);
  });

  it("keeps TA sudden-death JSON columns compatible with SQLite/D1 text storage", () => {
    const migration = readMigration("0010_ta_phase_sudden_death", "migration.sql");

    expect(migration).not.toContain("JSONB");
    expect(migration).toContain('"targetPlayerIds" TEXT NOT NULL');
    expect(migration).toContain('"results" TEXT');
  });

  it("keeps recent GP finals JSON columns compatible with SQLite/D1 text storage", () => {
    const cupResults = readMigration("0010_gp_finals_cup_results", "migration.sql");
    const assignedCups = readMigration("0015_gp_finals_assigned_cups", "migration.sql");

    expect(cupResults).not.toContain("JSONB");
    expect(cupResults).toContain('"cupResults" TEXT');
    expect(assignedCups).not.toContain("JSONB");
    expect(assignedCups).toContain('"assignedCups" TEXT');
  });
});
