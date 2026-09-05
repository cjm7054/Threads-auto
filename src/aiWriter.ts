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

    const userPrompt = `대한민국 메타 스레드(Threads)에 업로드할 인기 피드 글을 한국어로 작성해줘.

주제 키워드: ${trend.title}
관련 뉴스: ${trend.newsTitle || '실시간 인기 이슈'}
${trend.snippet ? '요약: ' + trend.snippet : ''}

[작성 요구사항]
1. 사람들의 흥미를 끄는 강력한 첫 줄 훅(Hook)으로 시작하세요.
2. 2~3개의 짧은 문단으로 친근하고 자연스러운 구어체(~해요, ~인 것 같아요, ~대단하네요)로 읽기 쉽게 줄바꿈을 넣어 작성하세요.
3. 마지막 줄에는 "다들 이 소식 어떻게 생각하시나요? 댓글로 의견 들려주세요! 👇\n\n👉 더 자세한 심층 분석과 꿀팁은 첫 댓글 링크에 남겨둘게요!" 를 넣으세요.
4. 마지막에 #스레드 #트렌드 #${trend.title.replace(/\s+/g, '')} 해시태그를 포함하세요.
5. 절대로 영어 체크리스트, "Here is the text:", 프롬프트 설명 같은 잡담을 쓰지 말고 오직 한국어 게시글 본문만 출력하세요.`;

    // Google Gemini API 최신 정식 지원 모델 우선순위
    const candidateModels = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
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

          // 생각 과정 태그나 불필요한 메타 라벨만 깔끔하게 제거
          postContent = postContent.replace(/\[?Checklist[\s\S]*?\n\n/gi, "").trim();
          postContent = postContent.replace(/^(Hook|Body|Thought|Thinking|CTA|Text directly outputted below):?\s*/gmi, "").trim();
          postContent = postContent.replace(/^Here (is|are) [^\n]+:\s*/gmi, "").trim();

          // 최소 본문 길이(80자)를 충족할 때만 정상 반환
          if (postContent.length >= 80) {
            return postContent;
          }
          console.warn(`⚠️ [${currentModel}] 생성된 본문이 너무 짧습니다 (${postContent.length}자). 다음 모델로 재시도합니다.`);
        }

        lastError = data.error?.message || response.statusText;
        console.warn(`⚠️ [${currentModel}] 일시적 지연/오류로 대체 모델 전환 시도: ${lastError}`);
      } catch (e: any) {
        lastError = e.message || String(e);
      }
    }

    console.warn(`⚠️ Gemini API 응답 제한으로 트렌드 기반 맞춤 템플릿으로 본문을 구성합니다: ${lastError}`);
    return `🔥 지금 실시간으로 가장 뜨거운 화제의 이슈: [${trend.title}]!\n\n${trend.newsTitle ? '최근 보도에 따르면 "' + trend.newsTitle + '" 소식이 전해지며 많은 사람들의 관심이 집중되고 있습니다.' : '관련 소식이 전해지며 다양한 의견과 반응이 쏟아지고 있는 상황인데요.'}\n\n${trend.snippet || '과연 앞으로 어떤 방향으로 전개될지 귀추가 주목됩니다.'}\n\n다들 이 소식 어떻게 생각하시나요? 댓글로 여러분의 생각을 들려주세요! 👇\n\n👉 더 자세한 심층 분석 리포트와 꿀팁은 첫 댓글 링크에 남겨둘게요!\n\n#스레드 #트렌드 #${trend.title.replace(/\s+/g, '')} #실시간이슈`;
  }

  /**
   * 첫 번째 대댓글(Reply)용 하이브리드 고수익 멘트 (블로그 애드센스 + 쿠팡 파트너스 + 공정위 문구)를 생성합니다.
   * 실제 워드프레스에 발행된 글의 URL이 전달되면 그 링크를 우선 적용합니다.
   */
  async generateReplyComment(trend: TrendItem, mConfig: any, actualPostUrl?: string): Promise<string> {
    const blogText = mConfig.blog?.text || "📖 이슈의 전체 맥락과 상세 분석 리포트 읽어보기 👇";
    const blogUrl = actualPostUrl || mConfig.blog?.primaryUrl || "https://insightlab365.com/";

    const coupangText = mConfig.affiliate?.text || "🛒 오늘의 실시간 골든박스 & 한정 특가 모음 바로가기 👇";
    const coupangUrl = mConfig.affiliate?.url || "https://link.coupang.com/a/gNd0L7Og4i";
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

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
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

  /**
   * 워드프레스 블로그용 고품질 심층 분석 기사(HTML 형식, 약 1,500자 내외)를 생성합니다.
   * 구글 애드센스 승인 및 체류시간 극대화에 최적화된 구조로 작성됩니다.
   */
  async generateWordPressArticle(trend: TrendItem): Promise<{ title: string; html: string }> {
    const prompt = `대한민국 실시간 이슈 [${trend.title}]에 대한 블로그용 고품질 심층 분석 리포트를 작성해줘.
관련 뉴스: "${trend.newsTitle || ''}"
요약 내용: "${trend.snippet || ''}"

[작성 가이드라인]
1. 제목은 검색 유입과 호기심을 자극하는 매력적인 제목으로 1개 작성 (예: [이슈 분석] ~한 이유와 향후 전망 정리).
2. 본문은 네이버/구글 검색엔진 최적화(SEO)를 고려하여 소제목(<h2>, <h3>)과 문단(<p>), 글머리 기호(<ul>, <li>)가 포함된 깔끔한 HTML 태그 형태로 작성.
3. 구성 순서:
   - 도입부: 사건/이슈의 배경과 핵심 팩트 정리
   - 본론 1: 대중들의 반응과 주요 쟁점 분석
   - 본론 2: 전문가 의견 및 향후 사회적/경제적 파급 효과
   - 결론: 요약 및 시사점, 독자의 생각을 묻는 마무리
4. 전체 분량은 약 1,000자~1,500자 정도로 풍부하고 신뢰감 있는 문체(~합니다, ~입니다)로 작성.
5. <html>, <body>, <h1> 태그나 코드블럭 따옴표(\`\`\`html)는 일절 쓰지 말고, 오직 바로 워드프레스 본문에 들어갈 본문 HTML만 출력해.
첫 번째 줄에는 반드시 "TITLE: [제목 내용]" 형식으로 제목을 명시하고, 한 줄 띄운 뒤 본문 HTML을 출력할 것.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2500, temperature: 0.7 },
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        const titleMatch = rawOutput.match(/^TITLE:\s*(.+)/m);
        const articleTitle = titleMatch ? titleMatch[1].trim() : `[이슈 분석] ${trend.title} - 핵심 내용과 주요 쟁점 정리`;
        const htmlContent = rawOutput.replace(/^TITLE:\s*.+\n*/m, "").replace(/```html|```/g, "").trim();

        return { title: articleTitle, html: htmlContent };
      }
    } catch (e) {
      console.warn("⚠️ Gemini 블로그 글 생성 실패, 기본 템플릿 대체:", e);
    }

    const fallbackTitle = `[실시간 트렌드] ${trend.title} 관련 주요 소식 및 전체 분석`;
    const fallbackHtml = `
<h2>1. ${trend.title} 이슈 개요</h2>
<p>최근 실시간 검색어 및 주요 언론을 통해 <strong>${trend.title}</strong> 관련 소식이 전해지며 많은 사람들의 관심이 쏟아지고 있습니다.</p>
${trend.newsTitle ? `<p>주요 보도 내용에 따르면 "${trend.newsTitle}" 소식이 중심이 되어 온·오프라인에서 다양한 반응이 이어지고 있습니다.</p>` : ''}
<h2>2. 대중의 반응과 핵심 쟁점</h2>
<p>${trend.snippet || '현재 해당 사안을 두고 여러 커뮤니티와 SNS에서 다양한 관점의 논의가 활발히 전개되고 있는 상황입니다.'}</p>
<h2>3. 향후 전망 및 정리</h2>
<p>앞으로 추가적인 공식 발표나 전개 상황에 따라 새로운 사실이 확인될 것으로 보이며, 지속적인 관심이 필요해 보입니다.</p>
`;
    return { title: fallbackTitle, html: fallbackHtml };
  }
}
