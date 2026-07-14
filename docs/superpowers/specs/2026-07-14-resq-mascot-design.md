# ResQ — Mascot Zone 설계 문서 (Milestone 1, slice 2)

> 전공의의 수련 여정을 함께 자라는 **랜덤 동물 의인화 마스코트**. 대시보드의 감정적 앵커.
> 작성일: 2026-07-14 · 전제: Foundation slice(인증/온보딩/히어로/D-day) 완료 및 live 검증됨.

이 문서는 **설계(spec)** 다. 승인 후 별도의 TDD 구현 계획(writing-plans)으로 넘어간다. **아직 구현하지 않는다.**

---

## 1. Product Purpose

전공의의 성취는 대부분 **눈에 안 보인다** — 읽은 논문, 버틴 당직, 지킨 일정. Mascot Zone은 이 보이지 않는 진행을 **매일 보고 싶은 귀여운 동반자**로 바꾼다.

- **랜덤 동물 의인화 캐릭터**(소·곰·알파카·개구리·햄스터·펭귄 등)를 첫 로그인 때 "부화"시켜 개인화·호기심을 준다. (첨부 밈 감성: 가운·청진기·명찰 두른 동물 의국원)
- 활동(로그인, 논문 열람, 일정 완료, 주간 학술활동)으로 **XP→레벨업**.
- 수련 진행(연차/D-day)에 따라 **진화 단계**가 올라간다.
- 톤: **귀엽지만 유치하지 않게** — 세련된 라인아트, premium한 색감, 절제된 모션. "키우는 맛"이 나는 retention 장치.

성공 지표(정성): "마스코트 보려고 앱 연다"는 느낌.

## 2. User Stories

1. 첫 로그인 시 **랜덤 동물 마스코트를 부화**받아 "뭐 나왔지?" 하는 재미를 느낀다.
2. 대시보드 중앙에서 내 마스코트의 **레벨·기분·단계**를 한눈에 본다.
3. 로그인/논문열람/일정완료 시 **XP가 오르고 레벨업**하는 걸 즉시 본다.
4. 연차가 오를수록(수련 진행) 마스코트가 **인턴 → 주니어 → 시니어 → 치프**처럼 **진화**한다.
5. 며칠 안 들어오면 마스코트가 **지쳐 보여** 다시 오게 만든다.
6. 좌우 화살표로 **진화 단계(및 향후 수집한 종)**를 캐러셀로 넘겨본다.
7. *(향후 slice)* 마일스톤에서 **새 동물 종을 리롤/수집**한다.

## 3. Data Model

기존 `profiles`에 이미 `xp`, `mascot_level`, `mascot_stage`가 있다. 다음을 추가:

**`profiles` 확장 (마이그레이션 `0002_mascot.sql`)**
- `mascot_species text` — 부화 시 로스터에서 랜덤 배정, 이후 고정.
- `mascot_name text null` — 사용자 지정 이름(선택).
- `last_active_on date null` — 일일 로그인/기분 계산용.
- `streak_days integer not null default 0`.

**`xp_events` 테이블 (원장 ledger, RLS)**
```
id uuid pk, user_id uuid → auth.users, type text, amount integer,
created_at timestamptz default now()
```
- 원장 방식: 재계산·부정방지·향후 통계에 유리. RLS는 `auth.uid() = user_id` (profiles와 동일 패턴).
- `type` enum(코드 상수): `daily_login` | `read_paper` | `schedule_done` | `weekly_academic`.
  - **이번 slice는 `daily_login`만 실제로 발생**시킨다. 나머지 타입은 상수로 정의만 하고, 각 기능 slice(논문/캘린더)가 나중에 emit. (→ §10 오버빌드 금지)

**로스터·레벨곡선은 DB가 아니라 코드 config**(`src/mascot/roster.ts`, `src/mascot/xp.ts`)에 둔다 → 튜닝·테스트 용이.

## 4. UI Structure

히어로 대시보드 안의 **Mascot Zone 섹션**(TOONHUB 캐러셀 감성):
- **중앙 무대**: 마스코트 크게. 뒤에 **고스트 텍스트**(레벨 또는 종 이름).
- **배경 틴트**: 종/기분에 따라 부드럽게 전환(650ms cubic-bezier, foundation 모션과 통일).
- **좌우 화살표**: 진화 단계 프리뷰 순환(이번 slice) → 향후 수집한 종 순환.
- **상태 패널**(liquid-glass): 레벨 · **다음 레벨까지 XP 바** · 단계 라벨 · 기분 아이콘 · 연속출석(streak).
- 아이덴티티: neon 포인트, mono 라벨, Anton 수치 — 기존 디자인 시스템 재사용. CSS 트랜지션만(추가 라이브러리 없음).

**에셋**: 실제 동물 아트가 아직 없음 → **placeholder 이미지 + 레지스트리(config)** 로 처리해 교체가 한 줄이 되게. 아트 미확보가 개발을 막지 않게 한다.

## 5. XP / Level Rules

두 축을 분리해 우아하게 매핑:
- **진화 단계(stage)** = **수련 진행(연차/D-day)** 에 종속. 시니어는 초반부터 마스코트가 성숙해 보인다.
- **레벨(level)** = **XP** 에 종속. 활동이 레벨 바를 채운다.

