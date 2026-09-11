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

    // [기능 추가] 스레드 글 내용 하단에 관련 기사 또는 홈페이지 링크 연결
    if (selectedTrend.newsUrl) {
      const linkLabel = selectedTrend.newsTitle ? `📰 관련 기사 원문: ${selectedTrend.newsTitle}` : "🔗 관련 기사 바로가기";
      generatedText = `${generatedText}\n\n${linkLabel}\n👉 ${selectedTrend.newsUrl}`;
    }

    console.log("------------------------------------------");
    console.log("📝 [1단계] 생성된 스레드 본문 (링크 포함):\n" + generatedText);
    console.log("------------------------------------------");

    // [1단계] 고화질 실제 뉴스 보도 사진 준비 및 워드프레스 미디어 라이브러리 업로드
    let postImageUrl: string | undefined = undefined;
    let featuredMediaId: number | undefined = undefined;
    const wpClient = (wpUsername && wpAppPassword) ? new WordPressClient(wpUrl, wpUsername, wpAppPassword) : null;

    if (wpClient) {
      // 1순위: 실제 언론사 원문 페이지에서 초고화질 공식 보도 사진(og:image 1200x630+) 추출
      if (selectedTrend.newsUrl) {
        console.log(`🔎 [실제 뉴스 원문 탐색] 언론사 원문 기사에서 초고화질 공식 보도 사진(og:image) 추출 시도... (${selectedTrend.newsUrl})`);
        const ogImage = await trendCollector.fetchArticleOgImage(selectedTrend.newsUrl);
        if (ogImage) {
          console.log(`📸 [언론사 원문 고화질 사진 발견] ${ogImage}`);
          const mediaResult = await wpClient.uploadMediaWithId(ogImage, "hd_news_photo.jpg");
          if (mediaResult) {
            postImageUrl = mediaResult.url;
            featuredMediaId = mediaResult.id;
            console.log(`🌟 [실제 언론사 초고화질 보도 사진 확정!] ${postImageUrl} (미디어 ID: ${featuredMediaId})`);
          }
        }
      }

      // 2순위: 1순위 실패 시 구글 트렌드 첨부 이미지 활용
      if (!postImageUrl && selectedTrend.pictureUrl) {
        console.log(`📸 [구글 트렌드 썸네일 변환] 사진을 워드프레스 미디어로 변환 중... (${selectedTrend.pictureUrl})`);
        try {
          const mediaResult = await wpClient.uploadMediaWithId(selectedTrend.pictureUrl, "news_photo.jpg");
          if (mediaResult) {
            postImageUrl = mediaResult.url;
            featuredMediaId = mediaResult.id;
            console.log(`🌟 [뉴스 보도 사진 확정] ${postImageUrl}`);
          }
        } catch (mediaErr) {
          console.warn("⚠️ 뉴스 사진 변환 실패, AI 보도사진으로 대체합니다:", mediaErr);
        }
      }
    }

    if (!postImageUrl) {
      console.log(`🎨 [AI 보도사진 생성] "${selectedTrend.title}" 뉴스 맥락과 일치하는 사실적 다큐멘터리 사진 제작 중...`);
      const rawAiImageUrl = await aiWriter.generateImageUrl(selectedTrend);
      console.log(`🖼️ [다큐멘터리 보도사진 원본 준비] ${rawAiImageUrl}`);

      if (wpClient) {
        try {
          const mediaResult = await wpClient.uploadMediaWithId(rawAiImageUrl, "ai_editorial_photo.jpg");
          if (mediaResult) {
            postImageUrl = mediaResult.url;
            featuredMediaId = mediaResult.id;
            console.log(`🌟 [AI 보도사진 CDN 캐싱 완료] ${postImageUrl}`);
          }
        } catch (e: any) {
          console.warn("⚠️ AI 이미지 워드프레스 캐싱 실패 (원본 사용):", e.message || e);
        }
      }

      if (!postImageUrl) {
        postImageUrl = rawAiImageUrl;
      }
    }

    // [2단계] 스레드 본문 및 고화질 이미지 단독 포스팅 (외부 블로그/댓글 링크 배제)
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
      console.log(`🎉 [스레드 본문 발행 완료] (ID: ${result.threadId})`);
      console.log(`✨ [키워드: ${selectedTrend.title}] 고품질 스레드 자동 포스팅 완료!`);
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
