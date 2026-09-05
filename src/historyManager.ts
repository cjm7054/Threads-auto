import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface HistoryRecord {
  keyword: string;
  publishedAt: string;
  threadId?: string;
}

export class HistoryManager {
  private historyPath: string;

  constructor(filePath?: string) {
    this.historyPath = filePath || resolve(process.cwd(), "content", "published_history.json");
  }

  loadHistory(): HistoryRecord[] {
    if (!existsSync(this.historyPath)) {
      return [];
    }
    try {
      const raw = readFileSync(this.historyPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  saveHistory(records: HistoryRecord[]): void {
    writeFileSync(this.historyPath, JSON.stringify(records, null, 2), "utf-8");
  }

  isAlreadyPublished(keyword: string): boolean {
    const records = this.loadHistory();
    // 최근 7일 이내에 이미 발행된 키워드인지 확인
    const normalized = keyword.trim().toLowerCase();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return records.some((r) => {
      const isSame = r.keyword.trim().toLowerCase() === normalized;
      const isRecent = new Date(r.publishedAt).getTime() > sevenDaysAgo;
      return isSame && isRecent;
    });
  }

  addRecord(keyword: string, threadId?: string): void {
    const records = this.loadHistory();
    records.push({
      keyword,
      publishedAt: new Date().toISOString(),
      threadId,
    });
    this.saveHistory(records);
  }
}
