/**
 * profile/page.tsx - User Profile Page
 *
 * This page displays the authenticated user's profile and allows
 * them to link their account to a player profile. It provides:
 * 1. User information display (name, email, role)
 * 2. Player association management (link/claim a player profile)
 *
 * Player association workflow:
 * - When a user first visits their profile, they see a dropdown of
 *   all unlinked player profiles (players without a userId).
 * - The user selects their player profile and clicks "Claim Profile"
 *   to create the association via POST /api/players/:id/link.
 * - Once linked, the page shows a confirmation with the player's
 *   nickname and name, and the user can submit scores for that player.
 *
 * This page is protected by the middleware (proxy.ts), which requires
 * authentication for all /profile routes. Unauthenticated users are
 * redirected to the sign-in page.
 *
 * Note: Ideally there would be a dedicated /api/user/me/player endpoint
 * to fetch the current user's linked player directly. Currently, the
 * page fetches all players and filters client-side by userId match,
 * which works but is less efficient for large player lists.
 */
"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { CardSkeleton } from "@/components/ui/loading-skeleton"

/**
 * Player data model for profile association.
 * Includes the optional userId field which indicates
 * whether the player has been claimed by a user account.
 */
interface Player {
    id: string
    name: string
    nickname: string
    /** If set, this player is already linked to a user account */
    userId?: string | null
}

/**
 * ProfilePage - User profile display and player association management.
 *
 * Fetches the player list on mount and checks if the current user
 * already has a linked player. If not, shows a selection dropdown
 * with all unclaimed player profiles.
 */
export default function ProfilePage() {
    const { data: session } = useSession()
    const t = useTranslations('profile')
    const tc = useTranslations('common')

    /* Loading state for initial data fetch */
    const [loading, setLoading] = useState(true)

    /* Full player list from the API */
    const [players, setPlayers] = useState<Player[]>([])

    /* The player profile linked to the current user (null if not linked) */
    const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null)

    /* ID of the player selected in the dropdown for linking */
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("")

    /* Loading state for the link/claim operation */
    const [isLinking, setIsLinking] = useState(false)

    /**
     * Fetches the player list and checks for an existing association.
     * Only runs when a valid session exists (user is authenticated).
     *
     * Current approach: fetches all players and filters by userId.
     * Future improvement: use a dedicated /api/user/me/player endpoint
     * for a single query instead of fetching the entire player list.
     */
    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch('/api/players?limit=100')
                if (res.ok) {
                    const json = await res.json()
                    const data: Player[] = json.data ?? json
                    setPlayers(data)

                    /*
                     * Check if the current user already has a linked player.
                     * This filters the player list by matching the session
                     * user ID against the player's userId field.
                     */
                    const myPlayer = data.find(p => p.userId === session?.user?.id)
                    if (myPlayer) {
                        setLinkedPlayer(myPlayer)
                    }
                }
            } catch {
                /* Silently handle fetch errors - the user will see an empty state */
            } finally {
                setLoading(false)
            }
        }

        if (session?.user) {
            fetchData()
        }
    }, [session])

    /**
     * Handles the player profile claim/link action.
     * Sends a POST request to /api/players/:id/link to associate
     * the selected player profile with the current user account.
     * On success, updates the local state and shows a toast notification.
     */
    const handleLink = async () => {
        if (!selectedPlayerId) return
        setIsLinking(true)

        try {
            const res = await fetch(`/api/players/${selectedPlayerId}/link`, {
                method: 'POST'
            })

            if (res.ok) {
                toast.success(t('linkedSuccess'))
                /* Update local state to show the linked player immediately */
                const player = players.find(p => p.id === selectedPlayerId)
                if (player) setLinkedPlayer(player)
            } else {
                const error = await res.json()
                toast.error(error.error || t('failedToLink'))
            }
        } catch {
            toast.error(t('failedToLink'))
        } finally {
            setIsLinking(false)
        }
    }

    /* Loading skeleton with placeholder cards while data is fetched */
    if (loading) {
        return (
            <div className="container max-w-2xl py-10 space-y-6">
                <div className="space-y-3">
                    <div className="h-9 w-24 bg-muted animate-pulse rounded" />
                </div>
                <CardSkeleton />
                <CardSkeleton />
            </div>
        )
    }

    return (
        <div className="container max-w-2xl py-10">
            <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

            {/* User Information Card - displays session data */}
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>{t('userInfo')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-[100px_1fr] gap-4">
                        <div className="font-medium">{t('name')}</div>
                        <div>{session?.user?.name}</div>
                        <div className="font-medium">{t('email')}</div>
                        <div>{session?.user?.email}</div>
                        <div className="font-medium">{t('role')}</div>
                        <div className="capitalize">{session?.user?.role || "member"}</div>
                    </div>
                </CardContent>
            </Card>

            {/*
             * Player Association Card
             * Two states:
             * 1. Linked: Shows green success banner with player info
             * 2. Unlinked: Shows dropdown of available (unclaimed) players
             *    with a "Claim Profile" button
             */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('playerAssociation')}</CardTitle>
                    <CardDescription>
                        {t('linkDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {linkedPlayer ? (
                        /* Success state: player is linked to this account */
                        <div className="bg-green-50 p-4 rounded-md border border-green-200">
                            <p className="font-medium text-green-800">
                                {t('encodedAs', { nickname: linkedPlayer.nickname, name: linkedPlayer.name })}
                            </p>
                            <p className="text-sm text-green-600 mt-1">
                                {t('canSubmitScores')}
                            </p>
                        </div>
                    ) : (
                        /*
                         * Unlinked state: show a player selection dropdown.
                         * Only players without a userId (unclaimed) are shown
                         * to prevent two accounts from claiming the same player.
                         */
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="player">{t('selectPlayerProfile')}</Label>
                                <Select onValueChange={setSelectedPlayerId} value={selectedPlayerId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('selectPlayerPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {players.filter(p => !p.userId).map(player => (
                                            <SelectItem key={player.id} value={player.id}>
                                                {player.nickname} ({player.name})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </CardContent>
                {/* Claim button shown only when no player is linked yet */}
                {!linkedPlayer && (
                    <CardFooter>
                        <Button onClick={handleLink} disabled={!selectedPlayerId || isLinking}>
                            {isLinking ? t('linking') : t('claimProfile')}
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    )
}
