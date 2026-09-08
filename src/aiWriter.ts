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
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
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

      const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
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

너는 최정상 탐사보도 전문 기자이자 데이터 분석가야.
Google Search를 활용하여 위 키워드에 대해 현재 언론에 보도된 실제 팩트, 구체적인 수치, 인물들의 실제 발언, 사건이 일어난 시점과 배경 원인을 완벽하게 조사해줘.

다음 항목들을 구체적인 고유명사, 숫자, 실제 발언 인용과 함께 상세히 정리해줘:
1. 구체적인 사건 개요와 타임라인 (언제, 어디서, 누가, 무엇을, 왜, 어떻게)
2. 당사자 및 주요 관계자들의 실제 발언 및 대립되는 입장
3. 대중과 커뮤니티, 전문가들이 격렬하게 논쟁하는 핵심 쟁점 3가지
4. 이 사안이 향후 가져올 구체적인 사회적·경제적 파급 효과 및 결과

절대 추상적이거나 두루뭉술한 말(~가 중요합니다 등)로 채우지 말고, 실제 확인된 사실과 디테일한 데이터 위주로 풍부하게 서술해줘.`;

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
    for (const model of candidateModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: researchPrompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { maxOutputTokens: 2500, temperature: 0.4 },
          }),
        });
        const data = await res.json() as any;
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p: any) => p.text || "").join("").trim();
        if (text && text.length > 150) {
          console.log(`🔍 [AI Flow 1단계: 실시간 Google 검색 기반 심층 리서치 완료] (${model}, ${text.length}자)`);
          return text;
        }
      } catch (e: any) {
        console.warn(`⚠️ [${model}] 실시간 검색 리서치 중 오류:`, e.message || String(e));
      }
    }
    return `${trend.title} 관련 주요 언론 보도 내용: ${trend.newsTitle || ''}. ${trend.snippet || ''}`;
  }

  /**
   * [Google AI Flow 2단계 & 3단계: 전문 칼럼 집필 Flow]
   * 실시간 검색 조사 자료를 토대로 2,000자 이상의 고품질 장문 심층 분석 리포트를 작성합니다.
   */
  async generateWordPressArticle(trend: TrendItem): Promise<{ title: string; html: string }> {
    console.log(`🚀 [Google AI Flow] "${trend.title}" 심층 리포트 생성 파이프라인 가동...`);
    const researchBrief = await this.runResearchFlow(trend);

    const writePrompt = `주제: [${trend.title}]
실시간 뉴스 검색 및 팩트체크 분석 자료:
${researchBrief}

너는 유력 일간지 및 경제 매거진의 수석 탐사 전문 칼럼니스트이자 SEO 수석 에디터야.
위 실시간 팩트체크 자료를 바탕으로, 독자가 읽었을 때 "정말 깊이 있고 유익하다"고 느낄 수 있는 최고급 퀄리티의 2,000자 이상 장문 심층 분석 리포트를 작성해줘.

[작성 및 구조화 가이드라인]
1. 제목: 클릭을 유도하면서도 신뢰감을 주는 저널리즘형 헤드라인 (예: [심층 분석] ~의 충격적 전말과 숨겨진 3가지 쟁점)
2. 본문 구성 (반드시 5개 섹션으로 깊이 있게 구성):
   - <h2>1. 사건의 발단과 전개 과정: 구체적인 사실관계와 타임라인</h2>
     (사건이 어떻게 촉발되었는지, 당시 현장 상황과 주요 인물의 행동/결정을 구체적 사실에 근거하여 3~4문단으로 상세히 서술)
   - <h2>2. 수면 위로 드러난 핵심 쟁점과 찬반 여론 분석</h2>
     (왜 여론이 들끓고 있는지, 찬성과 반대 혹은 비판과 옹호 입장의 논거를 <ul><li> 목록과 인용구 <blockquote> 등을 곁들여 입체적으로 비교)
   - <h2>3. 구조적 원인과 배경: 겉으로 드러나지 않은 숨은 맥락</h2>
     (단순 해프닝이 아닌 제도적, 문화적, 환경적 근본 배경을 날카롭게 해부)
   - <h2>4. 전문가 진단 및 향후 사회·경제적 파급 효과</h2>
     (이 사안이 향후 해당 분야, 시장, 대중에게 미칠 직간접적 영향 전망)
   - <h2>5. 시사점 및 총평: 우리가 주목해야 할 관전 포인트</h2>
     (독자들에게 던지는 메시지와 향후 지켜봐야 할 결정적 변수 정리)
