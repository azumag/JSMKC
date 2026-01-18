import { useState, useEffect, useCallback } from 'react'

export function usePolling(url: string | null, interval: number = 5000) {
  const [data, setData] = useState<unknown>(null)
  const [error, setError] = useState<unknown>(null)
  const [lastFetch, setLastFetch] = useState(0)
  
  const fetchData = useCallback(async () => {
    if (!url) return
    
    try {
      // 前回のリクエストから500ms以上経過しない場合はスキップ
      const now = Date.now()
      if (now - lastFetch < 500) {
        return
      }
      
      setLastFetch(now)
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err)
      // エラー時は指数バックオフ
      setTimeout(() => fetchData(), interval * 2)
    }
  }, [url, lastFetch, interval])
  
  useEffect(() => {
    if (!url) return
    
    let intervalId: NodeJS.Timeout
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(intervalId)
      } else {
        fetchData() // 再表示時は即時取得
        intervalId = setInterval(fetchData, interval)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    intervalId = setInterval(fetchData, interval)
    
    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchData, interval, url])
  
  return { data, error, refetch: fetchData }
}