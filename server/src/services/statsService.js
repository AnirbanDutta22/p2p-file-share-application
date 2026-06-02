import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.join(__dirname, "../../data/stats.json");

export class StatsService {
  constructor() {
    /** @type {Set<string>} */
    this.knownVisitors = new Set();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
        if (Array.isArray(data.knownVisitorIds)) {
          this.knownVisitors = new Set(data.knownVisitorIds);
        } else {
          // Legacy file only had an inflated totalUsersEver — start fresh visitor list
          this.knownVisitors = new Set();
        }
      }
    } catch (err) {
      console.warn("[STATS] Could not load stats file:", err.message);
      this.knownVisitors = new Set();
    }
  }

  save() {
    try {
      const dir = path.dirname(STATS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        STATS_FILE,
        JSON.stringify(
          {
            totalUsersEver: this.knownVisitors.size,
            knownVisitorIds: [...this.knownVisitors],
          },
          null,
          2,
        ),
      );
    } catch (err) {
      console.warn("[STATS] Could not save stats file:", err.message);
    }
  }

  /** Returns true if this is a brand-new browser (first visit). */
  registerVisitor(visitorId) {
    if (!visitorId || typeof visitorId !== "string") {
      return false;
    }
    if (this.knownVisitors.has(visitorId)) {
      return false;
    }
    this.knownVisitors.add(visitorId);
    this.save();
    return true;
  }

  getSnapshot(onlineNow) {
    return {
      totalUsersEver: this.knownVisitors.size,
      onlineNow,
    };
  }
}
