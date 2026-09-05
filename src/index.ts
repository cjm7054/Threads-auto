import { ThreadsClient } from "./threadsClient";
import { QueueManager } from "./queueManager";
import { TrendCollector } from "./trendCollector";
import { AiWriter } from "./aiWriter";
import { HistoryManager } from "./historyManager";

// Bun 및 최신 Node는 .env를 자동 로드하거나 기본 제공 기능을 사용합니다.
if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {}
}

async function main() {
  const isDryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
  const isTrendMode = process.argv.includes("--trend-auto") || process.env.PUBLISH_MODE === "trend";

  const userId = process.env.THREADS_USER_ID || "me";
  const accessToken = process.env.THREADS_ACCESS_TOKEN || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";

  if (!isDryRun && !accessToken) {
    console.error("❌ 에러: THREADS_ACCESS_TOKEN 환경 변수가 설정되지 않았습니다.");
    console.error("💡 .env 파일 또는 GitHub Repository Secrets에 등록해주세요.");
    process.exit(1);
  }

  const client = new ThreadsClient(userId, accessToken, isDryRun);

  // 1. 실시간 트렌드 자동 생성 및 포스팅 모드
  if (isTrendMode) {
    console.log("🔥 [실시간 트렌드 모드] 구글 트렌드 실시간 검색어 수집 중...");
    if (!geminiKey && !isDryRun) {
      console.error("❌ 에러: GEMINI_API_KEY 환경 변수가 필요합니다.");
      process.exit(1);
    }

    const trendCollector = new TrendCollector();
    const historyManager = new HistoryManager();
    const aiWriter = new AiWriter(geminiKey);

    const trends = await trendCollector.fetchTrends();
    if (trends.length === 0) {
      console.log("ℹ️ 현재 수집된 트렌드가 없습니다.");
      return;
    }

    console.log(`📊 수집된 트렌드 ${trends.length}개 발견`);

    // 최근 7일 내 발행되지 않은 첫 번째 트렌드 선택
    const selectedTrend = trends.find((t) => !historyManager.isAlreadyPublished(t.title));

    if (!selectedTrend) {
      console.log("ℹ️ 모든 최신 트렌드가 이미 최근에 발행되었습니다.");
      return;
    }

    console.log(`🎯 이번 포스팅 선정 키워드: [${selectedTrend.title}] (관련: ${selectedTrend.newsTitle || "없음"})`);

    let generatedText = "";
    if (isDryRun && !geminiKey) {
      generatedText = `🔥 지금 한국에서 가장 핫한 키워드: ${selectedTrend.title}!\n\n관련해서 ${selectedTrend.newsTitle || "여러 이야기"}가 화제인데요.\n다들 이 소식 어떻게 보시나요? 댓글로 의견 남겨주세요! 👇\n\n#트렌드 #${selectedTrend.title.replace(/\s+/g, "")} #이슈`;
      console.log("[DRY-RUN] Gemini API 키가 없어 목업 본문으로 시뮬레이션합니다.");
    } else {
      console.log("🤖 Gemini AI로 맞춤 스레드 본문 작성 중...");
      generatedText = await aiWriter.generatePost(selectedTrend);
    }

    console.log("------------------------------------------");
    console.log("📝 생성된 스레드 본문:\n" + generatedText);
    console.log("------------------------------------------");

    const result = await client.post({
      text: generatedText,
      linkAttachment: selectedTrend.newsUrl,
    });

    if (result.success) {
      historyManager.addRecord(selectedTrend.title, result.threadId);
      console.log(`🎉 [키워드: ${selectedTrend.title}] 실시간 트렌드 글이 성공적으로 포스팅되었습니다!`);
    } else {
      console.error(`❌ 포스팅 실패: ${result.error}`);
      process.exit(1);
    }

    return;
  }

  // 2. 기존 수동 큐(queue.json) 기반 포스팅 모드
  const queueManager = new QueueManager();
  console.log("🔍 대기 중인 예약 스레드 검색 중 (queue.json)...");
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

main().catch((err) => {
  console.error("처리되지 않은 예외 발생:", err);
  process.exit(1);
});
