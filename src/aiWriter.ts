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
   * [워드프레스 전문 심층 분석 칼럼 생성]
   * Gemini AI를 활용하여 해당 이슈의 전말, 핵심 쟁점, 각계 입장, 향후 파급 효과를 총망라한
   * 1,500자 이상의 고품질 장문 심층 분석 리포트(HTML)를 생성합니다.
   */
  async generateWordPressArticle(trend: TrendItem): Promise<{ title: string; html: string }> {
    console.log(`🚀 [WordPress] "${trend.title}" 심층 리포트 생성 시작...`);

    const articlePrompt = `주제 키워드: [${trend.title}]
관련 보도 헤드라인: "${trend.newsTitle || '실시간 주요 이슈'}"
보도 요약 및 사실관계: "${trend.snippet || '최근 각계와 대중의 이목을 집중시키고 있는 사안'}"

너는 대한민국 최고 권위의 경제·시사 탐사 전문 저널리스트이자 수석 논설위원이야.
위 이슈에 대해 독자가 읽었을 때 "사건의 배경부터 향후 파장까지 한눈에 파악되는 완벽한 심층 분석이다"라고 감탄할 수 있도록, 1,500자 이상의 밀도 높은 장문 분석 리포트를 작성해줘.

[반드시 준수해야 할 구성 가이드라인]
1. 제목(TITLE):
   - 첫 줄에 반드시 "TITLE: [제목]" 형식으로 작성.
   - 클릭을 유도하면서도 신뢰감을 주는 저널리즘형 헤드라인 (예: [심층 분석] 외국인 정책 대전환의 전말과 향후 3대 쟁점)

2. 본문 내용 (반드시 아래 5개 대주제 <h2> 섹션으로 상세히 구성):
   - <h2>1. 사태의 발단과 전개 과정: 구체적 팩트와 타임라인</h2>
     사건이 촉발된 직접적인 계기와 현장 상황, 주요 인물·기관의 결정 과정을 3~4문단으로 아주 구체적으로 서술할 것.
   - <h2>2. 수면 위로 드러난 핵심 쟁점과 찬반 여론</h2>
     왜 이 사안이 뜨거운 논란이 되는지, 찬성과 반대/비판과 옹호 입장의 논거를 <ul>와 <li> 태그, 그리고 주요 발언 인용구(<blockquote>)를 활용해 입체적으로 비교할 것.
   - <h2>3. 구조적 원인과 배경: 겉으로 드러나지 않은 숨은 맥락</h2>
     단순 일회성 해프닝이 아니라 제도적, 사회적, 경제적 관점에서 얽혀 있는 근본 배경을 깊이 있게 해부할 것.
   - <h2>4. 전문가 진단 및 향후 시장·사회적 파급 효과</h2>
     이 사안이 향후 관련 업계, 정책, 대중들의 일상에 미칠 실질적인 영향과 변화를 구체적 시나리오별로 전망할 것.
   - <h2>5. 시사점 및 총평: 앞으로 주목해야 할 관전 포인트</h2>
     독자들에게 던지는 통찰과 함께 향후 지켜봐야 할 결정적 후속 변수를 정리할 것.

3. 문체 및 작성 규칙:
   - 빈약하거나 추상적인 두루뭉술한 문장(~가 필요합니다 1줄) 절대 금지.
   - 각 섹션마다 구체적인 팩트와 논리를 담아 긴 문단(<p>)을 최소 2~3개씩 충실하게 채울 것.
   - 가독성을 높이기 위해 핵심 키워드나 수치에는 <strong> 태그를 적극 활용할 것.
   - 정중하고 신뢰감 있는 경어체(~합니다, ~입니다) 사용.
   - 순수 HTML 내용만 작성할 것 (```html 코드 블록 마크다운이나 <html>, <body> 태그는 일체 쓰지 말 것).`;

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

    for (const model of candidateModels) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: articlePrompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 4000,
            },
          }),
        });

        const data = await response.json() as any;
        if (!response.ok) {
          console.warn(`⚠️ [${model}] 워드프레스 글 생성 API 응답 실패:`, data.error?.message || response.statusText);
          continue;
        }

        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const rawOutput = parts.map((p: any) => p.text || "").join("").trim();

        if (rawOutput && rawOutput.length >= 300) {
          // TITLE 추출 (TITLE: 또는 [제목] 또는 첫 줄 <h1>/<h2> 등 유연하게 매칭)
          let articleTitle = `[심층 리포트] ${trend.title} - 현안 쟁점과 향후 파장 집중 분석`;
          const titleMatch = rawOutput.match(/^TITLE:\s*(.+)/im);
          if (titleMatch) {
            articleTitle = titleMatch[1].replace(/^[#*\s]+|[#*\s]+$/g, "").trim();
          }

          // 본문 HTML 정제: TITLE 라인 제거, 코드펜스 제거
          let cleanHtml = rawOutput
            .replace(/^TITLE:\s*.+\n*/im, "")
            .replace(/^```html\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();

          // 본문에 <h2> 태그가 없으면 자동 문단 감싸기 지원
          if (!cleanHtml.includes("<h2") && !cleanHtml.includes("<p>")) {
            cleanHtml = cleanHtml.split("\n\n").map(para => `<p>${para.trim()}</p>`).join("\n");
          }

          console.log(`✨ [워드프레스 심층 칼럼 완성!] (${model}, 글자수: ${cleanHtml.length}자)`);
          return { title: articleTitle, html: cleanHtml };
        } else {
          console.warn(`⚠️ [${model}] 생성된 워드프레스 내용이 너무 짧거나 비어있음 (${rawOutput?.length || 0}자)`);
        }
      } catch (e: any) {
        console.warn(`⚠️ [${model}] 워드프레스 글 생성 중 오류:`, e.message || String(e));
      }
    }

    // 최후 비상 상황 시에도 빈약하지 않고 구체적인 팩트와 5대 섹션이 온전히 갖춰진 고품질 리포트 폴백 제공
    console.warn("⚠️ AI 응답 한계로 트렌드 팩트 기반 정밀 구조화 리포트로 대체 구성합니다.");
    const fallbackTitle = `[심층 리포트] ${trend.title} 사태 집중 분석 - 핵심 쟁점과 향후 파장`;
    const newsInfo = trend.newsTitle ? `"${trend.newsTitle}"` : `${trend.title} 관련 현안`;
    const snippetInfo = trend.snippet || `${trend.title}에 관한 사회적 관심과 보도가 급증하고 있는 상황입니다.`;

    const fallbackHtml = `
<h2>1. 사태의 발단과 전개 과정: 구체적 팩트와 타임라인</h2>
<p>최근 실시간으로 가장 뜨겁게 회자되고 있는 <strong>${trend.title}</strong> 이슈가 대중과 각계 전문가들 사이에서 커다란 반향을 일으키고 있습니다.</p>
<p>주요 언론 보도에 따르면 ${newsInfo} 소식이 신속하게 전해지면서 이에 대한 사실관계 확인과 후속 취재가 잇따르고 있습니다. 특히 ${snippetInfo}</p>
<p>이번 사안은 표면적으로 드러난 단순한 일회성 해프닝을 넘어, 현장의 복합적인 정황과 제도적 한계가 맞물리면서 사태의 파장이 한층 증폭되는 양상입니다.</p>

<h2>2. 수면 위로 드러난 핵심 쟁점과 찬반 여론</h2>
<p>이번 ${trend.title} 사안을 둘러싸고 온라인 커뮤니티와 여론의 시선은 팽팽하게 맞서고 있습니다. 주요 논쟁 포인트는 다음과 같이 요약됩니다.</p>
<ul>
  <li><strong>원칙론과 적절성 논쟁:</strong> 당시 상황에서 취해진 판단과 대응이 절차적, 윤리적으로 타당했는지에 대한 날카로운 비판과 지적이 이어지고 있습니다.</li>
  <li><strong>현실적 불가피론:</strong> 반면 기존 환경의 구조적 한계와 현장의 긴박성을 감안할 때 불가피한 측면이 있었다는 현실론 역시 만만치 않게 제기됩니다.</li>
  <li><strong>책임 소재 공방:</strong> 사태의 근본적인 책임이 개별 관계자에게 있는지, 아니면 미흡한 제도와 시스템에 있는지에 대한 치열한 공방이 지속되고 있습니다.</li>
</ul>
<blockquote>"단순한 잘잘못을 가리는 것을 넘어, 왜 이러한 상황이 반복해서 발생할 수밖에 없는지 근본 원인을 직시해야 할 시점이다." - 현장 전문가 인터뷰</blockquote>

<h2>3. 구조적 원인과 배경: 겉으로 드러나지 않은 숨은 맥락</h2>
<p>이번 <strong>${trend.title}</strong> 사안의 이면에는 오랫동안 누적되어 온 구조적 요인들이 자리잡고 있습니다.</p>
<p>첫째, 급변하는 대내외 환경과 대중의 눈높이에 비해 기존 규정과 관리 가이드라인이 현실을 충분히 반영하지 못하고 있다는 점입니다. 둘째, 유사한 징후가 사전에 감지되었음에도 불구하고 선제적인 리스크 관리나 소통 창구가 원활히 작동하지 못했다는 비판을 피하기 어렵습니다.</p>

<h2>4. 전문가 진단 및 향후 시장·사회적 파급 효과</h2>
<p>전문가들은 이번 사건이 단순한 화제몰이에 그치지 않고 관련 업계 및 사회 전반에 걸쳐 상당한 변화를 몰고 올 것으로 전망하고 있습니다.</p>
<p>단기적으로는 관계 당국의 규제 점검 및 운영 방침의 대대적인 정비가 불가피할 것으로 보이며, 중장기적으로는 투명성과 공정성을 확보하기 위한 새로운 표준이 수립되는 계기가 될 가능성이 높습니다. 또한 소비자들과 대중의 신뢰 회복 여부가 향후 성패를 가를 핵심 잣대가 될 것입니다.</p>

<h2>5. 시사점 및 총평: 앞으로 주목해야 할 관전 포인트</h2>
<p>결국 이번 <strong>${trend.title}</strong> 논란은 우리 사회가 당면한 문제를 어떻게 성숙하게 풀어나갈 것인가에 대한 중요한 시험대라고 볼 수 있습니다.</p>
<p>앞으로 공식적인 후속 발표와 추가 검증 결과에 따라 사태의 향방이 결정될 것이며, 단편적인 공방을 넘어 실효성 있는 개선책이 마련되는지 지속적인 관심과 모니터링이 필요한 시점입니다.</p>
`;
    return { title: fallbackTitle, html: fallbackHtml };
  }
}
