# ResQ 일정·할 일 연동

## 현재 웹 연동

- Google Calendar: 선택한 캘린더의 최근 90일~향후 1년 일정 가져오기,
  ResQ 변경사항 보내기, 수정·삭제 반영
- Google Tasks: 선택한 목록의 할 일 가져오기, 완료 상태·삭제·새 할 일 반영
- Outlook Calendar: Microsoft Graph를 통한 선택 캘린더 양방향 동기화
- Microsoft To Do: Microsoft Graph를 통한 목록·완료 상태 양방향 동기화
- ICS: Apple·Galaxy 캘린더에서 구독할 수 있는 읽기용 피드

외부 일정의 메모·본문은 기본적으로 복사하지 않는다. 제목, 시작/종료,
위치와 할 일의 제목·마감일·완료 여부만 동기화한다.

## Google 설정

Supabase Auth의 Google provider가 활성화되어 있어야 한다. OAuth consent
screen과 Google Cloud 프로젝트에서 Calendar API 및 Tasks API를 활성화하고
다음 scope를 허용한다.

- `calendar.events`
- `calendar.calendarlist.readonly`
- `tasks`
- `gmail.readonly`

기존 사용자는 변경된 scope를 받기 위해 앱의 `권한 다시 연결`을 한 번
실행해야 한다.

모바일 OAuth callback `com.resq.medical://auth/callback`도 Supabase Auth의
Redirect URLs allow list에 등록한다.

## Microsoft 설정

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

두 secret과 redirect URI 설정을 마친 뒤 웹 빌드 환경에
`VITE_MICROSOFT_INTEGRATION_ENABLED=true`를 지정한다. 설정 전에는
사용자에게 실패하는 연결 버튼 대신 `관리자 설정 대기` 상태가 표시된다.

`integration-oauth`는 provider callback을 받아야 하므로 `--no-verify-jwt`로
배포한다. 시작 요청은 함수 내부에서 Supabase bearer token을 검증하며,
callback은 10분 만료·1회용 OAuth state와 PKCE를 검증한다. Access/refresh
token은 RLS와 권한으로 일반 사용자에게 완전히 차단된
`integration_credentials`에 저장하고 Edge Function service role만 사용한다.
모바일에서는 OAuth 완료 후 `com.resq.medical://integration/callback`으로
돌아와 동일한 연결 결과를 앱에 전달한다.

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
