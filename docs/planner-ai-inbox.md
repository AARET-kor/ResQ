# Planner AI Inbox 운영 가이드

ResQ의 일정·할 일 페이지는 하나의 워크스테이션에서 수동 추가와 AI
인박스를 함께 제공합니다. 사용자는 메모, 붙여넣은 이미지, 업로드한
스크린샷 또는 모바일 카메라 사진을 분석한 뒤 후보를 수정하고 선택
저장합니다.

## 데이터 처리

- 텍스트는 클라이언트와 Edge Function에서 환자명, 등록번호, 생년월일,
  주민번호, 전화번호, 이메일 패턴을 마스킹합니다.
- 이미지는 분석 요청 동안에만 외부 AI로 전달됩니다.
- 원문 이미지, 메모 및 추출 후보 JSON은 ResQ DB에 저장하지 않습니다.
- DB에는 요청 SHA-256, 입력 크기, 상태, 토큰 사용량과 오류 코드만
  기록합니다.
- 응답은 `Cache-Control: private, no-store`로 반환합니다.
- AI가 만든 항목은 기본적으로 ResQ에 저장합니다. 외부 캘린더·할 일
  목록으로 바로 전파하지 않습니다.

이미지 안의 개인정보는 전송 전에 완전하게 자동 마스킹할 수 없으므로
UI에서 환자 식별정보를 입력하지 말라는 경고를 항상 표시합니다.

## 보호 한도

- 메모: 100,000자
- 사진: 25MB
- 사진 형식: JPEG, PNG, GIF, WebP
- 결과: 일정 30개와 할 일 30개
- AI 요청 제한 시간: 55초
- 동일 요청: 실행 중 10분 잠금, 완료 직후 2분 재호출 억제

클라이언트와 서버가 MIME뿐 아니라 실제 파일 magic byte도 검사합니다.

## 배포 순서

```bash
supabase db push --linked
supabase functions deploy extract-planner-items --use-api
supabase functions deploy extract-todos --use-api
```

`extract-todos`는 이전 앱을 위한 호환 엔드포인트이며 모든 처리를
`extract-planner-items`로 전달합니다. 따라서 기존 클라이언트도 같은
인증, 크기 제한, 중복 잠금과 사용량 기록을 적용받습니다.

프로덕션에는 기존 논문·메일 분석과 같은 `ANTHROPIC_API_KEY` secret이
필요합니다.

## 장애 확인

1. `ai_usage_events`에서 `operation = 'planner_extract'`의 최근 상태와
   `error_code`를 확인합니다.
2. 409 응답이면 같은 입력이 이미 처리 중이거나 방금 완료된 상태입니다.
3. 413/415 응답이면 입력 크기 또는 실제 이미지 형식을 확인합니다.
4. 503 응답이면 migration 0017 적용 여부를 확인합니다.
5. AI 호출 실패 후보는 UI에서 제거하지 않고 남겨 재시도할 수 있게
   유지합니다.
