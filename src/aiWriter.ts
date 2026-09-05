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
1. 길이: 200자 ~ 450자 내외로 모바일에서 한눈에 읽기 쉽게 작성하세요.
2. 문체: 친근하면서도 인사이트를 주는 대화체(스레드 특유의 솔직 담백한 말투, '~했네요', '~인 것 같아요', '~어떻게 생각하시나요?').
3. 구조:
   - 첫 문장은 사람들의 시선을 사로잡는 강력한 후킹 문장 (이모지 1~2개 포함)
   - 본문은 2~3줄씩 짧게 끊고 줄바꿈(엔터)을 자주 넣어 가독성을 극대화
   - 마지막에는 사람들의 의견을 묻는 질문(댓글 유도 질문)으로 마무리
   - 글 맨 끝에 핵심 해시태그 3~4개 달기 (#키워드 #트렌드 등)
4. 주의사항:
   - 불필요한 마크다운 기호(예: # 헤더, ** 굵게 등)는 스레드 본문에 지원되지 않으므로 순수 텍스트와 이모지로만 작성하세요.
   - 제목, 설명글, 주석 없이 오직 바로 게시할 수 있는 '스레드 본문 텍스트'만 출력하세요.
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
}
