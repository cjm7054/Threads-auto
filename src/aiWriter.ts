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
- 관련 뉴스: ${trend.newsTitle || "관련 소식"}
- 상세 요약: ${trend.snippet || "실시간 인기 급상승 토픽"}

[작성 가이드라인]
1. 길이: 200자 ~ 400자 내외로 모바일에서 한눈에 쏙 들어오게 작성하세요.
2. 문체: 친근하고 솔직 담백한 대화체(스레드 특유의 톤앤매너, '~했네요', '~인 것 같아요', '~어떻게 생각하시나요?').
3. 구조:
   - 첫 문장은 사람들의 시선을 확 사로잡는 강력한 후킹 문장 (이모지 1~2개 포함)
   - 본문은 2~3줄씩 짧게 끊고 줄바꿈(엔터)을 자주 넣어 가독성을 극대화
   - 본문 중간/후반에는 사람들의 생각이나 호기심을 자극하는 내용 배치
   - 마지막에는 사람들의 의견을 묻는 질문(댓글 유도 질문)과 함께, 첫 댓글을 확인하도록 유도하는 멘트를 자연스럽게 넣으세요 (예: '👉 관련 상세 내용과 꿀팁 링크는 첫 댓글에 남겨둘게요! 👇')
   - 글 맨 끝에 핵심 해시태그 3~4개 달기 (#키워드 #트렌드 등)
4. 주의사항:
   - 중요: 스레드 알고리즘 페널티(노출 제한)를 피하기 위해 본문에는 절대 URL 링크를 직접 넣지 마세요! 링크는 첫 댓글에 넣을 예정입니다.
   - 중요: 글자 수 계산, 체크리스트, [Checklist Check], 생각 과정, 프롬프트 해설 등 어떠한 메타 텍스트나 메모도 절대 출력하지 마세요.
   - 불필요한 마크다운 기호(예: # 헤더, ** 굵게 등)는 스레드 본문에 지원되지 않으므로 순수 텍스트와 이모지로만 작성하세요.
   - 오직 실제 스레드에 그대로 올라갈 '최종 완성 본문 텍스트' 단 하나만 출력하세요.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
    });

    const data = await response.json() as any;

    if (!response.ok || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const errorMsg = data.error?.message || response.statusText;
      throw new Error(`Gemini AI 글 생성 실패: ${errorMsg}`);
    }

    const postContent = data.candidates[0].content.parts[0].text.trim();
    return postContent;
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
