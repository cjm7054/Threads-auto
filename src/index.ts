import { ThreadsClient } from "./threadsClient";
import { QueueManager } from "./queueManager";
import { TrendCollector } from "./trendCollector";
import { AiWriter } from "./aiWriter";
import { HistoryManager } from "./historyManager";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
    console.log("📝 [1단계] 생성된 스레드 본문 (링크 없는 고도달 포스트):\n" + generatedText);
    console.log("------------------------------------------");

    // 1단계: 본문 단독 포스팅 (외부 링크 제거 -> 알고리즘 도달률 극대화)
    const result = await client.post({
      text: generatedText,
    });

    if (result.success && result.threadId) {
      historyManager.addRecord(selectedTrend.title, result.threadId);
      console.log(`🎉 [본문 발행 완료] (ID: ${result.threadId})`);

      // 2단계: 자동 첫 대댓글(Reply) 연쇄 발행 (수익 링크 / 프로필 유도)
      try {
        const monetizationConfigPath = resolve(process.cwd(), "config", "monetization.json");
        let mConfig: any = {};

        if (existsSync(monetizationConfigPath)) {
          mConfig = JSON.parse(readFileSync(monetizationConfigPath, "utf-8"));
        }

        const replyText = await aiWriter.generateReplyComment(selectedTrend, mConfig);
        console.log(`💬 [2단계] 첫 번째 수익 대댓글 자동 작성 중... (Reply to: ${result.threadId})`);
        console.log("------------------------------------------");
        console.log("📝 대댓글 본문:\n" + replyText);
        console.log("------------------------------------------");

        // Threads API 딜레이 (본문이 서버에 완전히 등록되어 reply_to_id 조회가 가능할 때까지 8초 대기)
        if (!isDryRun) {
          console.log("⏳ 본문 인덱싱 대기 중 (8초)...");
          await new Promise((r) => setTimeout(r, 8000));
        }

        const replyResult = await client.post({
          text: replyText,
          replyToId: result.threadId,
        });

        if (replyResult.success) {
          console.log(`🚀 [수익 대댓글 발행 성공!] (Reply ID: ${replyResult.threadId})`);
        } else {
          console.warn(`⚠️ 대댓글 발행 실패 (본문은 정상 게시됨): ${replyResult.error}`);
        }
      } catch (replyErr: any) {
        console.warn(`⚠️ 대댓글 생성 중 예외 발생 (본문은 정상 게시됨):`, replyErr.message || replyErr);
      }

      console.log(`✨ [키워드: ${selectedTrend.title}] 하이브리드 자동 포스팅 파이프라인 완료!`);
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
