import { useMemo, useState } from 'react'
import {
  BookOpenText,
  FileText,
  LibraryBig,
  RefreshCw,
  Search,
} from 'lucide-react'
import type { PaperAnalysis } from '../../lib/papers'

type ReportFilter = 'all' | 'report' | 'abstract'
type ReportSort = 'newest' | 'oldest' | 'title'

function savedDateLabel(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '저장일 미상'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function sourceLabel(report: PaperAnalysis): string {
  if (report.source?.toLowerCase() === 'pdf') return 'PDF 업로드'
  return report.source || report.journal || '출처 미상'
}

function reportKind(report: PaperAnalysis): 'report' | 'abstract' {
  return report.kind === 'report' ? 'report' : 'abstract'
}

export function PaperLibrary({
  reports,
  loading,
  error,
  onRetry,
  onOpenReport,
  onShowBreakdown,
}: {
  reports: PaperAnalysis[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenReport: (report: PaperAnalysis) => void
  onShowBreakdown: () => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ReportFilter>('all')
  const [sort, setSort] = useState<ReportSort>('newest')

  const visibleReports = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    return reports
      .filter((report) => filter === 'all' || reportKind(report) === filter)
      .filter((report) => {
        if (!normalizedQuery) return true
        return [
          report.title,
          report.journal ?? '',
          report.source ?? '',
        ].some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery))
      })
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title, 'ko-KR')
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        const safeATime = Number.isNaN(aTime) ? 0 : aTime
        const safeBTime = Number.isNaN(bTime) ? 0 : bTime
        return sort === 'newest' ? safeBTime - safeATime : safeATime - safeBTime
      })
  }, [filter, query, reports, sort])

  const reportCount = reports.filter((report) => reportKind(report) === 'report').length
  const abstractCount = reports.length - reportCount

  if (loading && reports.length === 0) {
    return (
      <div aria-label="내 Library 불러오는 중" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="min-h-[280px] animate-pulse rounded-[24px] border border-line bg-surface"
          />
        ))}
      </div>
    )
  }

  if (error && reports.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-line bg-surface p-8 text-center">
        <RefreshCw size={30} className="text-accent" aria-hidden="true" />
        <div>
          <h2 className="font-serif text-2xl font-black text-ink">Library를 불러오지 못했습니다</h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-bold text-accentInk transition hover:opacity-90"
        >
          다시 불러오기
        </button>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[28px] border border-line bg-surface p-8 text-center">
        <LibraryBig size={38} className="text-accent" aria-hidden="true" />
        <div>
          <h2 className="font-serif text-2xl font-black text-ink">첫 번째 리포트를 채워보세요</h2>
          <p className="mt-2 max-w-lg font-sans text-sm leading-relaxed text-muted">
            논문을 Breakdown하거나 PDF를 업로드하면 결과가 이곳에 자동으로 쌓입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowBreakdown}
          className="rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-bold text-accentInk transition hover:opacity-90"
        >
          Breakdown으로 이동
        </button>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="paper-library-heading">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">전체</p>
          <p className="mt-1 font-serif text-3xl font-black text-ink">{reports.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">풀 리포트</p>
          <p className="mt-1 font-serif text-3xl font-black text-ink">{reportCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-muted">초록 분석</p>
          <p className="mt-1 font-serif text-3xl font-black text-ink">{abstractCount}</p>
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="font-sans text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="font-sans text-sm font-bold text-accent underline"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[24px] border border-line bg-surface p-4 lg:flex-row lg:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
          <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="sr-only">Library 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 저널, 출처 검색"
            className="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label="리포트 종류">
          {([
            ['all', '전체'],
            ['report', '풀 리포트'],
            ['abstract', '초록 분석'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-4 py-2.5 font-sans text-xs font-bold transition ${
                filter === value
                  ? 'bg-accent text-accentInk'
                  : 'border border-line bg-canvas text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
          <span className="font-sans text-xs font-bold text-muted">정렬</span>
          <select
            aria-label="Library 정렬"
            value={sort}
            onChange={(event) => setSort(event.target.value as ReportSort)}
            className="bg-transparent font-sans text-sm text-ink outline-none"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="title">제목순</option>
          </select>
        </label>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="paper-library-heading" className="font-serif text-2xl font-black text-ink sm:text-3xl">
            내 리포트 서가
          </h2>
          <p className="mt-1 font-sans text-sm text-muted">
            {visibleReports.length}개의 리포트
          </p>
        </div>
        {loading && (
          <span className="font-sans text-xs font-semibold text-muted" role="status">
            새로고침 중…
          </span>
        )}
      </div>

      {visibleReports.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-line bg-surface p-8 text-center">
          <Search size={28} className="text-muted" aria-hidden="true" />
          <p className="font-sans text-sm font-semibold text-ink">조건에 맞는 리포트가 없습니다.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
            className="font-sans text-sm font-bold text-accent underline"
          >
            검색 조건 초기화
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleReports.map((report, index) => {
            const kind = reportKind(report)
            const KindIcon = kind === 'report' ? BookOpenText : FileText
            return (
              <article
                key={report.id}
                className="group relative min-h-[290px] overflow-hidden rounded-[24px] border border-line bg-surface transition duration-300 hover:-translate-y-1 hover:border-accent/45 hover:bg-surfaceRaised hover:shadow-xl"
              >
                <button
                  type="button"
                  aria-label={`${report.title} 열기`}
                  onClick={() => onOpenReport(report)}
                  className="flex h-full min-h-[290px] w-full flex-col p-5 text-left"
                >
                  <div className="mb-8 flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2 rounded-full bg-accent/10 px-2.5 py-1 font-sans text-xs font-bold text-accent">
                      <KindIcon size={14} aria-hidden="true" />
                      {kind === 'report' ? '풀 리포트' : '초록 분석'}
                    </span>
                    <span className="font-sans text-xs tabular-nums text-muted">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <p className="font-sans text-xs font-bold uppercase tracking-[0.12em] text-accent">
                    {sourceLabel(report)}
                  </p>
                  <h3 className="mt-3 line-clamp-4 font-serif text-xl font-black leading-snug text-ink">
                    {report.title}
                  </h3>

                  <div className="mt-auto border-t border-line pt-4">
                    <p className="line-clamp-1 font-sans text-xs text-muted">
                      {report.journal || '저널 정보 없음'}
                      {report.year && ` · ${report.year}`}
                    </p>
                    <p className="mt-2 font-sans text-xs font-semibold text-muted">
                      {savedDateLabel(report.created_at)} 저장
                    </p>
                  </div>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
