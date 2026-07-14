# ResQ — Milestone 1 설계 문서

> 한국 인턴/레지던트를 위한 all-in-one 비서 웹앱. 첫 구현 단위(M1)의 설계.
> 작성일: 2026-07-14

---

## 1. 제품 개요

**ResQ** 는 한국의 인턴·레지던트가 매일 여는 통합 대시보드다. 최종적으로는
(1) 논문/학술지 자동 수집·분석, (2) 학회·수술·일정 관리 + Google Calendar 연동,
(3) Gmail 일정 자동 추출, (4) 대시보드 + 마스코트 육성 을 하나의 앱에 담는다.

이 문서는 **첫 구현 단위(Milestone 1)** 만 다룬다.

### M1 범위 (이번에 만든다)
- **통합 뼈대**: React + TypeScript + Vite + Tailwind, Google 로그인, 클라우드 DB, 서버측 API.
- **대시보드 + 마스코트**: 히어로(병원/연차/닉네임/D-day) + 마스코트 육성 존.
- **논문 기본형**: PubMed 자동 수집 + Claude AI 초록 분석/해석/breakdown + **사용자 PDF 업로드 분석**.

### M1 비범위 (로드맵 — 다음 사이클)
- Google Calendar 연동 / 일정 관리 UI (기능 2)
- Gmail 일정 자동 추출 (기능 3)
- 국내 학회지(KoreaMed / KMbase) 자동 수집 (기능 1 확장)
- 주간 논문 자동 리포트 생성·제출 (기능 1 확장)
- 마스코트 소셜(다른 레지던트 마스코트 구경 등)

캘린더·메일은 M1의 네비게이션에 **비활성 탭(“곧 제공”)** 으로 자리만 잡아두어, 뼈대가 확장을 전제로 설계됨을 보장한다.

---

## 2. 디자인 시스템

레퍼런스(Orbis.Nft 다크 스페이스 + 리퀴드글래스, TOONHUB 피규어 캐러셀)의 **미학·인터랙션만** 차용해 ResQ에 입힌다. 레퍼런스 페이지를 그대로 복제하지 않는다.

### 색상 (Tailwind config)
| 토큰 | 값 | 용도 |
|---|---|---|
| `bg` (배경) | `#010828` | 앱 전역 딥 네이비 |
| `cream` | `#EFF4FF` | 모든 본문 텍스트 |
| `neon` | `#6FFF00` | 커시브 강조 텍스트·언더라인 바·포인트 |
| action gradient | `#b724ff → #7c3aed` | 원형 액션 버튼(논문 열기 등) |

### 폰트 (Google Fonts)
- **Anton** → 모든 헤딩·네비 (Tailwind alias `font-grotesk`). 13–16px 네비, 32–90px 헤딩. 전부 uppercase.
- **Condiment** (커시브) → neon 강조/오버레이 텍스트 (`font-condiment`). normal-case.
- **시스템 monospace** (`font-mono`) → 본문/설명 문단.
- 로드: `index.html` 에 `https://fonts.googleapis.com/css2?family=Anton&family=Condiment&display=swap`.

### 공통 CSS 효과
- **`.liquid-glass`**: 반투명 + `backdrop-filter: blur(4px)` + inset 하이라이트 + `::before` 그라디언트 테두리. 네비·카드·소셜 버튼·오버레이 바에 사용. (레퍼런스 CSS 그대로 채택)
- **텍스처 오버레이**: 전체 화면 고정(z-50, pointer-events-none), `mix-blend-mode: lighten`, opacity 0.6.
- 아이콘: `lucide-react` (Mail, Twitter, Github, ArrowLeft, ArrowRight, Upload 등).

### 가독성 원칙 (중요)
매일 쓰는 업무 툴이므로:
- **비디오 배경은 감성 파트에만** — 히어로, 마스코트 존, 주간요약 CTA.
- **실제로 읽는 영역(논문 리스트/상세, 향후 캘린더)은 솔리드 `#010828` 배경 + liquid-glass 카드** 로 가독성 확보. (레퍼런스 Section 3가 이미 솔리드인 패턴을 계승)

