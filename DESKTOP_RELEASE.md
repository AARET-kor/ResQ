# ResQ 데스크톱·PWA 배포 가이드

ResQ는 같은 React 빌드를 세 가지 방식으로 제공합니다.

- 일반 웹
- Chrome·Edge·Safari에서 설치하는 PWA
- macOS·Windows용 Electron 앱

Electron 앱은 웹 코드를 로컬에 번들링하지만 일정·할 일 데이터와 AI 기능에는 네트워크 연결이 필요합니다.

## PWA 설치

배포된 ResQ에 접속한 뒤 다음 방식으로 설치합니다.

- Chrome·Edge: 주소창의 설치 아이콘 또는 메뉴의 **앱 설치**
- macOS Safari: **파일 → Dock에 추가**
- iPhone·iPad Safari: 공유 메뉴의 **홈 화면에 추가**

앱 셸과 정적 자산은 오프라인 캐시에 저장됩니다. Supabase 데이터 요청은 캐시하지 않으므로 네트워크가 끊기면 오래된 의료 업무 데이터가 임의로 표시되지 않습니다.

## Electron 로컬 실행

```bash
npm run desktop:test
npm run desktop:start
```

`desktop:start`는 최신 웹 코드를 먼저 빌드한 뒤 Electron 창을 엽니다.

## 설치 파일 만들기

현재 운영체제용 서명 없는 설치 파일을 만듭니다.

```bash
npm run desktop:dist
```

결과는 `release/desktop`에 생성됩니다.

- macOS: `.dmg`, `.zip`
- Windows: NSIS 설치형 `.exe`, portable `.exe`
- Linux에서 실행할 경우: `.AppImage`

macOS 서명 없는 앱은 다른 Mac에서 Gatekeeper 경고가 표시될 수 있습니다. 외부 배포 전에는 Developer ID Application 서명과 notarization을 구성해야 합니다. Windows의 공개 배포도 코드 서명 인증서를 권장합니다.

## OAuth 딥링크

데스크톱 앱은 `resq://` 프로토콜을 등록합니다.

- 로그인: `resq://auth/callback`
- 외부 연동: `resq://integration/callback`

Electron은 단일 인스턴스로 동작하며, 앱이 꺼져 있거나 이미 실행 중인 경우 모두 딥링크를 기존 창에 전달합니다. Supabase Auth 허용 redirect URL에도 위 로그인 콜백을 추가해야 합니다.

Supabase Dashboard의 **Authentication → URL Configuration**은 다음과 같이 설정합니다.

- Site URL: `https://resq-medical-workspace.aret.chatgpt.site`
- Redirect URLs:
  - `https://resq-medical-workspace.aret.chatgpt.site/**`
  - `http://localhost:5173/**`
  - `http://127.0.0.1:5173/**`
  - `resq://auth/callback`
  - `com.resq.medical://auth/callback`

이 목록에 앱 콜백이 없으면 Supabase는 요청한 `redirectTo`를 사용하지 않고 Site URL로 되돌립니다. Site URL까지 `http://localhost:3000`으로 남아 있으면 로그인 완료 후 전혀 다른 로컬 웹 서비스가 열릴 수 있습니다.

## 보안 기본값

- 렌더러의 Node.js 접근 차단
- context isolation과 sandbox 활성화
- 외부 링크는 허용된 `https`, `http`, `mailto` URL만 기본 브라우저에서 열기
- `file:`, `javascript:` 등 로컬·실행 URL 차단
- 설치 앱 내부 콘텐츠는 `resq-app://app` 보안 프로토콜에서 제공

## 자동 산출물

GitHub의 **Build installable apps** workflow를 수동 실행하면 Android, iOS Simulator, macOS, Windows 파일을 한 번에 생성할 수 있습니다. 필요한 Actions secrets와 설치 범위는 [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)를 참고하세요.
