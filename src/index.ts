import { ThreadsClient } from "./threadsClient";
import { QueueManager } from "./queueManager";

// Bun 및 최신 Node는 .env를 자동 로드하거나 기본 제공 기능을 사용합니다.
if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {}
}

async function main() {
  const isDryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
  const isPostNext = process.argv.includes("--post-next") || !process.argv.includes("--manual");

  const userId = process.env.THREADS_USER_ID || "";
  const accessToken = process.env.THREADS_ACCESS_TOKEN || "";

  if (!isDryRun && (!userId || !accessToken)) {
    console.error("❌ 에러: THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경 변수가 설정되지 않았습니다.");
    console.error("💡 .env 파일 또는 GitHub Repository Secrets에 환경 변수를 등록해주세요.");
    process.exit(1);
  }

  const client = new ThreadsClient(userId, accessToken, isDryRun);
  const queueManager = new QueueManager();

  if (isPostNext) {
    console.log("🔍 대기 중인 예약 스레드 검색 중...");
    const nextItem = queueManager.getNextPendingItem();

    if (!nextItem) {
      console.log("ℹ️ 현재 대기 중인(pending) 포스트가 없습니다. (content/queue.json 확인)");
      return;
    }

    console.log(`📌 포스팅 대상 발견 (ID: ${nextItem.id}): "${nextItem.text.slice(0, 30)}..."`);

    const result = await client.post({
      text: nextItem.text,
      imageUrl: nextItem.imageUrl,
      linkAttachment: nextItem.linkAttachment,
    });

    if (result.success && result.threadId) {
      queueManager.markAsPublished(nextItem.id, result.threadId);
      console.log(`🎉 [ID: ${nextItem.id}] 성공적으로 포스팅되고 상태가 업데이트되었습니다!`);
    } else {
      queueManager.markAsFailed(nextItem.id, result.error || "Unknown error");
      console.error(`⚠️ [ID: ${nextItem.id}] 포스팅 실패 처리되었습니다.`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("처리되지 않은 예외 발생:", err);
  process.exit(1);
});
