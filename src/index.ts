import { ThreadsClient } from "./threadsClient";
import { QueueManager } from "./queueManager";
import { TrendCollector } from "./trendCollector";
import { AiWriter } from "./aiWriter";
import { HistoryManager } from "./historyManager";
import { WordPressClient } from "./wordPressClient";
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
  const wpUrl = process.env.WP_URL || "https://insightlab365.com";
  const wpUsername = process.env.WP_USERNAME || "cjm7054";
  const wpAppPassword = process.env.WP_APP_PASSWORD || "SfyM z8qe CGnT LOzO CA7X 8AtP";

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
    console.log("📝 [1단계] 생성된 스레드 본문 (고도달 포스트):\n" + generatedText);
    console.log("------------------------------------------");

    // 3단계 미디어 파이프라인: 안정적인 이미지 URL 준비 (스레드 API는 확장자가 명확한 공개 CDN 이미지만 허용)
    const wpClient = (wpUsername && wpAppPassword) ? new WordPressClient(wpUrl, wpUsername, wpAppPassword) : null;
    let postImageUrl: string | undefined = undefined;

    // 1) 뉴스 기사 사진이 있을 경우: 워드프레스 미디어 라이브러리에 올려서 insightlab365.com 정식 이미지 URL로 변환
    if (selectedTrend.pictureUrl && wpClient) {
      console.log(`🖼️ [뉴스 사진 발견] 워드프레스 미디어에 안전하게 등록 중: ${selectedTrend.pictureUrl.slice(0, 50)}...`);
      const cdnUrl = await wpClient.uploadMedia(selectedTrend.pictureUrl, "news.jpg");
      if (cdnUrl) {
        postImageUrl = cdnUrl;
      }
    }

    // 2) 위 과정 실패 또는 뉴스 사진이 없을 경우: Gemini AI 프롬프트 기반 고화질 이미지 URL 생성
    if (!postImageUrl) {
      console.log(`🎨 [맞춤 이미지] Gemini AI 기반 이슈 시각화 이미지 생성 중...`);
      postImageUrl = await aiWriter.generateImageUrl(selectedTrend);
      console.log(`🖼️ [AI 이미지 준비 완료] ${postImageUrl}`);
    }

    // 1단계: 본문 + 고화질 이미지 포스팅 (이미지 실패 시 텍스트 단독 자동 폴백)
    let result = await client.post({
      text: generatedText,
      imageUrl: postImageUrl,
    });

    if (!result.success && postImageUrl) {
      console.warn(`⚠️ [이미지 컨테이너 실패] 텍스트 단독 포스팅으로 자동 전환합니다... (${result.error})`);
      result = await client.post({
        text: generatedText,
      });
    }

    if (result.success && result.threadId) {
      historyManager.addRecord(selectedTrend.title, result.threadId);
      console.log(`🎉 [본문 발행 완료] (ID: ${result.threadId})`);

      // 2단계: 워드프레스 블로그 실제 상세글 자동 발행 & 첫 대댓글(Reply) 연쇄 발행
      try {
        const monetizationConfigPath = resolve(process.cwd(), "config", "monetization.json");
        let mConfig: any = {};

        if (existsSync(monetizationConfigPath)) {
          mConfig = JSON.parse(readFileSync(monetizationConfigPath, "utf-8"));
        }

        let actualWpUrl: string | undefined = undefined;

        // 워드프레스에 실제 1,500자 상세 분석 아티클 자동 포스팅
        if (wpUsername && wpAppPassword) {
          console.log(`📝 [워드프레스] "${selectedTrend.title}" 주제로 블로그 상세 리포트 생성 중...`);
          try {
            const wpArticle = await aiWriter.generateWordPressArticle(selectedTrend);
            const wpClient = new WordPressClient(wpUrl, wpUsername, wpAppPassword);
            const wpResult = await wpClient.createPost(wpArticle.title, wpArticle.html);

            if (wpResult.success && wpResult.postUrl) {
              actualWpUrl = wpResult.postUrl;
              console.log(`🌐 [워드프레스 실제 글 발행 성공!] ${actualWpUrl}`);
            }
          } catch (wpErr: any) {
            console.warn(`⚠️ 워드프레스 자동 발행 실패 (기본 메인 링크로 대체):`, wpErr.message || wpErr);
          }
        }

        const replyText = await aiWriter.generateReplyComment(selectedTrend, mConfig, actualWpUrl);
        console.log(`💬 [2단계] 첫 번째 수익 대댓글 자동 작성 중... (Reply to: ${result.threadId})`);
        console.log("------------------------------------------");
        console.log("📝 대댓글 본문:\n" + replyText);
        console.log("------------------------------------------");

        // Threads API 딜레이 및 재시도 (이미지가 포함된 본문은 인덱싱에 10~15초 소요됨)
        let replySuccess = false;
        if (!isDryRun) {
          console.log("⏳ 본문 인덱싱 대기 중 (12초)...");
          await new Promise((r) => setTimeout(r, 12000));

          // 최대 3회 재시도 루프
          for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`[Threads] 대댓글 발행 시도 (${attempt}/3)...`);
            const replyResult = await client.post({
              text: replyText,
              replyToId: result.threadId,
            });

            if (replyResult.success) {
              console.log(`🚀 [수익 대댓글 발행 성공!] (Reply ID: ${replyResult.threadId})`);
              replySuccess = true;
              break;
            } else {
              console.warn(`⚠️ 대댓글 시도 ${attempt} 실패: ${replyResult.error}`);
              if (attempt < 3) {
                console.log("⏳ 8초 후 재시도합니다...");
                await new Promise((r) => setTimeout(r, 8000));
              }
            }
          }
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
