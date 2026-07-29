import type { SupabaseClient } from '@supabase/supabase-js'
import type { Paper } from './pubmed'

async function edgeFunctionMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error.trim()) return body.error
    } catch {
      // Fall through to the stable client-facing fallback.
    }
  }
  return fallback
}

export interface PaperAnalysis {
  id: string
  user_id: string
  pmid: string
  title: string
  journal: string | null
  year: string | null
  abstract: string | null
  analysis: string
  created_at: string
  kind?: string
  has_fulltext?: boolean
  source?: string | null
}

export async function getAnalysis(
  client: SupabaseClient,
  userId: string,
  pmid: string,
): Promise<PaperAnalysis | null> {
  const { data, error } = await client
    .from('paper_analyses')
    .select('*')
    .eq('user_id', userId)
    .eq('pmid', pmid)
    .maybeSingle()
  if (error) throw error
  return (data as PaperAnalysis) ?? null
}

/** Ask the Claude-backed edge function for a Korean breakdown. */
export async function requestAnalysis(
  client: SupabaseClient,
  paper: Paper,
  specialty: string | null,
): Promise<string> {
  const { data, error } = await client.functions.invoke('analyze-paper', {
    body: { title: paper.title, abstract: paper.abstract, specialty },
  })
  if (error || !data?.analysis) {
    throw new Error(await edgeFunctionMessage(
      error,
      '분석 서버 오류 — ANTHROPIC_API_KEY 시크릿 미설정 또는 함수 미배포일 수 있습니다.',
    ))
  }
  return data.analysis as string
}

/** Generate source-grounded research questions and feasible study designs. */
export async function requestPaperIdeation(
  client: SupabaseClient,
  paper: Paper,
  specialty: string | null,
): Promise<string> {
  const { data, error } = await client.functions.invoke('analyze-paper', {
    body: {
      mode: 'ideation',
      title: paper.title,
      abstract: paper.abstract,
      specialty,
    },
  })
  if (error || !data?.analysis) {
    throw new Error(await edgeFunctionMessage(
      error,
      '아이디에이션 서버 오류 — AI 함수 설정을 확인해주세요.',
    ))
  }
  return data.analysis as string
}

export async function saveAnalysis(
  client: SupabaseClient,
  userId: string,
  paper: Paper,
  analysis: string,
  meta: { kind?: 'abstract' | 'report'; hasFulltext?: boolean; source?: string | null } = {},
): Promise<PaperAnalysis> {
  const { data, error } = await client
    .from('paper_analyses')
    .upsert({
      user_id: userId,
      pmid: paper.pmid,
      title: paper.title,
      journal: paper.journal,
      year: paper.year,
      abstract: paper.abstract,
      analysis,
      kind: meta.kind ?? 'abstract',
      has_fulltext: meta.hasFulltext ?? false,
      source: meta.source ?? null,
    }, { onConflict: 'user_id,pmid' })
    .select()
    .single()
  if (error) throw error
  return data as PaperAnalysis
}

export async function requestReport(
  client: SupabaseClient,
  paper: Paper,
  specialty: string | null,
  input: { fulltext?: string; pdfBase64?: string; pdfMediaType?: string },
): Promise<string> {
  const { data, error } = await client.functions.invoke('analyze-paper', {
    body: {
      mode: 'report',
      title: paper.title,
      abstract: paper.abstract,
      specialty,
      ...input,
    },
  })
  if (error || !data?.analysis) {
    throw new Error(await edgeFunctionMessage(
      error,
      '분석 서버 오류 — ANTHROPIC_API_KEY 시크릿 미설정 또는 함수 미배포일 수 있습니다.',
    ))
  }
  return data.analysis as string
}

export async function listMyReports(client: SupabaseClient, userId: string): Promise<PaperAnalysis[]> {
  const { data, error } = await client
    .from('paper_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as PaperAnalysis[]) ?? []
}