규칙:
- `level = f(totalXp)` — config 곡선. 시작 제안: 레벨 n 진입에 누적 `100 * n * (n+1) / 2` (완만한 증가). 튜닝 가능.
- `daily_login`: 하루 1회 `+10`, **당일 재로그인은 0**(idempotent, `last_active_on`로 판정). 연속 출석 보너스는 이번 slice 선택(간단히 streak만 저장, 보너스는 config로 on/off).
- 향후: `read_paper +20`, `schedule_done +8`, `weekly_academic +30` (값 config).

## 6. Mascot States

- **종(species)**: 로스터에서 랜덤 배정(예: cow, bear, alpaca, frog, hamster, penguin). 각 종은 단계·기분별 아트를 가진다(초기엔 placeholder).
- **진화 단계(4단계, 수련 진행 기준)**: `INTERN`(신입) → `JUNIOR` → `SENIOR` → `CHIEF`. 경계는 연차/진행률 config.
- **기분(mood, 최근 활동 기준)**: `ENERGIZED`(오늘 활동) / `NORMAL` / `TIRED`(2–3일 무활동) / `ASLEEP`(장기 무활동). `last_active_on`·streak로 파생.
- (선택/향후) 레벨 마일스톤 **소품 해금**(가운/청진기/명찰). 이번 slice는 상태 표시까지, 소품 경제는 뒤로.

## 7. Tests

순수 로직(TDD 핵심):
- `xp.ts`: 레벨 임계값 경계, 누적 XP→레벨, 곡선 단조성.
- `daily_login` idempotency: 같은 날 두 번 → 1회만 적립. streak 증가/리셋.
- stage 파생: 연차/진행률 → 단계 경계값.
- mood 파생: `last_active_on` 간격 → 기분.
- 랜덤 종 배정: **RNG 주입**으로 결정론적 테스트, 로스터에서 정확히 1종, 재부화 안 함(이미 있으면 유지).

데이터 접근(모킹된 client):
- `recordXpEvent`, `getMascotState`, `assignSpeciesIfMissing`.

컴포넌트:
- MascotZone 렌더(레벨/단계/기분/XP바 반영), 캐러셀 단계 순환, 레이아웃 시프트 없음.
- 통합: 앱 로드 시 `daily_login` 발생 → XP바 갱신.

## 8. Acceptance Criteria

- 신규 유저는 첫 대시보드에서 **랜덤 종 부화**, 새로고침 후에도 동일 종 유지.
- 마스코트가 **연차에 맞는 단계**, **XP에 맞는 레벨/바**, **활동에 맞는 기분**을 정확히 표시.
- **일일 로그인 XP 1회만** 적립(당일 재접속 0).
- 캐러셀 단계 전환이 650ms로 부드럽고 레이아웃 흔들림 없음.
- 기존 foundation의 인증/온보딩/게이팅 의미를 **바꾸지 않음**.
- 유닛+컴포넌트 테스트 green, `tsc`/build clean.

## 9. Implementation Slices (승인 후 TDD 태스크로 전개)

a. **DB**: `0002_mascot.sql`(profiles 확장 + `xp_events` + RLS). 로스터/XP config 상수.
b. **Logic(순수, TDD)**: `xp.ts`(레벨곡선), `stage.ts`(연차→단계), `mood.ts`(활동→기분), `species.ts`(주입 RNG 랜덤 배정).
c. **Data access**: `mascot.ts`(`recordXpEvent`/`getMascotState`/`assignSpeciesIfMissing`), 모킹 테스트.
d. **UI 정적**: `MascotZone` 컴포넌트(상태별 렌더) + 히어로에 통합.
e. **캐러셀 + 전환** 모션.
f. **배선**: 앱 로드 시 `daily_login` emit + 부화 트리거 + XP바 라이브 갱신.
g. **placeholder 에셋 레지스트리 + 폴리시**.

## 10. Risks / Do NOT Overbuild

- ❌ **없는 기능용 XP 소스 만들지 말 것** — 논문/캘린더 이벤트는 타입만 정의, 이번엔 `daily_login`만 emit.
- ❌ **가챠/수집 경제 전체를 지금 만들지 말 것** — 단일 랜덤 종 + 진화면 충분. 수집/리롤/소품 경제는 별도 slice.
- ⚠️ **에셋 리스크** — 실제 동물 아트 미확보. placeholder + 레지스트리로 교체를 사소하게. 아트로 개발 막지 않기.
- ⚠️ **유치함 회피** — premium 라인아트, 절제된 모션.
- ⚠️ **부정방지 간단히** — XP는 원장 + 서버측 일일 판정(당일 1회) + RLS. 과설계 금지.
- ⚠️ **레벨곡선 config화** — 하드코딩 말고 튜너블.
- ⚠️ **추가 라이브러리 금지** — CSS 트랜지션만(foundation 규칙 유지), 이미지 preload.

---

## 확정이 필요한 설계 선택 (승인 시 함께 답해주세요)

1. **종 개념**: "랜덤으로 나온다" = **유저당 랜덤 1종 부화(고정)** 로 시작 — 맞나요? (여러 종 수집/리롤은 뒤 slice)
2. **진화 축**: 단계=수련 진행, 레벨=XP — 이 2축 분리 방식 OK?
3. **이번 slice XP 소스**: `daily_login`만 실제 적립(나머지는 뒤 slice에서 배선) — OK?
