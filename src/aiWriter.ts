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
    const prompt = `
너는 스레드(Threads)에서 사람들의 공감과 댓글을 많이 이끌어내는 전문 크리에이터야.
아래 실시간 핫이슈를 바탕으로, 사람들이 흥미진진하게 읽을 수 있는 스레드 게시글 1개를 한국어로 작성해줘.

[이슈 정보]
- 키워드: ${trend.title}
- 관련 뉴스: ${trend.newsTitle || trend.title + " 관련 최신 화제 소식"}
- 상세 내용: ${trend.snippet || "현재 실시간 검색어 및 대중들의 뜨거운 관심을 받고 있는 주요 이슈"}

[작성 규칙]
1. 분량: 한눈에 편하게 읽히는 250~400자 분량.
2. 말투: 친구에게 흥미로운 썰을 풀어주듯 친근하고 자연스러운 대화체 (~했네요, ~인 것 같아요).
3. 구성:
   - 첫 줄: 호기심을 확 자극하는 강렬한 한 줄 (이모지 포함)
   - 본문: 무슨 일인지 2~3줄로 쉽게 설명하고, 이게 왜 화제인지 내 생각을 솔직하게 덧붙이기
   - 끝맺음: 사람들의 생각을 묻는 가벼운 질문과 함께 아래 문구를 자연스럽게 넣기:
     "👉 더 자세한 전체 분석 리포트랑 꿀팁은 첫 댓글에 남겨둘게요! 👇"
   - 마지막 줄: 해시태그 3개 (#트렌드 #${trend.title.replace(/\s+/g, "")} #이슈)
4. 절대 주의사항:
   - 본문에 웹사이트 주소(http...)를 절대 넣지 말 것.
   - 프롬프트 해설, 생각 과정, [CTA], [Hook], [Body], 영어 메모 등은 단 한 글자도 출력하지 말 것.
   - 오직 실제 게시할 한국어 본문 텍스트만 바로 출력할 것.
`;

    // 유효한 최신 모델 우선순위
    const candidateModels = ["gemini-3.6-flash", "gemini-2.5-flash"];
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
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 800,
            },
          }),
        });

        const data = await response.json() as any;

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          let postContent = data.candidates[0].content.parts[0].text.trim();

          // AI가 뱉은 메타 태그 / 영문 주석 완벽 박멸 필터
          postContent = postContent.replace(/\(?\[?(CTA|Checklist|Hook|Body|Thought|Thinking|Fixed Text Required)[\s\S]*?\)?\*?\*?:?\s*/gi, "").trim();
          postContent = postContent.replace(/^\*\s*\*Text:\*\s*/i, "").trim();
          postContent = postContent.replace(/\*?\*?Character Count[\s\S]*?\n*/gi, "").trim();

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
}
