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
당신은 메타 스레드(Threads)에서 활발하게 소통하며 많은 반응을 이끌어내는 전문 크리에이터입니다.
아래 제공된 [실시간 트렌드 정보]를 바탕으로, 스레드 이용자들이 흥미롭게 읽고 댓글을 달고 싶어지는 짧고 매력적인 게시글 1개를 작성해주세요.

[실시간 트렌드 정보]
- 키워드: ${trend.title}
- 관련 뉴스: ${trend.newsTitle || trend.title + " 관련 최신 화제 소식"}
- 상세 요약: ${trend.snippet || "현재 실시간 검색어 및 대중들의 뜨거운 관심을 받고 있는 주요 이슈"}

[작성 지침 - 매우 중요]
※ 뉴스 요약 정보가 적거나 없더라도, 당신이 가진 풍부한 배경지식을 발휘하여 해당 키워드와 관련된 사회적 맥락, 대중의 반응, 흥미로운 관점을 반드시 살려서 풍성하게 작성하세요. 절대로 한두 줄로 짧게 끝내지 마세요!

1. 반드시 다음 4개 문단 구조로 풍성하게 작성하세요 (공백 포함 총 250자 ~ 450자):
   - 1문단(도입 후킹): 사람들의 시선을 확 사로잡는 흥미로운 첫 문장 (이모지 1~2개 포함)
   - 2문단(이슈 및 배경): 왜 지금 이 키워드가 화제인지, 어떤 일이 있었는지 2~3줄로 흥미진진하게 설명
   - 3문단(인사이트 및 내 생각): 이것이 대중이나 경제/일상에 미치는 영향이나 흥미로운 관점 제시
   - 4문단(소통 및 유도): '여러분은 이 소식 어떻게 보시나요? 댓글로 의견 남겨주세요! 👇\n(더 자세한 관련 분석과 특가 꿀팁 링크는 첫 댓글에 남겨둘게요!)'
   - 마지막 줄: 핵심 해시태그 3~4개 (#키워드 #이슈 등)
2. 문체: 친근하고 솔직 담백한 대화체(스레드 특유의 톤앤매너, '~했네요', '~인 것 같아요').
3. 가독성: 문단 사이사이에 빈 줄(엔터)을 꼭 넣어 모바일에서 읽기 편하게 만드세요.
4. 주의사항:
   - 본문에는 절대 URL 링크를 직접 넣지 마세요! (링크는 첫 댓글에 달릴 예정)
   - 생각 과정, 메모, 체크리스트, [Hook], [Body] 같은 단어는 일체 출력하지 마세요.
   - 오직 스레드에 그대로 올라갈 '완성 본문 텍스트'만 출력하세요.
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

          // AI 생각 과정이나 Checklist 태그만 안전하게 제거
          postContent = postContent.replace(/\*?\*?\[?Checklist[\s\S]*?\*?\*?\n*/gi, "").trim();
          postContent = postContent.replace(/\*?\*?Character Count[\s\S]*?\n*/gi, "").trim();
          postContent = postContent.replace(/^(Hook|Body|Thought|Thinking):?\s*/gmi, "").trim();

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
