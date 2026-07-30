import type { SupabaseClient } from '@supabase/supabase-js'
import type { Paper } from './pubmed'
import { dedupePapers, rankPapers } from './paperQuality'

async function invoke(
  client: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Paper[]> {
  const { data, error } = await client.functions.invoke('paper-discovery', { body })
  if (error || !Array.isArray(data?.papers)) throw error ?? new Error('invalid discovery response')
  return rankPapers(data.papers as Paper[])
}

export async function fetchOpenAlexTrending(
  client: SupabaseClient,
  specialty: string,
  days = 365,
): Promise<Paper[]> {
  return invoke(client, { action: 'trending', specialty, days })
}

export async function fetchRelatedPapers(
  client: SupabaseClient,
  paper: Paper,
): Promise<Paper[]> {
  const papers = await invoke(client, {
    action: 'related',
    doi: paper.doi,
    pmid: paper.pmid,
    openAlexId: paper.openAlexId,
    title: paper.title,
  })
  return dedupePapers(papers).filter((candidate) => (
    candidate.doi?.toLowerCase() !== paper.doi?.toLowerCase() &&
    candidate.pmid !== paper.pmid
  ))
}
