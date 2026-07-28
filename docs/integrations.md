# ResQ 일정·할 일 연동

## 지원 범위

- Google Calendar·Tasks: 서버 OAuth, 자동 토큰 갱신, 선택 목록별 증분
  양방향 동기화
- Outlook Calendar·Microsoft To Do: 서버 OAuth와 증분 양방향 동기화
- Todoist: 프로젝트 선택, Sync API 기반 증분 양방향 동기화
- ICS: 파일 가져오기, 읽기 전용 HTTPS 피드 구독, ResQ 읽기용 피드
- CalDAV: 캘린더·VTODO 목록 탐색과 목록별 읽기 전용/양방향 모드
- iOS 앱: EventKit Calendar·Reminders
- Android 앱: Calendar Provider. 삼성 Reminder는 Microsoft To Do 경로 사용

연동 화면은 계정 연결, 목록 탐색, 목록·방향 선택, 첫 동기화의 네 단계로
진행한다. 목록 탐색 요청은 외부 데이터 목록만 저장하며 일정·할 일을
가져오지 않는다. 사용자가 목록과 읽기 전용·양방향 모드를 확인한 뒤
첫 동기화를 실행해야 실제 데이터가 반영된다.

외부 일정의 메모·본문은 기본적으로 복사하지 않는다. 제목, 시작/종료,
위치와 할 일의 제목·마감일·완료 여부만 동기화한다.

통합 타임라인은 ResQ와 모든 외부 출처를 한 화면에 합치고 출처별 색상,
중복 표시, 원본 앱 링크를 제공한다. 중복으로 판정된 항목은 삭제하지 않고
대표 항목에 출처를 함께 표시한다.

## 공통 서버 설정

Access/refresh token 및 CalDAV 앱 비밀번호는
`integration_credentials`에 암호화해 저장한다. 이 테이블은
`anon`, `authenticated` 역할에서 차단되며 Edge Function service role만
접근한다.

```sh
supabase secrets set \
  INTEGRATION_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

OAuth callback:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/integration-oauth/callback
```

`integration-oauth`는 callback을 받아야 하므로 `--no-verify-jwt`로
배포한다. 시작·설정·해제 요청은 함수 안에서 Supabase bearer token을
검증한다. Callback은 10분 만료·1회용 state를 사용하며 Google과
Microsoft에는 PKCE도 적용한다. 모바일 완료 주소는
`com.resq.medical://integration/callback`이다.

## Google Calendar·Tasks 설정

Gmail 로그인과 Calendar·Tasks 연결은 분리한다. Google Cloud에서 Web
OAuth client를 만들고 위 Edge Function callback을 등록한 뒤 Calendar API와
Tasks API를 활성화한다.

- `calendar.events`
- `calendar.calendarlist.readonly`
- `tasks`

```sh
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID=<client-id> \
  GOOGLE_OAUTH_CLIENT_SECRET=<client-secret>
```

`access_type=offline`과 refresh token을 사용하고, Calendar는 각 source의
`syncToken`, Tasks는 변경 시각 cursor로 증분 동기화한다. 만료되거나
무효화된 Calendar sync token은 제한된 전체 동기화로 복구한다.

Gmail AI 일정 추출은 기존 Supabase Auth Google 연결의 `gmail.readonly`를
별도로 사용한다. 모바일 로그인 callback
`com.resq.medical://auth/callback`은 Supabase Auth Redirect URLs allow
list에 등록한다.

## Microsoft Outlook·To Do 설정

Microsoft Entra에서 Web application을 만들고 다음 redirect URI를 등록한다.

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/integration-oauth/callback
```

Delegated permission:

- `User.Read`
- `Calendars.ReadWrite`
- `Tasks.ReadWrite`
- `offline_access`

Edge Function secret:

```sh
supabase secrets set \
  MICROSOFT_CLIENT_ID=<application-client-id> \
  MICROSOFT_CLIENT_SECRET=<client-secret>
