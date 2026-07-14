// All XP event types. Only `daily_login` is emitted this slice; the rest are
// reserved for future feature slices (papers, calendar) and must not fire yet.
export type XpEventType = 'daily_login' | 'read_paper' | 'schedule_done' | 'weekly_academic'

export const XP_AMOUNTS: Record<XpEventType, number> = {
  daily_login: 10,
  read_paper: 20,
  schedule_done: 8,
  weekly_academic: 30,
}
