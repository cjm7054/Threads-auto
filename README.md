# 🧵 Threads(스레드) 자동 포스팅 시스템 with GitHub Actions

Meta 공식 Threads Graph API와 GitHub Actions를 활용하여 정해진 스케줄이나 이벤트에 맞춰 스레드에 글을 자동으로 포스팅하는 시스템입니다.

---

## 🌟 주요 기능

- **공식 Threads Graph API 활용**: 비공식 스크래핑/봇 방식이 아닌 공식 Graph API(`graph.threads.net`)를 사용하여 계정 제재 및 차단 위험이 없습니다.
- **큐 기반 포스팅 관리 (`content/queue.json`)**: 포스팅할 글 목록을 JSON 파일에 적어두기만 하면, 워크플로우가 대기(`pending`) 중인 글을 찾아 순서대로 업로드합니다.
- **GitHub Actions 연동**:
  - **정기 발행(Cron)**: 매일 지정된 시각에 자동 실행
  - **수동 즉시 발행(workflow_dispatch)**: 깃허브 웹 페이지에서 버튼 클릭 한 번으로 즉시 발행 가능
  - **자동 상태 갱신**: 포스팅 완료 시 발행 완료(`published`) 상태와 발행 일시, Thread ID를 깃허브 저장소에 자동 커밋 & 푸시
- **시뮬레이션 모드(DRY-RUN)**: 실제 API 호출 없이 로컬 또는 CI에서 큐 관리 및 상태 업데이트 로직을 안전하게 테스트할 수 있습니다.

---

## 📁 프로젝트 구조

```text
├── .github/
│   └── workflows/
│       └── auto-publish.yml    # GitHub Actions 자동 발행 워크플로우
├── content/
│   └── queue.json              # 포스팅 대기/완료 콘텐츠 큐
├── src/
│   ├── index.ts                # CLI 실행 엔트리포인트
│   ├── queueManager.ts         # 큐(queue.json) 로드 및 상태 업데이트 관리자
│   └── threadsClient.ts        # Meta Threads Graph API 통신 클라이언트
├── .env.example                # 환경 변수 템플릿
├── package.json
└── README.md
```

---

## 🔑 1. Meta Threads API 자격 증명 발급 방법

1. **[Meta for Developers](https://developers.facebook.com/)** 접속 및 로그인
2. **앱 만들기**: 유형으로 `Business` 또는 `Other` 선택 후 **Threads API** 제품 추가
3. **권한 승인**: `threads_content_publish`, `threads_basic` 권한 설정
4. **액세스 토큰 생성**:
   - Graph API Explorer 또는 앱 대시보드에서 단기 토큰 발급 후 장기 유효 토큰(Long-Lived Token, 유효기간 60일)으로 교환
5. 발급된 **계정 ID (`THREADS_USER_ID`)** 및 **토큰 (`THREADS_ACCESS_TOKEN`)** 확보

---

## ⚙️ 2. GitHub 저장소 Secrets 등록

본 프로젝트를 내 깃허브 저장소로 푸시한 후, 아래 설정을 진행합니다:

1. 깃허브 레포지토리의 **Settings** 탭 이동
2. 좌측 메뉴에서 **Secrets and variables** > **Actions** 클릭
3. **New repository secret** 버튼 클릭 후 다음 2개 등록:
   - `THREADS_USER_ID`: 내 Threads 계정 고유 ID
   - `THREADS_ACCESS_TOKEN`: Threads 장기 액세스 토큰

---

## 📝 3. 포스팅할 글 등록하는 법 (`content/queue.json`)

`content/queue.json` 파일에 발행할 글 객체를 추가합니다:

```json
[
  {
    "id": "post-001",
    "text": "안녕하세요! 첫 번째 자동 포스팅입니다. 🚀 #Threads #개발",
    "status": "pending"
  },
  {
    "id": "post-002",
    "text": "이미지도 함께 첨부할 수 있습니다!",
    "imageUrl": "https://example.com/image.jpg",
    "status": "pending"
  }
]
```

- `status`가 `"pending"`인 항목 중 가장 첫 번째 항목이 다음 포스팅 대상이 됩니다.
- 발행이 완료되면 깃허브 봇이 자동으로 `status: "published"` 및 `publishedAt`, `threadId`를 업데이트하여 커밋합니다.

---

## 💻 4. 로컬 테스트 및 시뮬레이션 실행

```bash
# 1. 시뮬레이션(Dry-Run) 테스트 (API 키 없이도 동작 확인 가능)
bun run dry-run

# 2. 실제 토큰 설정 후 로컬에서 직접 발행
# .env 파일 생성 후 THREADS_USER_ID, THREADS_ACCESS_TOKEN 입력
bun run post
```

---

## ⏰ 5. GitHub Actions 스케줄 변경

`.github/workflows/auto-publish.yml` 파일에서 크론 표현식을 수정하여 발행 시간을 변경할 수 있습니다:

```yaml
on:
  schedule:
    # 매일 한국 시각 오전 9시 (UTC 00:00)
    - cron: '0 0 * * *'
```
