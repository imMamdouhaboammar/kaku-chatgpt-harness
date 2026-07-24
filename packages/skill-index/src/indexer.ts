import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export interface SkillMetadata {
  name: string;
  description: string;
  sourcePath: string;
  contentHash: string;
  lastUpdated: string;
}

export class SkillIndexer {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skills (
        name TEXT PRIMARY KEY,
        description TEXT,
        source_path TEXT,
        content_hash TEXT,
        last_updated TEXT
      )
    `);
  }

  public indexDirectory(skillsDir: string): number {
    if (!existsSync(skillsDir)) return 0;
    let count = 0;
    const entries = readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        if (existsSync(skillFile)) {
          this.indexFile(skillFile, entry.name);
          count++;
        }
      }
    }
    return count;
  }

  public indexFile(filePath: string, defaultName: string): void {
    const content = readFileSync(filePath, "utf8");
    const hash = createHash("md5").update(content).digest("hex");

    let name = defaultName;
    let description = "";

    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, "");

    const descMatch = content.match(/^description:\s*(.+)$/m);
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, "");

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO skills (name, description, source_path, content_hash, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(name, description, filePath, hash, new Date().toISOString());
  }

  public getSkill(name: string): SkillMetadata | null {
    const row = this.db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as any;
    if (!row) return null;
    return {
      name: row.name,
      description: row.description,
      sourcePath: row.source_path,
      contentHash: row.content_hash,
      lastUpdated: row.last_updated
    };
  }

  public getAllSkills(): SkillMetadata[] {
    const rows = this.db.prepare("SELECT * FROM skills").all() as any[];
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      sourcePath: r.source_path,
      contentHash: r.content_hash,
      lastUpdated: r.last_updated
    }));
  }

  public close(): void {
    this.db.close();
  }
}
