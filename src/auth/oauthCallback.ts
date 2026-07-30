export function isExpectedAuthCallback(
  value: string,
  expectedValue: string,
): boolean {
  try {
    const actual = new URL(value)
    const expected = new URL(expectedValue)
    return actual.protocol === expected.protocol
      && actual.hostname === expected.hostname
      && actual.pathname === expected.pathname
      && !actual.username
      && !actual.password
      && !actual.port
  } catch {
    return false
  }
}
