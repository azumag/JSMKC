import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">SMKC Score System</h1>
        <p className="text-muted-foreground text-lg">
          Super Mario Kart Championship Score Management
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Players</CardTitle>
            <CardDescription>Manage tournament participants</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/players">Manage Players</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tournaments</CardTitle>
            <CardDescription>Create and manage tournaments</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/tournaments">View Tournaments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Game Modes</CardTitle>
            <CardDescription>Available competition formats</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Time Trial</h3>
                <p className="text-sm text-muted-foreground">Individual time-based competition</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Battle Mode</h3>
                <p className="text-sm text-muted-foreground">1v1 balloon battle</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Match Race</h3>
                <p className="text-sm text-muted-foreground">1v1 race competition</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Grand Prix</h3>
                <p className="text-sm text-muted-foreground">Cup-based driver points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
