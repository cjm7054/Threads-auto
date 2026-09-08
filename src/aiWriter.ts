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
   * 이슈 주제를 바탕으로 사실적이고 생생한 보도 사진(다큐멘터리/실사 포토저널리즘 스타일) 비주얼을 생성합니다.
   * SF/우주/판타지/만화/얼굴 캐릭터를 철저히 배제하고 뉴스 맥락과 100% 일치시킵니다.
   */
  async generateImageUrl(trend: TrendItem): Promise<string> {
    try {
      const promptQuery = `주제: "${trend.title}", 관련 기사 내용: "${trend.newsTitle || ''}", 요약: "${trend.snippet || ''}"
너는 퓰리처상 수상 경력의 글로벌 통신사(로이터, AP) 수석 사진 보도 디렉터야.
위 뉴스 기사의 사건 현장과 맥락을 완벽히 대변하는 '사실적인 보도 사진(Photojournalism)' 영문 프롬프트(25단어 이내)를 작성해줘.

[엄격한 생성 규칙]
1. 날씨/자연재해/침수/폭우(예: 비, 태풍, 지하차도, 홍수):
   - 실제 비가 쏟아지는 아스팔트 도로, 물에 잠긴 지하차도 또는 빗물 고인 도심 거리 등 사실적인 뉴스 보도 사진. (절대 우주, 판타지, 그래픽 아트를 그리지 말 것)
   - 예시: "Documentary photo of heavy rain pouring on an urban flooded street underpass, realistic news photography, cloudy dark rainy sky"
2. 경제/물가/부동산:
   - 실제 도시 마천루 비즈니스 빌딩가, 실제 마켓/증권 거래소 풍경 등 차분한 실사 보도 사진.
3. 사회/교통/사건사고:
   - 관련 현장, 도로, 관공서, 실제 뉴스 배경에 맞는 현장 실사 사진.
4. 스포츠:
   - 해당 종목의 잔디 경기장, 야구장/축구장 필드 실사 보도 사진.
5. IT/인공지능/테크:
   - 실제 첨단 데이터센터 서버 랙 룸 또는 실물 마이크로칩 하드웨어 실사 사진.
6. [절대 금지]: 판타지, SF, 외계 행성, 우주선, 애니메이션, 일러스트, 인물(여성/남성)의 정면 클로즈업 얼굴, 글자, 텍스트, 로고 금지.
오직 영문 프롬프트 문장만 단독으로 출력해.`;

      const candidateModels = ["gemini-3.6-flash", "gemini-2.5-flash"];
      let visualPrompt = "";

      for (const model of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptQuery }] }],
              generationConfig: { maxOutputTokens: 100, temperature: 0.3 },
            }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            visualPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            if (visualPrompt) break;
          }
        } catch {}
      }

      if (!visualPrompt) {
        visualPrompt = `Realistic documentary news photo of ${trend.title}, authentic photojournalism, realistic natural lighting`;
      }

      console.log(`🎨 [보도사진 AI 비주얼 프롬프트 확정] ${visualPrompt}`);

      // 사실적 다큐멘터리 보도 사진 스타일 주입, 판타지/글자 배제
      const cleanPrompt = encodeURIComponent(`${visualPrompt}, realistic documentary photography, authentic photojournalism, natural lighting, high resolution, 35mm photograph, no text, no watermark, realistic`);
      return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1080&model=flux&nologo=true&enhance=false`;
    } catch (err) {
      console.warn("⚠️ AI 맞춤 비주얼 생성 중 오류, 기본 보도사진 테마 적용:", err);
      return `https://image.pollinations.ai/prompt/realistic%20documentary%20news%20photo%20city%20street%20natural%20lighting?width=1080&height=1080&model=flux&nologo=true`;
    }
  }

  /**
   * [Google AI Flow 1단계: 심층 리서치 및 쟁점 분석]
   * 단순 키워드를 바탕으로 핵심 사건, 사실 관계, 대중 반응, 향후 파장을 입체적으로 분석합니다.
   */
  private async runResearchFlow(trend: TrendItem): Promise<string> {
    const researchPrompt = `키워드: [${trend.title}]
관련 기사: "${trend.newsTitle || ''}"
요약 내용: "${trend.snippet || ''}"

너는 전문 시사·트렌드 탐사 저널리스트이자 데이터 분석가야.
위 이슈에 대해 다음 4가지 관점에서 깊이 있는 리서치 브리핑을 작성해줘:
1. 핵심 팩트 및 발단: 무슨 일이 언제 어떻게 일어났는가?
2. 주요 인물/단체 간의 이해관계 및 숨은 배경
3. 대중 및 전문가들의 주요 찬반 쟁점과 논란 포인트
4. 향후 이 사건이 사회·경제·문화적으로 미칠 중장기 파급 효과
각 항목별로 구체적이고 깊이 있는 분석 내용을 bullet point로 작성해줘.`;

    const candidateModels = ["gemini-1.5-pro", "gemini-3.6-flash", "gemini-2.5-flash"];
    for (const model of candidateModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: researchPrompt }] }],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
          }),
        });
        const data = await res.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 100) {
          console.log(`🔍 [AI Flow 1단계: 리서치 완료] (${model})`);
          return text;
        }
      } catch {}
    }
    return `${trend.title} 관련 주요 언론 보도 내용: ${trend.newsTitle || ''}. ${trend.snippet || ''}`;
  }

  /**
   * [Google AI Flow 2단계 & 3단계: 전문 칼럼 집필 Flow]
   * 리서치 결과를 토대로 목차를 설계하고, 약 1,500~2,000자의 완성도 높은 전문 리포트를 워드프레스용 HTML로 작성합니다.
   */
  async generateWordPressArticle(trend: TrendItem): Promise<{ title: string; html: string }> {
    console.log(`🚀 [Google AI Flow] "${trend.title}" 심층 리포트 생성 파이프라인 가동...`);
    const researchBrief = await this.runResearchFlow(trend);

    const writePrompt = `주제: [${trend.title}]
리서치 심층 분석 자료:
${researchBrief}

너는 유력 언론사 수석 칼럼니스트이자 SEO 전문 콘텐츠 에디터야.
위 리서치 분석 자료를 기반으로, 포털 뉴스 1면이나 경제지에 실릴 법한 최고급 심층 분석 칼럼을 작성해줘.

[작성 지침]
1. 제목: 검색 유입과 호기심을 동시에 잡는 품격 있는 헤드라인 (예: [심층 분석] 5,500억 투자의 역설... ~사태가 남긴 3가지 교훈)
2. 본문 구성:
   - <h2> 도입: 사건의 발단과 현재 상황 총정리
   - <h2> 쟁점 1: 대중이 분노(또는 열광)하는 핵심 이유
   - <h2> 쟁점 2: 표면 아래 숨겨진 구조적 원인과 배경 분석
   - <h2> 전망과 시사점: 앞으로 일어날 시나리오 및 독자들에게 주는 통찰
3. 형식:
   - 각 소제목(<h2>) 아래에 2~3개의 풍부한 문단(<p>)과 강조 태그(<strong>), 핵심 요약 리스트(<ul><li>)를 자연스럽게 섞어 가독성 극대화.
   - 분량은 1,500자~2,000자 수준으로 구체적 사실과 논리적 근거를 바탕으로 꽉 찬 내용을 담을 것.
   - 존댓말 정중체(~합니다, ~입니다) 사용.
4. 첫 줄에 반드시 "TITLE: [제목]" 형식으로 제목을 출력하고, 한 줄 띄운 뒤 순수 본문 HTML만 출력할 것 (html, body, codeblock 제외).`;

    const candidateModels = ["gemini-1.5-pro", "gemini-3.6-flash", "gemini-2.5-flash"];

    for (const model of candidateModels) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: writePrompt }] }],
            generationConfig: { maxOutputTokens: 3000, temperature: 0.6 },
          }),
        });

        const data = await response.json() as any;
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (rawOutput) {
          const titleMatch = rawOutput.match(/^TITLE:\s*(.+)/m);
          const articleTitle = titleMatch ? titleMatch[1].trim() : `[심층 분석] ${trend.title} - 핵심 쟁점과 향후 파장 총정리`;
          const htmlContent = rawOutput.replace(/^TITLE:\s*.+\n*/m, "").replace(/```html|```/g, "").trim();

          if (htmlContent.length >= 500) {
            console.log(`✨ [Google AI Flow 집필 완료] 고품질 칼럼 완성! (${model}, ${htmlContent.length}자)`);
            return { title: articleTitle, html: htmlContent };
          }
        }
      } catch (e: any) {
        console.warn(`⚠️ [${model}] 칼럼 집필 중 오류, 대체 모델 시도:`, e.message || String(e));
      }
    }

    // 최후 비상 템플릿도 풍부하게 보강
    const fallbackTitle = `[이슈 리포트] ${trend.title} - 주요 팩트 체크와 쟁점 분석`;
    const fallbackHtml = `
<h2>1. ${trend.title} 사태의 배경과 핵심 팩트</h2>
<p>최근 온·오프라인을 뜨겁게 달구고 있는 <strong>${trend.title}</strong> 이슈는 단순한 일회성 사건을 넘어 사회적 관심사로 급부상하고 있습니다.</p>
<p>${trend.newsTitle ? `주요 언론 보도에 따르면 "${trend.newsTitle}" 소식이 전해지며 다양한 해석과 반응이 엇갈리고 있습니다.` : ''}</p>
<h2>2. 핵심 쟁점과 대중의 반응</h2>
<p>${trend.snippet || '전문가들은 이번 사안이 지닌 구조적인 문제점과 향후 파급력에 주목하고 있으며, 온라인 커뮤니티에서도 찬반 논쟁이 치열하게 전개되고 있습니다.'}</p>
<h2>3. 향후 전망 및 관전 포인트</h2>
<p>이번 사안의 전개 방향에 따라 관련 업계와 시장에 적지 않은 변화가 예상되며, 공식적인 후속 발표를 주의 깊게 지켜볼 필요가 있습니다.</p>
`;
    return { title: fallbackTitle, html: fallbackHtml };
  }
}
