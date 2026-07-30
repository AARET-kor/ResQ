const NETWORK_PATTERN = /failed to fetch|network|load failed|fetch failed|connection|timeout/i

export function requestErrorMessage(error: unknown, fallback: string): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return `오프라인 상태입니다. 연결을 확인한 뒤 다시 시도해주세요. (${fallback})`
  }
  const detail = error instanceof Error ? error.message : String(error ?? '')
  if (error instanceof TypeError || NETWORK_PATTERN.test(detail)) {
    return `네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요. (${fallback})`
  }
  return fallback
}
