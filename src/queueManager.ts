import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface QueueItem {
  id: string;
  text: string;
  imageUrl?: string;
  linkAttachment?: string;
  status: "pending" | "published" | "failed";
  scheduledFor?: string; // YYYY-MM-DD HH:mm
  publishedAt?: string;
  threadId?: string;
  lastError?: string;
}

export class QueueManager {
  private queuePath: string;

  constructor(filePath?: string) {
    this.queuePath = filePath || resolve(process.cwd(), "content", "queue.json");
  }

  loadQueue(): QueueItem[] {
    if (!existsSync(this.queuePath)) {
      return [];
    }
    const raw = readFileSync(this.queuePath, "utf-8");
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  saveQueue(items: QueueItem[]): void {
    writeFileSync(this.queuePath, JSON.stringify(items, null, 2), "utf-8");
  }

  getNextPendingItem(): QueueItem | null {
    const items = this.loadQueue();
    const now = new Date();

    const pending = items.find((item) => {
      if (item.status !== "pending") return false;
      if (!item.scheduledFor) return true; // 예약 시간 없으면 우선 발행 대상
      const scheduledDate = new Date(item.scheduledFor);
      return scheduledDate <= now;
    });

    return pending || null;
  }

  markAsPublished(id: string, threadId: string): void {
    const items = this.loadQueue();
    const target = items.find((i) => i.id === id);
    if (target) {
      target.status = "published";
      target.publishedAt = new Date().toISOString();
      target.threadId = threadId;
      delete target.lastError;
      this.saveQueue(items);
    }
  }

  markAsFailed(id: string, errorMsg: string): void {
    const items = this.loadQueue();
    const target = items.find((i) => i.id === id);
    if (target) {
      target.status = "failed";
      target.lastError = errorMsg;
      this.saveQueue(items);
    }
  }
}