### 에셋 정책
레퍼런스의 CloudFront 비디오·Figma 이미지 URL은 **개발 중 자리표시자**로만 사용한다. 실제 배포 전 자체 비디오/마스코트 캐릭터로 교체한다. (사용자 보유 캐릭터 생성물 활용 가능)

---

## 3. 화면 구조 (스크롤 랜딩형 대시보드, `/` 홈)

### Section 1 — 히어로 (풀뷰포트, 비디오 배경)
- 상단 헤더: 좌측 `ResQ` 로고(Anton, uppercase), 중앙 liquid-glass 네비.
  - 네비 항목: **홈 · 논문 · 캘린더(곧) · 메일(곧) · 설정**. hover 시 `text-neon`.
- 히어로 헤딩(Anton, 40–90px 반응형): 인사 + 사용자 정보.
  - 예: `2년차 · 홍길동` / `○○대학교병원 내과` (스크린샷의 `상병 군돌이` 대응)
- 큰 **D-day 카운트다운**: 수련 종료(전문의 시험/수료)까지 남은 일수 + 진행률 바.
  - `수련 시작일 ~ 종료일` 기준 % 진행 (군돌이 앱의 전역 진행률 대응).
- Condiment neon 오버레이 강조(예: `resident life`), 살짝 회전 + `mix-blend-exclusion`.
- 소셜 아이콘 3개(Mail/Twitter/Github) — 데스크탑 우상단 세로 스택, 모바일 헤딩 하단 중앙.

### Section 2 — 마스코트 존 (TOONHUB 캐러셀 감성)
- 무대 중앙에 **내 마스코트** 확대 배치, 뒤에 **고스트 텍스트**(마스코트 이름 또는 `LEVEL 3`).
- 배경색은 마스코트 단계별 톤으로 650ms 전환(cubic-bezier), 좌우 화살표로 **성장 단계/의상 프리뷰** 순환.
- 하단: 마스코트 상태 패널(레벨, 경험치 바, 다음 진화까지).
- **마스코트 육성 규칙(M1)**: 행동 → 경험치(XP).
  - 로그인(1일 1회), 논문 카드 열람/분석, (향후) 일정 추가 등으로 XP 획득.
  - XP 누적 → 레벨업 → 정해진 임계치에서 **진화 단계** 변경(외형 교체).
  - M1은 3단계 정도의 단순 성장 곡선으로 시작(수치는 설정 파일로 분리).

### Section 3 — 논문 컬렉션 (솔리드 배경)
- 헤딩(Anton) + Condiment neon 강조: 예 `이번 주 · Papers`.
- 우측 액션: `새 논문 불러오기`(수동 새로고침) + neon 언더라인 바.
- **카드 그리드**: 데스크탑 3열 / 태블릿 2열 / 모바일 1열, liquid-glass 카드(rounded-[32px]).
  - 카드 내용: 제목, 저널/연도, 출처 배지(PubMed | 업로드), **RELEVANCE SCORE**(내 전공 관련도, AI 산정 0–10).
  - 우하단 원형 보라 그라디언트 버튼(→) → **AI 분석 드로어/모달** 열기.
    - 드로어 내용: 초록 **한국어 요약 · 해석 · 핵심 breakdown**(방법/결과/임상적 의의), 원문 링크.
    - 분석은 첫 열람 시 생성 후 캐시.
  - 레퍼런스의 "RARITY SCORE" 오버레이 바 → "RELEVANCE SCORE" 로 대응.
- **PDF 드롭 카드**: 학회 학술지 PDF 업로드 → 텍스트 추출 → Claude 분석 → 동일한 카드/드로어로 편입.

### Section 4 — 주간 요약 CTA (비디오 배경)
- 우측 정렬 동기부여 문구(Anton) + Condiment neon 소제목(예: `keep going`).
- 이번 주 요약(읽은 논문 수, 획득 XP, D-day) + 소셜/링크(좌하단 세로 liquid-glass 스택).

---

## 4. 아키텍처

### 구성
```
[React SPA (Vite)]  ──►  [Backend API / Edge Functions]  ──►  [PubMed E-utilities]
      │                          │                        └►  [Claude API] (키는 서버측 전용)
      │                          └►  [Cloud DB + Auth]
      └──────── Google 로그인 ────────┘
```

