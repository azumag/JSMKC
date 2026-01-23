'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { createLogger } from '@/lib/logger'

export default function SignInPage() {
  const router = useRouter()
  const [playerForm, setPlayerForm] = useState({ nickname: '', password: '' })
  const [playerError, setPlayerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handlePlayerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPlayerError('')
    setIsLoading(true)

    try {
      const result = await signIn('player-credentials', {
        nickname: playerForm.nickname,
        password: playerForm.password,
        redirect: false,
      })

      if (result?.error) {
        setPlayerError('Invalid nickname or password')
      } else if (result?.ok) {
        router.push('/tournaments')
      }
    } catch (error) {
      const log = createLogger('signin-page')
      log.error('Player login error:', error instanceof Error ? { message: error.message, stack: error.stack } : { error })
      setPlayerError('An error occurred during login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">JSMKC ログイン</CardTitle>
          <CardDescription>
            Japan Super Mario Kart Championship
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="admin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin">管理者</TabsTrigger>
              <TabsTrigger value="player">プレイヤー</TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="space-y-4">
              <Button
                onClick={() => signIn('discord', { callbackUrl: '/tournaments' })}
                className="w-full bg-[#5865F2] hover:bg-[#4752C4]"
                size="lg"
              >
                <div className="flex items-center">
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 127 96" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a.05.05 0 0 0-.03.02C79.6 4.39 77.4 8.78 75.87 12.5a96.51 96.51 0 0 0-24.8 0C49.53 8.78 47.33 4.39 45.47.02a.05.05 0 0 0-.03-.02A105.01 105.01 0 0 0 19.3 8.07.05.05 0 0 0 19.24 8.1c-26.9 40.5-34.33 80-30.8 119.2a.05.05 0 0 0 .02.04C7.66 128.5 35.8 135 63.8 135a.05.05 0 0 0 .04-.02l3.4-4.2a92.2 92.2 0 0 1-13.8-6.1.05.05 0 0 1 .01-.09 63.63 63.63 0 0 0 2.4-1.2.05.05 0 0 1 .05 0c26.9 12.3 56 12.3 82.9 0a.05.05 0 0 1 .05 0 62.4 62.4 0 0 0 2.4 1.2.05.05 0 0 1 0 .09 91.54 91.54 0 0 1-13.8 6.1l3.4 4.2a.05.05 0 0 0 .04.02c28-135 56.1-135 55.44-7.66a.05.05 0 0 0 .02-.04c3.54-39.2-3.9-78.7-30.8-119.2a.05.05 0 0 0-.06-.03ZM42.45 92.6c-5.8 0-10.6-5.3-10.6-11.8s4.7-11.8 10.6-11.8c5.8.1 10.6 5.3 10.6 11.8s-4.8 11.8-10.6 11.8Zm42.1 0c-5.8 0-10.6-5.3-10.6-11.8s4.7-11.8 10.6-11.8c5.8.1 10.6 5.3 10.6 11.8s-4.8 11.8-10.6 11.8Z" />
                  </svg>
                  Discordでログイン
                </div>
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                管理者はDiscordログインを使用してください
              </p>
            </TabsContent>

            <TabsContent value="player" className="space-y-4">
              <form onSubmit={handlePlayerLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname">ニックネーム</Label>
                  <Input
                    id="nickname"
                    type="text"
                    placeholder="your_nickname"
                    value={playerForm.nickname}
                    onChange={(e) => setPlayerForm({ ...playerForm, nickname: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">パスワード</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={playerForm.password}
                    onChange={(e) => setPlayerForm({ ...playerForm, password: e.target.value })}
                    required
                  />
                </div>
                {playerError && (
                  <p className="text-sm text-red-600">{playerError}</p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'ログイン中...' : 'ログイン'}
                </Button>
              </form>
              <p className="text-sm text-center text-muted-foreground">
                プレイヤーはニックネームとパスワードでログインしてください
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}