/**
 * Meta Threads Graph API 클라이언트
 * 공식 Graph API 엔드포인트: https://graph.threads.net/v1.0
 */

export interface CreatePostParams {
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  linkAttachment?: string;
  replyToId?: string;
}

export interface PublishResult {
  success: boolean;
  creationId?: string;
  threadId?: string;
  error?: string;
}

export class ThreadsClient {
  private userId: string;
  private accessToken: string;
  private baseUrl = "https://graph.threads.net/v1.0";
  private dryRun: boolean;

  constructor(userId: string, accessToken: string, dryRun = false) {
    this.userId = userId;
    this.accessToken = accessToken;
    this.dryRun = dryRun;
  }

  /**
   * 1단계: 미디어 컨테이너(Post Container) 생성
   */
  async createContainer(params: CreatePostParams): Promise<string> {
    if (this.dryRun) {
      console.log("[DRY-RUN] 포스트 컨테이너 생성 시뮬레이션:", params);
      return `mock_container_${Date.now()}`;
    }

    const url = `${this.baseUrl}/${this.userId}/threads`;
    const body = new URLSearchParams();
    body.append("access_token", this.accessToken);
    body.append("text", params.text);

    if (params.imageUrl) {
      body.append("media_type", "IMAGE");
      body.append("image_url", params.imageUrl);
    } else if (params.videoUrl) {
      body.append("media_type", "VIDEO");
      body.append("video_url", params.videoUrl);
    } else {
      body.append("media_type", "TEXT");
    }

    if (params.linkAttachment) {
      body.append("link_attachment", params.linkAttachment);
    }

    if (params.replyToId) {
      body.append("reply_to_id", params.replyToId);
    }

    const response = await fetch(url, {
      method: "POST",
      body,
    });

    const data = await response.json() as { id?: string; error?: { message: string } };

    if (!response.ok || !data.id) {
      throw new Error(`Threads 컨테이너 생성 실패: ${data.error?.message || response.statusText}`);
    }

    return data.id;
  }

  /**
   * 미디어 처리 상태 대기 (이미지/동영상 컨테이너인 경우 FINISHED 상태 대기)
   */
  async waitForContainer(containerId: string, maxAttempts = 10, intervalMs = 2000): Promise<void> {
    if (this.dryRun) return;

    for (let i = 0; i < maxAttempts; i++) {
      const url = `${this.baseUrl}/${containerId}?fields=status,error_message&access_token=${this.accessToken}`;
      const res = await fetch(url);
      const data = await res.json() as { status?: string; error_message?: string };

      if (data.status === "FINISHED") {
        return;
      }
      if (data.status === "ERROR") {
        throw new Error(`컨테이너 처리 오류: ${data.error_message || "알 수 없는 오류"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * 2단계: 생성된 컨테이너 최종 발행
   */
  async publishContainer(containerId: string): Promise<string> {
    if (this.dryRun) {
      console.log(`[DRY-RUN] 컨테이너 (${containerId}) 발행 시뮬레이션 완료`);
      return `mock_post_${Date.now()}`;
    }

    const url = `${this.baseUrl}/${this.userId}/threads_publish`;
    const body = new URLSearchParams();
    body.append("creation_id", containerId);
    body.append("access_token", this.accessToken);

    const response = await fetch(url, {
      method: "POST",
      body,
    });

    const data = await response.json() as { id?: string; error?: { message: string } };

    if (!response.ok || !data.id) {
      throw new Error(`Threads 발행 실패: ${data.error?.message || response.statusText}`);
    }

    return data.id;
  }

  /**
   * 원클릭 전체 포스팅 프로세스
   */
  async post(params: CreatePostParams): Promise<PublishResult> {
    try {
      console.log(`[Threads] 포스트 컨테이너 생성 중...`);
      const creationId = await this.createContainer(params);

      // 미디어가 있는 경우 상태 체크
      if (params.imageUrl || params.videoUrl) {
        console.log(`[Threads] 미디어 인코딩 상태 대기 중 (ID: ${creationId})...`);
        await this.waitForContainer(creationId);
      }

      console.log(`[Threads] 최종 포스트 발행 중...`);
      const threadId = await this.publishContainer(creationId);
      console.log(`✅ [Threads] 발행 성공! (ID: ${threadId})`);

      return {
        success: true,
        creationId,
        threadId,
      };
    } catch (err: any) {
      console.error(`❌ [Threads] 포스팅 실패:`, err.message || err);
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }
}
