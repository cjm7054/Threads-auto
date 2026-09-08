/**
 * 실시간 대한민국 구글 트렌드(Google Trends) 수집 모듈
 */

export interface TrendItem {
  title: string;
  approxTraffic?: string;
  newsTitle?: string;
  newsUrl?: string;
  snippet?: string;
  pictureUrl?: string;
}

export class TrendCollector {
  private rssUrls = [
    "https://trends.google.com/trending/rss?geo=KR",
    "https://trends.google.co.kr/trending/rss?geo=KR",
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR"
  ];

  /**
   * 구글 트렌드 RSS 피드를 파싱하여 최신 트렌드 리스트를 가져옵니다.
   * 구글 서버의 500/503 일시적 오류 시 최대 3회 재시도합니다.
   */
  async fetchTrends(): Promise<TrendItem[]> {
    let lastError = "";

    for (const url of this.rssUrls) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            },
          });

          if (response.ok) {
            const xml = await response.text();
            const items = this.parseRss(xml);
            if (items.length > 0) {
              return items;
            }
          }
          lastError = `${response.statusText} (${response.status})`;
        } catch (e: any) {
          lastError = e.message || String(e);
        }

        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    throw new Error(`구글 트렌드 RSS 수집 실패: ${lastError}`);
  }

  /**
   * 뉴스 원문 URL(newsUrl)에 접속하여 언론사 공식 고화질 대표 이미지(og:image)를 추출합니다.
   * 구글 트렌드 RSS 썸네일(150px) 대신 1200x630 이상의 선명한 실제 보도 사진 원본을 획득합니다.
   */
  async fetchArticleOgImage(newsUrl?: string): Promise<string | undefined> {
    if (!newsUrl) return undefined;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      const response = await fetch(newsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return undefined;

      const html = await response.text();

      // <meta property="og:image" content="..."> 또는 <meta content="..." property="og:image"> 정규식 매칭
      const match =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      if (match && match[1]) {
        let imageUrl = match[1].trim();
        // 상대 경로인 경우 절대 경로로 보정
        if (imageUrl.startsWith("//")) {
          imageUrl = "https:" + imageUrl;
        } else if (imageUrl.startsWith("/")) {
          const parsedUrl = new URL(newsUrl);
          imageUrl = `${parsedUrl.origin}${imageUrl}`;
        }
        return imageUrl;
      }
    } catch (e: any) {
      console.warn(`⚠️ 뉴스 원문 og:image 추출 중 건너뜀 (${newsUrl}):`, e.message || String(e));
    }
    return undefined;
  }

  private cleanText(str?: string): string | undefined {
    if (!str) return undefined;
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  private parseRss(xml: string): TrendItem[] {
    const items: TrendItem[] = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const rawItem of itemMatches) {
      const titleMatch = rawItem.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || rawItem.match(/<title>(.*?)<\/title>/);
      const title = this.cleanText(titleMatch ? titleMatch[1] : "") || "";

      if (!title) continue;

      const trafficMatch = rawItem.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
      const approxTraffic = this.cleanText(trafficMatch ? trafficMatch[1] : undefined);

      const newsTitleMatch = rawItem.match(/<ht:news_item_title><!\[CDATA\[(.*?)\]\]><\/ht:news_item_title>/) ||
                             rawItem.match(/<ht:news_item_title>(.*?)<\/ht:news_item_title>/);
      const newsTitle = this.cleanText(newsTitleMatch ? newsTitleMatch[1] : undefined);

      const newsUrlMatch = rawItem.match(/<ht:news_item_url><!\[CDATA\[(.*?)\]\]><\/ht:news_item_url>/) ||
                           rawItem.match(/<ht:news_item_url>(.*?)<\/ht:news_item_url>/);
      const newsUrl = newsUrlMatch ? newsUrlMatch[1].trim() : undefined;

      const snippetMatch = rawItem.match(/<ht:news_item_snippet><!\[CDATA\[(.*?)\]\]><\/ht:news_item_snippet>/) ||
                           rawItem.match(/<ht:news_item_snippet>(.*?)<\/ht:news_item_snippet>/);
      const snippet = this.cleanText(snippetMatch ? snippetMatch[1] : undefined);

      const pictureMatch = rawItem.match(/<ht:picture><!\[CDATA\[(.*?)\]\]><\/ht:picture>/) ||
                           rawItem.match(/<ht:picture>(.*?)<\/ht:picture>/) ||
                           rawItem.match(/<ht:news_item_picture><!\[CDATA\[(.*?)\]\]><\/ht:news_item_picture>/) ||
                           rawItem.match(/<ht:news_item_picture>(.*?)<\/ht:news_item_picture>/);
      const pictureUrl = pictureMatch ? pictureMatch[1].trim() : undefined;

      items.push({
        title,
        approxTraffic,
        newsTitle,
        newsUrl,
        snippet,
        pictureUrl,
      });
    }

    return items;
  }
}
