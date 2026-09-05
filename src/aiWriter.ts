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
당신은 스레드(Threads)에서 수많은 '좋아요'와 댓글을 받는 인기 크리에이터입니다.
아래 [실시간 핫이슈]를 바탕으로 사람들의 호기심과 공감을 이끄는 스레드 글을 작성해주세요.

[실시간 핫이슈]
- 키워드: ${trend.title}
- 관련 뉴스: ${trend.newsTitle || trend.title + " 관련 최신 화제 소식"}
- 상세 요약: ${trend.snippet || "현재 실시간 검색어 및 대중들의 뜨거운 관심을 받고 있는 주요 이슈"}

[작성 예시 - 반드시 이 형식과 분량(300자 내외)으로 작성하세요]
🔥 요즘 이 소식 때문에 인터넷 난리 났네요!

${trend.title} 관련해서 새로운 소식이 전해졌는데요.
처음엔 다들 설마 했는데, 실제 기사 내용을 보니까 진짜 분위기가 심상치 않더라고요.

이게 앞으로 경제나 일상에 어떤 영향을 줄지 다들 주목하고 있는 상황입니다.
과연 이번 이슈가 어떻게 마무리될지 궁금해지네요.

여러분은 이번 소식 어떻게 보시나요? 댓글로 솔직한 생각 남겨주세요! 👇
(👉 더 자세한 전체 분석 리포트와 꿀팁 링크는 첫 댓글에 남겨둘게요!)

#트렌드 #${trend.title.replace(/\s+/g, "")} #실시간이슈

[주의사항]
- 절대 위의 '작성 예시'를 무시하고 1~2줄로 짧게 쓰지 마세요. 위 예시처럼 반드시 3~4개의 문단으로 내용을 채워주세요.
- 본문에는 인터넷 주소(http...)를 넣지 마세요.
- 오직 완성된 본문 텍스트만 바로 출력하세요.
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
}
