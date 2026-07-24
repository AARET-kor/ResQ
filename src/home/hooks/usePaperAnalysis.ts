import { useEffect, useRef, useState } from 'react'
import { fetchEpmcFullText } from '../../lib/europepmc'
import {
  getAnalysis,
  listMyReports,
  requestAnalysis,
  requestPaperIdeation,
  requestReport,
  saveAnalysis,
  type PaperAnalysis,
} from '../../lib/papers'
import { fetchRelatedPapers } from '../../lib/paperDiscovery'
import { fetchPmcFullText, type Paper } from '../../lib/pubmed'
import type { Profile } from '../../lib/profile'
import { supabase } from '../../lib/supabase'
import { recordXpEvent } from '../../mascot/mascot'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'
import { pdfFileToBase64, validatePdfUpload } from '../../lib/pdfUpload'

type AnalysisKind = 'abstract' | 'report'

interface UsePaperAnalysisOptions {
  profile: Profile
  onProfileChange: (profile: Profile) => void
}

function analysisKindOf(report: PaperAnalysis): AnalysisKind {
  return report.kind === 'report' ? 'report' : 'abstract'
}

export function usePaperAnalysis({ profile, onProfileChange }: UsePaperAnalysisOptions) {
  const { notify } = useNotifications()
  const [reports, setReports] = useState<PaperAnalysis[]>([])
  const [selected, setSelected] = useState<Paper | null>(null)
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relatedPapers, setRelatedPapers] = useState<Paper[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const [ideation, setIdeation] = useState<string | null>(null)
  const [ideationLoading, setIdeationLoading] = useState(false)
  const [ideationError, setIdeationError] = useState<string | null>(null)
  const analysisInFlight = useRef(false)
  const ideationInFlight = useRef(false)
  const relatedRequestId = useRef(0)
  const userId = profile.id

  useEffect(() => {
    let active = true
    listMyReports(supabase, userId)
      .then((items) => { if (active) setReports(items) })
      .catch((loadError) => {
        console.error(loadError)
        if (active) notify({
          message: requestErrorMessage(loadError, '저장된 논문 리포트를 불러오지 못했습니다.'),
          tone: 'error',
        })
      })
    return () => { active = false }
  }, [notify, userId])

  const refreshReports = () => {
    listMyReports(supabase, userId)
      .then(setReports)
      .catch((loadError) => {
        console.error(loadError)
        notify({
          message: requestErrorMessage(loadError, '저장된 논문 리포트를 새로고침하지 못했습니다.'),
          tone: 'warning',
        })
      })
  }

  const resetForPaper = (paper: Paper) => {
    relatedRequestId.current += 1
    setSelected(paper)
    setSelectedTitle(paper.title)
    setAnalysis(null)
    setAnalysisKind(null)
    setError(null)
    setRelatedPapers([])
    setRelatedLoading(false)
    setRelatedError(null)
    setIdeation(null)
    setIdeationError(null)
  }

  const loadRelated = async (paper: Paper) => {
    if (paper.pmid.startsWith('pdf-')) return
    const requestId = ++relatedRequestId.current
    setRelatedLoading(true)
    setRelatedError(null)
    try {
      const papers = await fetchRelatedPapers(supabase, paper)
      if (requestId === relatedRequestId.current) setRelatedPapers(papers.slice(0, 12))
    } catch (loadError) {
      console.warn('Related paper discovery unavailable', loadError)
      if (requestId === relatedRequestId.current) {
        setRelatedError('연관 논문을 불러오지 못했습니다. OpenAlex 함수 설정을 확인해주세요.')
      }
    } finally {
      if (requestId === relatedRequestId.current) setRelatedLoading(false)
    }
  }

  /**
   * Opens the paper for READING first — abstract, related papers and any cached
   * analysis. No AI call and no XP here: analysis is opt-in via analyze()
   * (the AnalyzeQ button), so the user can skim the abstract before spending
   * an analysis run.
   */
  const open = async (paper: Paper) => {
    resetForPaper(paper)
    void loadRelated(paper)
    try {
      const cached = await getAnalysis(supabase, userId, paper.pmid)
      if (cached) {
        setAnalysis(cached.analysis)
        setAnalysisKind(analysisKindOf(cached))
      }
    } catch (cacheError) {
      // A cache miss/failure is non-fatal — the reader still sees the abstract.
      console.warn('cached analysis lookup failed', cacheError)
    }
  }

  /** Runs the AI breakdown for the currently open paper (AnalyzeQ). */
  const analyze = async () => {
    const paper = selected
    if (!paper || analysisInFlight.current) return
    analysisInFlight.current = true
    setError(null)
    setLoading(true)
    try {
      const cached = await getAnalysis(supabase, userId, paper.pmid)
      if (cached) {
        setAnalysis(cached.analysis)
        setAnalysisKind(analysisKindOf(cached))
        return
      }

      let text: string
      let kind: AnalysisKind = 'abstract'
      let hasFulltext = false
      if (paper.pmcid) {
        const fulltext =
          (await fetchEpmcFullText(paper.pmcid)) ||
          (await fetchPmcFullText(paper.pmcid).catch(() => ''))
        if (fulltext) {
          text = await requestReport(supabase, paper, profile.specialty, { fulltext })
          kind = 'report'
          hasFulltext = true
        } else {
          if (!paper.abstract) {
            setError('초록이 없는 논문은 분석할 수 없습니다.')
            return
          }
          text = await requestAnalysis(supabase, paper, profile.specialty)
        }
      } else {
        if (!paper.abstract) {
          setError('초록이 없는 논문은 분석할 수 없습니다. 원문 링크를 확인해주세요.')
          return
        }
        text = await requestAnalysis(supabase, paper, profile.specialty)
      }

      await saveAnalysis(supabase, userId, paper, text, {
        kind,
        hasFulltext,
        source: paper.journal || null,
      })
      setAnalysis(text)
      setAnalysisKind(kind)
      onProfileChange(await recordXpEvent(supabase, profile, 'read_paper', paper.pmid))
      refreshReports()
    } catch (analysisError) {
      console.error(analysisError)
      const failure = requestErrorMessage(
        analysisError,
        analysisError instanceof Error ? analysisError.message : '분석에 실패했습니다.',
      )
      setError(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void analyze() } },
      })
    } finally {
      analysisInFlight.current = false
      setLoading(false)
    }
  }

  const uploadPdf = async (file: File) => {
    if (analysisInFlight.current) return
    const validationError = validatePdfUpload(file)
    if (validationError) {
      const failure = validationError
      setError(failure)
      notify({ message: failure, tone: 'error' })
      return
    }
    analysisInFlight.current = true
    const paper: Paper = {
      pmid: `pdf-${Date.now()}`,
      title: file.name.replace(/\.pdf$/i, ''),
      journal: 'PDF 업로드',
      year: '',
      abstract: '',
      url: '',
      pmcid: null,
    }
    resetForPaper(paper)
    setLoading(true)
    try {
      const text = await requestReport(supabase, paper, profile.specialty, {
        pdfBase64: await pdfFileToBase64(file),
        pdfMediaType: file.type,
      })
      await saveAnalysis(supabase, userId, paper, text, {
        kind: 'report',
        hasFulltext: true,
        source: 'pdf',
      })
      setAnalysis(text)
      setAnalysisKind('report')
      onProfileChange(await recordXpEvent(supabase, profile, 'read_paper', paper.pmid))
      refreshReports()
    } catch (analysisError) {
      console.error(analysisError)
      const failure = requestErrorMessage(
        analysisError,
        analysisError instanceof Error ? analysisError.message : 'PDF 분석에 실패했습니다.',
      )
      setError(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void uploadPdf(file) } },
      })
    } finally {
      analysisInFlight.current = false
      setLoading(false)
    }
  }

  const openReport = (report: PaperAnalysis) => {
    const paper: Paper = {
      pmid: report.pmid,
      title: report.title,
      journal: report.journal ?? '',
      year: report.year ?? '',
      abstract: report.abstract ?? '',
      url: report.pmid.startsWith('pdf-')
        ? ''
        : `https://pubmed.ncbi.nlm.nih.gov/${report.pmid}/`,
      pmcid: null,
    }
    setSelected(paper)
    setSelectedTitle(report.title)
    setAnalysis(report.analysis)
    setAnalysisKind(analysisKindOf(report))
    setError(null)
    setRelatedPapers([])
    setRelatedError(null)
    setIdeation(null)
    setIdeationError(null)
    void loadRelated(paper)
  }

  const generateIdeation = async () => {
    if (!selected || ideationInFlight.current) return
    if (!selected.abstract) {
      setIdeationError('연구 아이디에이션에는 최소한 논문 초록이 필요합니다.')
      return
    }
    ideationInFlight.current = true
    setIdeationLoading(true)
    setIdeationError(null)
    try {
      setIdeation(await requestPaperIdeation(supabase, selected, profile.specialty))
    } catch (ideationFailure) {
      console.error(ideationFailure)
      const failure = requestErrorMessage(
        ideationFailure,
        ideationFailure instanceof Error ? ideationFailure.message : '아이디에이션 생성에 실패했습니다.',
      )
      setIdeationError(failure)
      notify({
        message: failure,
        tone: 'error',
        action: { label: '재시도', onClick: () => { void generateIdeation() } },
      })
    } finally {
      ideationInFlight.current = false
      setIdeationLoading(false)
    }
  }

  const close = () => {
    relatedRequestId.current += 1
    setSelected(null)
    setSelectedTitle(null)
    setAnalysis(null)
    setAnalysisKind(null)
    setError(null)
    setRelatedPapers([])
    setRelatedLoading(false)
    setRelatedError(null)
    setIdeation(null)
    setIdeationLoading(false)
    setIdeationError(null)
  }

  return {
    reports,
    selected,
    selectedTitle,
    analysis,
    analysisKind,
    loading,
    error,
    relatedPapers,
    relatedLoading,
    relatedError,
    ideation,
    ideationLoading,
    ideationError,
    open,
    analyze,
    uploadPdf,
    openReport,
    generateIdeation,
    close,
  }
}
