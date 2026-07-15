import type { SupabaseClient } from '@supabase/supabase-js'
import type { Paper } from './pubmed'

export interface PaperAnalysis {
  id: string
  user_id: string
  pmid: string
  title: string
  journal: string | null
  year: string | null
  abstract: string | null
  analysis: string
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
    throw new Error('분석 서버에 연결할 수 없습니다. (analyze-paper 함수 배포 필요)')
  }
  return data.analysis as string
}

export async function saveAnalysis(
  client: SupabaseClient,
  userId: string,
  paper: Paper,
  analysis: string,
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
    }, { onConflict: 'user_id,pmid' })
    .select()
    .single()
  if (error) throw error
  return data as PaperAnalysis
}
