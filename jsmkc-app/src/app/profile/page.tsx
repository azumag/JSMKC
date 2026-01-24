"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { CardSkeleton } from "@/components/ui/loading-skeleton"

interface Player {
    id: string
    name: string
    nickname: string
    userId?: string | null
}

export default function ProfilePage() {
    const { data: session } = useSession()
    const [loading, setLoading] = useState(true)
    const [players, setPlayers] = useState<Player[]>([])
    const [linkedPlayer, setLinkedPlayer] = useState<Player | null>(null)
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("")
    const [isLinking, setIsLinking] = useState(false)

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch('/api/players')
                if (res.ok) {
                    const data: Player[] = await res.json()
                    setPlayers(data)

                    // Find if user is already linked
                    // Note: In a real app, we should have an endpoint /api/user/me/player
                    // For now, we filter the list if we can identify the user, but since we distribute
                    // the list publicly, we probably need a dedicated endpoint to see "my" player.
                    // Or we check session.user.id against player.userId locally if exposed.
                    const myPlayer = data.find(p => p.userId === session?.user?.id)
                    if (myPlayer) {
                        setLinkedPlayer(myPlayer)
                    }
                }
            } catch (error) {
                
            } finally {
                setLoading(false)
            }
        }

        if (session?.user) {
            fetchData()
        }
    }, [session])

    const handleLink = async () => {
        if (!selectedPlayerId) return
        setIsLinking(true)

        try {
            const res = await fetch(`/api/players/${selectedPlayerId}/link`, {
                method: 'POST'
            })

            if (res.ok) {
                toast.success("Linked successfully!")
                const player = players.find(p => p.id === selectedPlayerId)
                if (player) setLinkedPlayer(player)
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to link")
            }
        } catch {
            toast.error("Failed to link")
        } finally {
            setIsLinking(false)
        }
    }

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
            <h1 className="text-3xl font-bold mb-8">Profile</h1>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>User Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-[100px_1fr] gap-4">
                        <div className="font-medium">Name:</div>
                        <div>{session?.user?.name}</div>
                        <div className="font-medium">Email:</div>
                        <div>{session?.user?.email}</div>
                        <div className="font-medium">Role:</div>
                        <div className="capitalize">{session?.user?.role || "member"}</div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Player Association</CardTitle>
                    <CardDescription>
                        Link your account to a player profile to submit scores.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {linkedPlayer ? (
                        <div className="bg-green-50 p-4 rounded-md border border-green-200">
                            <p className="font-medium text-green-800">
                                Encoded as: {linkedPlayer.nickname} ({linkedPlayer.name})
                            </p>
                            <p className="text-sm text-green-600 mt-1">
                                You can now submit scores for this player.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="player">Select your player profile</Label>
                                <Select onValueChange={setSelectedPlayerId} value={selectedPlayerId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a player..." />
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
                {!linkedPlayer && (
                    <CardFooter>
                        <Button onClick={handleLink} disabled={!selectedPlayerId || isLinking}>
                            {isLinking ? "Linking..." : "Claim Profile"}
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    )
}
