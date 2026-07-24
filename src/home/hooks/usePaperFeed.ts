import { useEffect, useRef, useState } from 'react'
import { searchEuropePmc } from '../../lib/europepmc'
import { fetchOpenAlexTrending } from '../../lib/paperDiscovery'
import { dedupePapers, rankPapers } from '../../lib/paperQuality'
import type { Paper } from '../../lib/pubmed'
import { parseInterests, upsertProfile, type Profile } from '../../lib/profile'
import { journalsFor } from '../../lib/sources'
import { sortPapers, type PaperSortKey, type SortDir } from '../../lib/sortPapers'
import { supabase } from '../../lib/supabase'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'

interface UsePaperFeedOptions {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}

export function usePaperFeed({ profile, onProfileChange }: UsePaperFeedOptions) {
  const { notify } = useNotifications()
  const [shelfData, setShelfData] = useState<{ label: string; papers: Paper[] }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<7 | 30>(30)
  const [selectedJournals, setSelectedJournals] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<PaperSortKey>('recommended')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [localInterests, setLocalInterests] = useState<string[]>(() =>
    parseInterests(profile.interests),
  )
  const [specialtyNotice, setSpecialtyNotice] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const journals = journalsFor(profile.specialty)
  const feed = [...new Set([profile.specialty ?? '', ...localInterests].filter(Boolean))]

  const toggleJournal = (id: string) => {
    setSelectedJournals((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const refreshFor = async (specialties: string[]) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const primarySpecialty = specialties[0] || profile.specialty || '의학'
      const journalTitles = journals
        .filter((journal) => journal.indexed !== false && selectedJournals.includes(journal.id))
        .map((journal) => journal.ta)
      const curatedJournalTitles = journals
        .filter((journal) => journal.indexed !== false)
        .map((journal) => journal.ta)
      const prepare = (papers: Paper[]) => dedupePapers(rankPapers(papers)).slice(0, 12)
      const searches: Promise<Paper[]>[] = [
        searchEuropePmc(primarySpecialty, fetch, {
          days,
          pageSize: 40,
          sort: 'date',
          mode: 'latest',
        }),
        searchEuropePmc(primarySpecialty, fetch, {
          days: 365,
          tas: curatedJournalTitles,
          requireSpecialty: true,
          pageSize: 24,
          sort: 'date',
          mode: 'latest',
        }),
        searchEuropePmc(primarySpecialty, fetch, {
          days: 1_825,
          pageSize: 18,
          sort: 'cited',
          mode: 'evidence',
        }),
        searchEuropePmc(primarySpecialty, fetch, {
          days: 365,
          pageSize: 18,
          sort: 'cited',
          mode: 'trending',
        }),
        searchEuropePmc(primarySpecialty, fetch, {
          days: 730,
          pageSize: 18,
          sort: 'date',
          mode: 'open-access',
        }),
      ]
      const extraSpecialties = specialties.slice(1)
      for (const specialty of extraSpecialties) {
        searches.push(searchEuropePmc(specialty, fetch, {
          days,
          pageSize: 12,
          sort: 'date',
          mode: 'latest',
        }))
      }
      if (journalTitles.length > 0) {
        searches.push(searchEuropePmc(primarySpecialty, fetch, {
          days: 365,
          tas: journalTitles,
          requireSpecialty: true,
          pageSize: 18,
          sort: 'date',
          mode: 'latest',
        }))
      }

      const settled = await Promise.allSettled(searches)
      const fulfilled = settled.filter(
        (result): result is PromiseFulfilledResult<Paper[]> => result.status === 'fulfilled',
      )
      if (fulfilled.length === 0) {
        const firstFailure = settled.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )
        throw firstFailure?.reason ?? new Error('paper sources unavailable')
      }

      const papersAt = (index: number): Paper[] => {
        const result = settled[index]
        return result?.status === 'fulfilled' ? result.value : []
      }

      let openAlexTrending: Paper[] = []
      try {
        openAlexTrending = await fetchOpenAlexTrending(supabase, primarySpecialty, 365)
      } catch (discoveryError) {
        // OpenAlex is an optional enrichment source. Europe PMC remains the
        // authoritative fallback when the Edge Function/key is not deployed.
        console.warn('OpenAlex discovery unavailable', discoveryError)
      }

      const nextShelves: { label: string; papers: Paper[] }[] = [
        {
          label: `${primarySpecialty} · ResQ 선별 추천`,
          papers: prepare(papersAt(0)),
        },
        {
          label: '주요 학회지·학술지 신착',
          papers: prepare(papersAt(1)),
        },
        {
          label: '근거 수준 높은 연구 · 최근 5년',
          papers: prepare(papersAt(2)),
        },
        {
          label: '지금 주목받는 논문 · 최근 1년',
          papers: prepare([...papersAt(3), ...openAlexTrending]),
        },
        {
          label: '합법적으로 원문 읽기 · Open Access',
          papers: prepare(papersAt(4)),
        },
      ]

      extraSpecialties.forEach((specialty, index) => {
        nextShelves.push({
          label: `${specialty} 추천 신착`,
          papers: prepare(papersAt(5 + index)),
        })
      })
      if (journalTitles.length > 0) {
        nextShelves.push({
          label: '내가 고른 저널 · 최근 1년',
          papers: prepare(papersAt(5 + extraSpecialties.length)),
        })
      }

      const koreanJournalTitles = journals
        .filter((journal) => journal.kr && journal.indexed !== false)
        .map((journal) => journal.ta)
      if (koreanJournalTitles.length > 0) {
        let papers: Paper[] = []
        try {
          papers = prepare(await searchEuropePmc(primarySpecialty, fetch, {
            tas: koreanJournalTitles,
            days: 365,
            pageSize: 10,
            sort: 'date',
          }))
        } catch (koreanFeedError) {
          console.error(koreanFeedError)
          notify({
            message: requestErrorMessage(koreanFeedError, '한국 학회지 선반 일부를 불러오지 못했습니다.'),
            tone: 'warning',
          })
        }
        nextShelves.push({ label: '한국 학회지 · 학회 공식 발행지', papers })
      }
      setShelfData(nextShelves)
    } catch (refreshError) {
      console.error(refreshError)
      const failure = requestErrorMessage(refreshError, '논문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      setError(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void refreshFor(specialties) } },
      })
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const refresh = () => refreshFor(feed)

  useEffect(() => {
    if (shelfData.length > 0) refreshFor(feed)
    // The re-query intentionally follows sort controls only. Other filters are
    // applied when the user explicitly refreshes the feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir])

  const toggleSpecialty = async (name: string) => {
    const next = localInterests.includes(name)
      ? localInterests.filter((item) => item !== name)
      : [...localInterests, name]
    setLocalInterests(next)
    setSpecialtyNotice(null)
    try {
      onProfileChange(await upsertProfile(supabase, {
        id: profile.id,
        interests: next.join(','),
      }))
    } catch (saveError) {
      console.error(saveError)
      setSpecialtyNotice(
        '관심 전공 저장 실패 — 이번 세션에만 적용됩니다 (Supabase에 0008 마이그레이션 적용 필요)',
      )
      notify({
        message: requestErrorMessage(saveError, '관심 전공을 저장하지 못해 이번 세션에만 적용했습니다.'),
        tone: 'warning',
      })
    }
    if (shelfData.length > 0) {
      await refreshFor([...new Set([profile.specialty ?? '', ...next].filter(Boolean))])
    }
  }

  return {
    shelves: shelfData.map((shelf) => ({
      label: shelf.label,
      papers: sortPapers(shelf.papers, sortKey, sortDir),
    })),
    loading,
    error,
    journals,
    selectedJournals,
    days,
    sortKey,
    sortDir,
    feed,
    specialtyNotice,
    setDays,
    setSortKey,
    setSortDir,
    toggleJournal,
    toggleSpecialty,
    refresh,
  }
}
