# ResQ 모바일 앱 배포 가이드

ResQ는 Capacitor 8 기반의 iOS·Android 앱 프로젝트를 함께 제공합니다. 웹 화면을 그대로 패키징하면서, 기기 캘린더처럼 브라우저에서 접근할 수 없는 기능만 Swift·Java 플러그인으로 연결합니다.

## 현재 구현된 기능

- 앱 식별자: `com.resq.medical`
- 웹 로그인과 네이티브 OAuth 딥링크 복귀
- iOS Calendar·Reminders 읽기·생성·수정·삭제
- Android 시스템 캘린더 읽기·생성·수정·삭제
- 메모 붙여넣기·사진 선택·카메라 촬영을 통한 AI 일정·할 일 후보 생성
- 선택한 목록별 읽기 전용·양방향 동기화
- Google Calendar·Tasks, Outlook·Microsoft To Do, Todoist 서버 OAuth
- ICS 가져오기·구독 및 CalDAV

Android에는 표준 Reminders 저장소가 없습니다. 삼성 Reminder는 Samsung 앱에서 Microsoft To Do 동기화를 켠 뒤 ResQ의 Microsoft 연결을 사용하는 경로를 지원합니다.

## 개발 환경 확인

```bash
npm run mobile:doctor
```

iOS Simulator 빌드에는 macOS와 Xcode 전체 버전이 필요합니다. 실제 iPhone 설치·TestFlight 배포에는 별도로 Apple Developer 팀과 서명이 필요합니다. Android 빌드에는 Android Studio, Android SDK 36, JDK 21이 필요합니다.

## 공통 동기화

웹 코드를 변경한 뒤 네이티브 프로젝트에 반영합니다.

```bash
npm run mobile:sync
```

Supabase Dashboard의 **Authentication → URL Configuration**에는 모바일
복귀 주소 `com.resq.medical://auth/callback`을 반드시 허용합니다. 이 주소가
빠지면 Supabase가 기본 Site URL로 폴백하여 로그인 후 앱으로 돌아오지
않습니다.

## iPhone 내부 테스트

1. Apple Developer에서 `com.resq.medical` App ID를 생성합니다.
2. Xcode에서 `ios/App/App.xcodeproj`를 열고 Signing & Capabilities의 Team을 선택합니다.
3. 실제 iPhone에서 Calendar·Reminders 권한과 OAuth 복귀를 확인합니다.
4. Archive를 만든 뒤 App Store Connect의 TestFlight에 업로드합니다.
5. 개인정보 처리방침 URL과 Calendar·Reminders 사용 목적을 심사 정보에 기재합니다.

앱은 iOS 17 이상에서 `requestFullAccessToEvents`와 `requestFullAccessToReminders`를 사용하고, iOS 16에서는 기존 권한 API로 안전하게 폴백합니다.

서명 없이 Simulator용 앱을 만드는 명령은 다음과 같습니다.

```bash
npm run mobile:sync
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath release/ios-simulator \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

이 산출물은 Simulator에서만 실행할 수 있으며 실제 iPhone에는 설치할 수 없습니다.

## Android 내부 테스트

1. Android Studio에서 `android` 프로젝트를 엽니다.
2. 실제 기기에서 Calendar 권한과 OAuth 복귀를 확인합니다.
3. 업로드 키를 안전한 위치에 만들고 비밀번호를 저장소에 커밋하지 않습니다.
4. Signed Android App Bundle을 생성합니다.
5. Play Console 내부 테스트 트랙에 AAB를 업로드합니다.

디버그 APK만 필요하면 JDK 준비 후 다음 명령을 사용할 수 있습니다.

```bash
npm run mobile:android:debug
```

debug APK는 Android의 자동 생성 디버그 키로 서명되므로 개발자 계정 없이 Emulator와 실제 기기에 설치할 수 있습니다. Play Console에 올릴 AAB는 별도의 업로드 키가 필요합니다.

## GitHub Actions 산출물

`.github/workflows/app-artifacts.yml`은 `main`·`feat/home-sections` 푸시,
수동 실행 또는 `v*` 태그 푸시 때 다음 파일을 생성합니다.

- Android debug APK
- 서명 없는 iOS Simulator `.app` ZIP
- macOS·Windows Electron 설치 파일

워크플로를 실행하기 전에 저장소 Actions secrets에 다음 값을 등록합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Apple 로그인을 노출하려면 Actions variable `VITE_APPLE_AUTH_ENABLED=true`도 설정합니다.

## 출시 전 확인

- Google·Microsoft·Todoist 운영 OAuth 앱과 리디렉션 URL
- Apple Developer·Google Play 개발자 계정
- 앱 아이콘, 스플래시, 스토어 스크린샷과 설명
- 개인정보 처리방침, 계정·데이터 삭제 경로
- Apple Privacy Nutrition Label과 Google Play Data safety
- 캘린더·미리 알림 권한 거부·재허용 흐름
- 오프라인, 토큰 만료, 중복 일정, 반복 일정, 시간대 변경 테스트
- 환자정보를 입력하지 않도록 하는 고지와 업무 보조 도구 면책
