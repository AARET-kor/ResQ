import { useEffect, useState } from 'react'
import { useNotifications } from '../../feedback/notificationContext'
import { requestErrorMessage } from '../../feedback/requestError'
import {
  listIntegrationSources,
  type IntegrationSource,
} from '../../lib/integrations'
import { supabase } from '../../lib/supabase'

export function useIntegrationSources(userId: string) {
  const { notify } = useNotifications()
  const [sources, setSources] = useState<IntegrationSource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    listIntegrationSources(supabase, userId)
      .then((items) => {
        if (active) setSources(items)
      })
      .catch((error) => {
        console.error(error)
        if (active) notify({
          message: requestErrorMessage(error, '연동된 캘린더와 목록 정보를 불러오지 못했습니다.'),
          tone: 'warning',
        })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [notify, userId])

  return { sources, loading }
}