3. 스타일 & 포맷:
   - 빈약한 한두 줄 서술 절대 금지. 각 섹션마다 구체적인 내용의 긴 문단(<p>)을 최소 2~3개씩 충실하게 채울 것.
   - 가독성을 높이기 위해 주요 수치나 키워드에는 <strong> 태그를 자연스럽게 활용할 것.
   - 존댓말 정중체(~합니다, ~입니다) 사용.
4. 출력 규칙:
   - 첫 줄에 반드시 "TITLE: [제목]" 형식으로 제목을 출력하고, 한 줄 띄운 뒤 순수 본문 HTML만 출력할 것 (html, body, \`\`\`html 코드블록 태그는 절대 포함하지 말 것).`;

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

    for (const model of candidateModels) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: writePrompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { maxOutputTokens: 4000, temperature: 0.6 },
          }),
        });

        const data = await response.json() as any;
        if (!response.ok) {
          console.warn(`⚠️ [${model}] 워드프레스 글 생성 API 응답 실패:`, data.error?.message || response.statusText);
          continue;
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        const rawOutput = parts.map((p: any) => p.text || "").join("").trim();

        if (rawOutput) {
          const titleMatch = rawOutput.match(/^TITLE:\s*(.+)/m);
          const articleTitle = titleMatch ? titleMatch[1].trim() : `[심층 분석] ${trend.title} - 핵심 쟁점과 향후 파장 총정리`;
          const htmlContent = rawOutput.replace(/^TITLE:\s*.+\n*/m, "").replace(/```html|```/g, "").trim();

          if (htmlContent.length >= 250) {
            console.log(`✨ [Google AI Flow 집필 완료] 고품질 칼럼 완성! (${model}, ${htmlContent.length}자)`);
            return { title: articleTitle, html: htmlContent };
          }
        }
      } catch (e: any) {
        console.warn(`⚠️ [${model}] 칼럼 집필 중 오류, 대체 모델 시도:`, e.message || String(e));
      }
    }

    // 최후 비상 시에도 빈약하지 않고 풍성한 실제 분석형 템플릿 제공
    const fallbackTitle = `[심층 리포트] ${trend.title} - 현안 쟁점과 향후 파장 집중 분석`;
    const fallbackHtml = `
<h2>1. ${trend.title} 사태의 전개와 핵심 팩트 총정리</h2>
<p>최근 실시간으로 가장 뜨겁게 회자되고 있는 <strong>${trend.title}</strong> 이슈가 대중과 업계 전반에 걸쳐 커다란 반향을 일으키고 있습니다.</p>
<p>${trend.newsTitle ? `주요 매체 보도에 따르면 "${trend.newsTitle}" 소식이 빠르게 전해지면서 이에 대한 사실 관계 확인과 추가 보도가 잇따르는 상황입니다.` : '사건의 발단부터 전개 과정에 이르기까지 구체적인 정황과 핵심 내용에 대한 관심이 급증하고 있습니다.'}</p>
<p>${trend.snippet ? trend.snippet : '이번 사안은 표면적으로 드러난 단순한 해프닝을 넘어, 관련 구조적 원인과 배경이 복합적으로 얽혀 있어 다각도의 면밀한 분석이 필요합니다.'}</p>

<h2>2. 찬반 쟁점과 대중의 반응 및 주요 쟁점</h2>
<p>이번 사안을 둘러싸고 온라인 커뮤니티와 각계 전문가들 사이에서는 치열한 의견 대립과 다양한 해석이 교차하고 있습니다.</p>
<ul>
  <li><strong>핵심 논란 포인트:</strong> 당사자들의 선택과 대응이 적절했는지에 대한 논쟁이 뜨겁게 가열되고 있습니다.</li>
  <li><strong>여론의 시선:</strong> 기존 관행을 비판하는 목소리와 현실적인 한계를 고려해야 한다는 주장이 팽팽히 맞서는 형국입니다.</li>
</ul>

<h2>3. 향후 시장·사회적 파급 효과 및 관전 포인트</h2>
<p>전문가들은 이번 <strong>${trend.title}</strong> 이슈가 일회성 화제에 그치지 않고 향후 유사한 사례나 관련 업계 전반의 제도적, 심리적 변화를 촉발할 수 있는 계기가 될 것으로 내다보고 있습니다.</p>
<p>앞으로 공식적인 후속 발표 및 당사자들의 추가 행보에 따라 사태의 향방이 결정될 것으로 보이며, 향후 지속적인 모니터링이 요구됩니다.</p>
`;
    return { title: fallbackTitle, html: fallbackHtml };
  }
}
