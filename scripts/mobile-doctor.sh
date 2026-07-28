#!/usr/bin/env bash

set -u

failures=0

check_command() {
  local command_name="$1"
  local install_hint="$2"
  shift 2
  if command -v "$command_name" >/dev/null 2>&1 && "$@" >/dev/null 2>&1; then
    printf "✓ %s\n" "$command_name"
  else
    printf "✗ %s — %s\n" "$command_name" "$install_hint"
    failures=$((failures + 1))
  fi
}

printf "ResQ mobile release readiness\n\n"
check_command node "Node.js를 설치하세요." node --version
check_command npx "npm 의존성을 설치하세요." npx --version
check_command java "Android Studio의 JDK 17을 활성화하세요." java -version
check_command xcodebuild "Mac App Store에서 Xcode 전체 버전을 설치하고 xcode-select로 활성화하세요." xcodebuild -version

if [ -f "ios/App/App.xcodeproj/project.pbxproj" ]; then
  printf "✓ iOS project\n"
else
  printf "✗ iOS project\n"
  failures=$((failures + 1))
fi

if [ -x "android/gradlew" ]; then
  printf "✓ Android project\n"
else
  printf "✗ Android project\n"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  printf "\n%d개 준비 항목이 남았습니다.\n" "$failures"
  exit 1
fi

printf "\n로컬 빌드 도구가 준비되었습니다.\n"
