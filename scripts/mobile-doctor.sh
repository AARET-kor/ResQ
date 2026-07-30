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

check_java_21() {
  local java_version
  local java_major
  java_version="$(java -version 2>&1 | sed -n '1s/.*version "\([^"]*\)".*/\1/p')"
  java_major="${java_version%%.*}"
  if [ "$java_major" = "1" ]; then
    java_major="$(printf "%s" "$java_version" | cut -d. -f2)"
  fi
  if command -v java >/dev/null 2>&1 &&
     [ -n "$java_major" ] &&
     [ "$java_major" -ge 21 ] 2>/dev/null; then
    printf "✓ java %s\n" "$java_version"
  else
    printf "✗ java — Capacitor 8 Android 빌드에는 JDK 21 이상이 필요합니다.\n"
    failures=$((failures + 1))
  fi
}

check_android_sdk() {
  local sdk_path="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  if [ -z "$sdk_path" ]; then
    case "$(uname -s)" in
      Darwin) sdk_path="${HOME}/Library/Android/sdk" ;;
      *) sdk_path="${HOME}/Android/Sdk" ;;
    esac
  fi
  if [ -d "$sdk_path/platforms/android-36" ]; then
    printf "✓ Android SDK 36\n"
  else
    printf "✗ Android SDK 36 — Android Studio SDK Manager에서 API 36을 설치하세요.\n"
    failures=$((failures + 1))
  fi
}

printf "ResQ mobile release readiness\n\n"
check_command node "Node.js를 설치하세요." node --version
check_command npx "npm 의존성을 설치하세요." npx --version
check_java_21
check_android_sdk
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
