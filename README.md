# 🧵 실시간 트렌드 AI 자동 포스팅 시스템 with Threads & GitHub Actions

구글 트렌드(Google Trends)의 **대한민국 실시간 급상승 검색어 및 관련 뉴스**를 자동으로 가져와, **Google Gemini AI (`gemini-2.5-flash`)**가 스레드에 어울리는 매력적인 게시글을 작성하고 Meta 공식 Threads API로 자동 발행하는 시스템입니다.

---

## 🌟 주요 기능

1. **실시간 트렌드 수집**:
   - 대한민국 구글 트렌드 실시간 검색어, 관련 기사 헤드라인 및 링크 자동 추출
2. **Google Gemini AI 자동 본문 작성**:
   - 스레드(Threads) 특유의 친근한 대화체, 흥미를 끄는 첫 문장(후킹), 이모지, 깔끔한 줄바꿈, 댓글 유도 질문, 해시태그 자동 작성
   - 최신 초경량 고성능 모델 `gemini-2.5-flash` 사용 (무료 할당량으로 충분히 운영 가능)
3. **중복 포스팅 방지 시스템 (`content/published_history.json`)**:
   - 최근 7일 이내에 이미 포스팅한 키워드는 자동으로 건너뛰고 다음 인기 키워드를 선정
4. **GitHub Actions 스케줄링**:
   - 매일 **오전 9시, 오후 1시, 오후 7시** (한국 시간 기준) 정기 자동 발행
   - `Actions` 탭에서 언제든지 수동 즉시 실행 가능 (`trend` 모드 또는 `queue` 모드 선택 지원)
5. **수동 큐(`queue.json`) 백업 지원**:
   - 내가 직접 적어둔 글을 올리고 싶을 땐 `content/queue.json`을 통한 포스팅도 가능

---

## 📁 프로젝트 구조

```text
├── .github/
│   └── workflows/
│       └── auto-publish.yml        # GitHub Actions 스케줄러 (트렌드 AI 발행)
├── content/
│   ├── queue.json                  # 수동 작성 대기 큐
│   └── published_history.json      # 발행 완료된 트렌드 키워드 히스토리
├── src/
│   ├── index.ts                    # 메인 실행 엔트리포인트
│   ├── trendCollector.ts           # 구글 실시간 트렌드 RSS 수집 모듈
│   ├── aiWriter.ts                 # Google Gemini 2.5 Flash 스레드 글 작성 모듈
│   ├── historyManager.ts           # 중복 포스팅 방지 히스토리 관리자
│   ├── queueManager.ts             # 큐 관리자
│   └── threadsClient.ts            # Meta 공식 Threads Graph API 클라이언트
├── .env.example
├── package.json
└── README.md
```

---

## 🔑 GitHub Secrets 등록 가이드 (3개 필요)

깃허브 저장소 **Settings ➔ Secrets and variables ➔ Actions** 에 다음 3개의 시크릿을 등록합니다:

| 시크릿 이름 | 설명 | 발급처 |
| :--- | :--- | :--- |
| `THREADS_USER_ID` | 내 Threads 계정 고유 ID | Meta Graph API (`/v1.0/me`) |
| `THREADS_ACCESS_TOKEN` | Threads 60일 장기 액세스 토큰 | Meta Developers (사용자 토큰 생성기) |
| **`GEMINI_API_KEY`** | **Google Gemini 무료 API 키** | **[Google AI Studio](https://aistudio.google.com/app/apikey)** |

### 💡 Google Gemini API Key 무료 발급 방법 (1분 소요)
1. **[Google AI Studio](https://aistudio.google.com/app/apikey)** 에 접속하여 구글 계정으로 로그인합니다.
2. 파란색 **[Create API key]** 버튼을 클릭합니다.
3. 생성된 키를 복사하여 깃허브 시크릿에 `GEMINI_API_KEY` 로 등록하면 끝입니다!

---

## 💻 로컬 테스트 방법

```bash
# 1. 실시간 트렌드 수집 및 AI 작성 시뮬레이션 (API 키 없이도 목업 본문으로 테스트 가능)
bun run src/index.ts --trend-auto --dry-run

# 2. 실제 토큰 및 Gemini 키로 로컬에서 직접 1회 포스팅
bun run trend-post
```
