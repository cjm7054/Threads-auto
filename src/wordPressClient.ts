import { TrendItem } from "./trendCollector";

export interface WordPressPostResult {
  success: boolean;
  postUrl?: string;
  postId?: number;
  error?: string;
}

export class WordPressClient {
  private baseUrl: string;
  private username: string;
  private appPassword: string;

  constructor(baseUrl: string, username: string, appPassword: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.appPassword = appPassword.replace(/\s+/g, ""); // 공백 제거
  }

  /**
   * 워드프레스에 새로운 분석 포스트를 게시합니다.
   */
  async createPost(title: string, contentHtml: string, tags: string[] = []): Promise<WordPressPostResult> {
    const url = `${this.baseUrl}/wp-json/wp/v2/posts`;
    const authHeader = "Basic " + Buffer.from(`${this.username}:${this.appPassword}`).toString("base64");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          title,
          content: contentHtml,
          status: "publish",
        }),
      });

      const data = await response.json() as any;

      if (!response.ok || !data.link) {
        throw new Error(data.message || response.statusText || "발행 실패");
      }

      console.log(`✅ [워드프레스] 포스팅 성공! URL: ${data.link}`);
      return {
        success: true,
        postUrl: data.link,
        postId: data.id,
      };
    } catch (err: any) {
      console.error("❌ [워드프레스] 발행 오류:", err.message || err);
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * 외부 이미지(뉴스 썸네일 or AI 이미지)를 워드프레스 미디어 라이브러리에 업로드하여
   * 안정적인 자체 고화질 CDN URL (https://insightlab365.com/wp-content/uploads/...)을 반환받습니다.
   */
  async uploadMedia(imageUrl: string, filename = "featured.jpg"): Promise<string | null> {
    try {
      console.log(`📥 [이미지 다운로드 시도] ${imageUrl}`);
      const imgRes = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!imgRes.ok) {
        throw new Error(`이미지 다운로드 실패: ${imgRes.statusText}`);
      }

      const buffer = await imgRes.arrayBuffer();
      const uploadUrl = `${this.baseUrl}/wp-json/wp/v2/media`;
      const authHeader = "Basic " + Buffer.from(`${this.username}:${this.appPassword}`).toString("base64");

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Disposition": `attachment; filename="${Date.now()}_${filename}"`,
          "Content-Type": "image/jpeg",
        },
        body: buffer,
      });

      const data = await response.json() as any;
      if (response.ok && data.source_url) {
        console.log(`✅ [워드프레스 미디어 업로드 성공] 고유 URL: ${data.source_url}`);
        return data.source_url;
      }
      console.warn("⚠️ 워드프레스 미디어 업로드 응답 이상:", data);
      return null;
    } catch (err) {
      console.warn("⚠️ 워드프레스 미디어 업로드 실패 (원본 URL 사용 시도):", err);
      return null;
    }
  }
}
