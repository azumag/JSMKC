'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Github } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">JSMKC 運営ログイン</CardTitle>
          <CardDescription>
            Japan Super Mario Kart Championship 運営管理画面
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn('github', { callbackUrl: '/tournaments' })}
            className="w-full"
            size="lg"
          >
            <Github className="mr-2 h-5 w-5" />
            GitHubでログイン
          </Button>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            jsmkc-orgのメンバーのみログインできます
          </p>
        </CardContent>
      </Card>
    </div>
  )
}