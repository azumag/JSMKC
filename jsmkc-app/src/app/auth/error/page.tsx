'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function ErrorPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const error = searchParams.error

  const getErrorMessage = (error: string | undefined) => {
    switch (error) {
      case 'OAuthSignin':
        return 'OAuthサインインでエラーが発生しました。'
      case 'OAuthCallback':
        return 'OAuthコールバックでエラーが発生しました。'
      case 'OAuthCreateAccount':
        return 'アカウント作成でエラーが発生しました。'
      case 'EmailCreateAccount':
        return 'メールアドレスでのアカウント作成でエラーが発生しました。'
      case 'Callback':
        return 'コールバックでエラーが発生しました。'
      case 'OAuthAccountNotLinked':
        return 'このメールアドレスは既に他のプロバイダーにリンクされています。'
      case 'SessionRequired':
        return 'この操作にはセッションが必要です。'
      case 'Default':
        return '認証でエラーが発生しました。'
      default:
        return '認証で不明なエラーが発生しました。'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl flex items-center justify-center text-destructive">
            <AlertCircle className="mr-2 h-6 w-6" />
            認証エラー
          </CardTitle>
          <CardDescription>
            {getErrorMessage(error)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground text-center">
            {error === 'OAuthAccountNotLinked' && (
              <p>
                jsmdc-orgのメンバーであることを確認してください。
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/auth/signin">
                再度ログイン
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                トップページに戻る
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}