- **프론트엔드**: React + TS SPA. 위 4개 섹션 컴포넌트 + 논문 분석 드로어 + 마스코트 캐러셀.
- **인증**: Google 로그인 단일화. 향후 Calendar/Gmail 연동 시 동일 OAuth 재활용.
- **백엔드/DB**: **Supabase 권장**(Google Auth + Postgres + Edge Functions + Cron 일체형).
  - 대안: Node/Express + 별도 DB. 단, M1의 “서버가 알아서 주간 수집” 목표엔 Supabase가 마찰이 적음.
- **보안 원칙**: **Claude API 키·PubMed 호출은 반드시 서버측(Edge Function)** 에서만. 프론트에 키를 절대 노출하지 않는다.
- **분석 엔진 추상화**: `AnalysisEngine` 인터페이스(요약/해석/관련도 점수) 뒤에 Claude 구현을 둔다 → 추후 교체·비교 용이.

### 논문 파이프라인
1. **키워드 매핑**: 사용자 전공 → 검색 키워드 세트(설정 파일/DB).
2. **수집**: PubMed E-utilities `esearch` → `efetch` 로 최신 N건(초록 포함) 수집.
3. **관련도 점수**: Claude 가 각 초록을 전공/관심사 기준 0–10 채점.
4. **분석 생성**: 카드 열람 시(온디맨드) Claude 한국어 요약·해석·breakdown 생성 후 DB 캐시.
5. **PDF 업로드**: 텍스트 추출 → 3·4 동일 처리 → 카드로 편입.
- M1 수집 트리거: **수동 “새 논문 불러오기”** 기본 + (여유 시) 주간 Cron. 완전 자동 주간 리포트는 로드맵.

### 데이터 모델(초안)
- `users`: id(google), 병원, 전공, 연차, 닉네임, 수련시작일, 수련종료일, xp, mascot_level, mascot_stage.
- `papers`: id, user_id(또는 specialty), source(pubmed|upload), title, journal, year, url, abstract, relevance_score, ai_analysis(json/text, nullable), created_at.
- `xp_events`(선택): id, user_id, type(login|read_paper|…), amount, created_at.

### 에러 처리
- PubMed/네트워크 실패 → 카드 영역에 재시도 UI, 기존 캐시 유지.
- Claude 실패/타임아웃 → 드로어에 “분석 실패, 재시도” 표시, 점수는 있으면 유지.
- PDF 텍스트 추출 실패(스캔본 등) → 사용자에게 알림(“텍스트가 없는 PDF일 수 있음”), M1은 OCR 미포함(로드맵).
- 로그인 세션 만료 → 재로그인 유도, 로컬 상태 보존.

---

## 5. 테스트 전략
- **유닛**: PubMed 응답 파싱, 관련도/분석 결과의 스키마 검증, XP·레벨 계산 로직, PDF 텍스트 추출.
- **엔진 모킹**: `AnalysisEngine` 인터페이스를 목으로 대체해 UI/파이프라인 테스트(실 API 비용 없이).
- **컴포넌트**: 각 섹션 렌더, 마스코트 캐러셀 role 전환(center/left/right/back), 논문 카드/드로어 상호작용.
- **반응형**: sm/md/lg 브레이크포인트에서 레이아웃 확인.

---

## 6. M1 내부 빌드 순서(권장)
1. 프로젝트 스캐폴드(Vite+TS+Tailwind), 디자인 시스템(색·폰트·liquid-glass·텍스처).
2. Google 로그인 + DB + 사용자 온보딩(병원/전공/연차/닉네임/수련기간 입력).
3. 히어로 섹션(D-day·진행률) + 네비(캘린더·메일은 “곧” 비활성 탭).
4. 마스코트 존(캐러셀·XP·레벨) — 자리표시 캐릭터.
5. 논문 파이프라인(백엔드): PubMed 수집 + 관련도 점수 + 분석 캐시.
6. 논문 컬렉션 UI + 분석 드로어 + PDF 업로드.
7. 주간 요약 CTA + 마무리 폴리시.

각 단계는 독립 인터페이스로 분리해, 이해·테스트·교체가 쉽도록 한다.