```

Calendar는 Graph delta link, To Do는 delta 지원 여부에 따라 delta 또는
목록 갱신을 사용한다. 삼성 Reminder에서 Microsoft To Do 동기화를 켜면
동일한 To Do 목록이 ResQ에 들어온다.

## Todoist 설정

Todoist App Management Console에 OAuth 앱과 공통 callback을 등록한다.

```sh
supabase secrets set \
  TODOIST_CLIENT_ID=<client-id> \
  TODOIST_CLIENT_SECRET=<client-secret>
```

권한은 `data:read_write`이며 회전되는 refresh token을 매 갱신마다 교체
저장한다. Todoist 명칭은 호환 기능 설명에만 사용하며 공식 제휴 서비스가
아니다.

## ICS·CalDAV

- `.ics` 파일은 브라우저에서 5MB까지 가져오며 외부 원본과 후속
  동기화하지 않는다.
- HTTPS ICS 구독은 서버에서 최대 5MB, 20초, 제한된 redirect 규칙으로
  읽고 원본에 쓰지 않는다.
- CalDAV는 공개 HTTPS endpoint와 앱 비밀번호만 허용한다. 목록별로
  읽기 전용 또는 양방향을 선택할 수 있다.
- 주소와 CalDAV 비밀번호는 브라우저 저장소에 남기지 않는다.

## Apple Calendar·Reminders와 기기 캘린더

Sign in with Apple은 인증만 제공하며 일정 권한을 제공하지 않는다. ResQ
iOS 앱은 로그인 후 EventKit의 Calendar와 Reminders 권한을 각각 요청해야
한다. Android 앱은 Calendar Provider 권한을 사용한다.

Apple 로그인을 노출하려면 Apple App ID(`com.resq.medical`), Services ID,
signing key를 만든 후 Supabase Auth의 Apple provider를 활성화하고 빌드
환경에 `VITE_APPLE_AUTH_ENABLED=true`를 설정한다. Apple 로그인을 사용해도
Calendar·Reminders 시스템 권한은 로그인 후 별도로 요청된다.

모바일 브리지는 웹과 동일한 `integration_sources`, `events`, `todos`
외부 식별자 모델을 사용한다. `provider`는 각각 `apple`, `android`이고,
기기에서 사용자가 선택한 캘린더·목록만 동기화한다.

## 충돌 규칙

- 아직 외부 출처가 없는 ResQ 항목은 사용자가 먼저 실행한 쓰기 가능한
  provider의 기본 목록으로 보낸다.
- 외부에서 가져온 항목은 `provider + source id + external id`로 식별한다.
- ResQ에서 변경된 외부 항목은 `pending`으로 표시하고 다음 동기화에서
  원본 provider에 먼저 반영한 뒤 다시 가져온다.
- 외부 항목 삭제는 tombstone으로 남겨 원본 삭제가 성공한 뒤 로컬에서
  제거한다.
- 반복 일정은 동기화 기간 안의 개별 인스턴스로 펼쳐 가져오며, 원본
  URL·etag/version과 UTC 기준 시각을 함께 추적한다.
- 같은 연결의 동기화는 DB 잠금으로 중복 실행을 차단한다.
- 첫 동기화가 완료된 연결은 연동 화면을 다시 열었을 때 마지막 성공 후
  15분 이상 지났으면 한 번 자동 갱신한다. 연결 직후에는 자동으로 데이터를
  가져오지 않아 사용자가 목록과 동기화 방향을 먼저 검토할 수 있다.

## 배포 순서

```sh
supabase db push
supabase functions deploy integration-oauth --no-verify-jwt --use-api
supabase functions deploy integration-sync --use-api
npm run build
npx cap sync
```

OAuth provider secret이 없는 기능은 런타임 capability 응답에서 꺼지고
UI에는 `관리자 설정 대기`로 표시된다. 빌드 환경 feature flag는 없다.
