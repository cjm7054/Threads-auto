import { TrendItem } from "./trendCollector";

/**
 * Google Gemini API를 활용한 스레드 특화 게시글 작성 모듈
 */
export class AiWriter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gemini-3.6-flash") {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * 구글 트렌드 아이템을 바탕으로 매력적인 스레드 본문을 생성합니다.
   */
  async generatePost(trend: TrendItem): Promise<string> {
    const newsContext = trend.newsTitle ? `관련 기사: "${trend.newsTitle}"` : "";
    const snippetContext = trend.snippet ? `내용: ${trend.snippet}` : "";

    const userPrompt = `주제: [${trend.title}]
${newsContext}
${snippetContext}

위 실시간 트렌드 주제로 한국 스레드(Threads)에 올릴 글을 재미있게 작성해줘.
3~4개 문단으로 무슨 일인지 쉽게 설명하고, 마지막엔 사람들에게 생각을 묻는 질문과 함께 "👉 더 자세한 전체 분석 리포트랑 꿀팁은 첫 댓글에 남겨둘게요! 👇" 문구와 해시태그를 달아줘.
영어 메모나 체크리스트 같은 것은 일절 쓰지 말고, 실제 올라갈 게시글 본문만 바로 출력해.`;

    // 유효한 최신 모델 우선순위
    const candidateModels = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-1.5-flash"];
    let lastError = "";

    for (const currentModel of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "너는 대한민국 메타 스레드(Threads)의 인기 전문 인플루언서야. 일체의 잡담, 메모, 생각 과정, 영어 체크리스트를 배제하고 오직 바로 게시할 수 있는 고품질 한국어 스레드 본문 텍스트만을 출력한다." }]
            },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          }),
        });

        const data = await response.json() as any;

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          let postContent = data.candidates[0].content.parts[0].text.trim();

          // 생각 과정 태그나 불필요한 메타 라벨만 깔끔하게 제거 (본문 내용은 1글자도 건드리지 않음)
          postContent = postContent.replace(/\[?Checklist[\s\S]*?\n\n/gi, "").trim();
          postContent = postContent.replace(/^(Hook|Body|Thought|Thinking|CTA):?\s*/gmi, "").trim();

          return postContent;
        }

        lastError = data.error?.message || response.statusText;
        console.warn(`⚠️ [${currentModel}] 일시적 지연/오류로 대체 모델 전환 시도: ${lastError}`);
      } catch (e: any) {
        lastError = e.message || String(e);
      }
    }

    throw new Error(`모든 Gemini 모델 호출 실패: ${lastError}`);
  }

  /**
   * 첫 번째 대댓글(Reply)용 하이브리드 고수익 멘트 (블로그 애드센스 + 쿠팡 파트너스 + 공정위 문구)를 생성합니다.
   */
  async generateReplyComment(trend: TrendItem, mConfig: any): Promise<string> {
    const blogText = mConfig.blog?.text || "📖 상세 분석 리포트 읽어보기 👇";
    const blogUrl = mConfig.blog?.primaryUrl || "https://insightlab365.com/";

    const coupangText = mConfig.affiliate?.text || "🛒 오늘의 실시간 한정 특가 모음 👇";
    const coupangUrl = mConfig.affiliate?.url || "https://link.coupang.com/a/gNd017Dg4";
    const disclaimer = mConfig.affiliate?.disclaimer || "※ 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

    const followMsg = mConfig.social?.followMessage || "✨ 유용한 실시간 이슈와 분석을 매일 올려드리니 팔로우 부탁드려요!";

    return `📌 [인사이트랩365 추가 정보 안내]\n\n${blogText}\n👉 ${blogUrl}\n\n${coupangText}\n👉 ${coupangUrl}\n\n${disclaimer}\n\n${followMsg}`;
  }

  /**
   * 이슈 주제를 바탕으로 고화질 AI 일러스트/실사 이미지 URL을 생성합니다.
   * (기사 실제 사진이 없을 경우 대체용)
   */
  async generateImageUrl(trend: TrendItem): Promise<string> {
    try {
      // Gemini를 활용하여 해당 이슈에 어울리는 영문 시각화 프롬프트 1문장 생성
      const promptQuery = `Topic: "${trend.title}". Related: "${trend.newsTitle || ''}".
Generate a single short English prompt (under 15 words) for an image generator (like Midjourney or DALL-E) to create an editorial photo or high-quality illustration representing this news topic. 
Do not include quotation marks, style jargon, or explanations. Output ONLY the prompt text in English.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptQuery }] }],
          generationConfig: { maxOutputTokens: 60, temperature: 0.5 },
        }),
      });

      let imagePrompt = "";
      if (response.ok) {
        const data = await response.json() as any;
        imagePrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }

      if (!imagePrompt) {
        imagePrompt = `news editorial concept for ${trend.title}`;
      }

      // 안전한 URL 인코딩 적용 (Pollinations 고화질 이미지 생성 서비스)
      const encodedPrompt = encodeURIComponent(imagePrompt.replace(/[\n\r]/g, " ").slice(0, 120));
      return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true`;
    } catch (err) {
      console.warn("⚠️ AI 이미지 생성 URL 구성 중 오류, 기본 트렌드 이미지 대체:", err);
      const safeTitle = encodeURIComponent(trend.title);
      return `https://image.pollinations.ai/prompt/breaking%20news%20concept%20${safeTitle}?width=1080&height=1080&nologo=true`;
    }
  }
}
