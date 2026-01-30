/**
 * Player-User Link API Route
 *
 * POST /api/players/:id/link
 *
 * Links an authenticated OAuth user account to a player profile.
 * This establishes the relationship between the authentication identity
 * (GitHub/Google/Discord OAuth) and the player record used in tournaments.
 *
 * Constraints enforced:
 *   1. User must be authenticated (any role)
 *   2. Target player must exist
 *   3. Target player must not already be linked to another user
 *   4. The requesting user must not already be linked to a different player
 *
 * These constraints ensure a strict 1:1 mapping between users and players,
 * preventing identity conflicts in tournament scoring.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-link-api');

  // Authentication check: any authenticated user can link to a player,
  // not just admins. This allows players to self-associate their accounts.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    // Step 1: Verify the target player exists
    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 }
      );
    }

    // Step 2: Check if this player is already linked to a user.
    // Each player can only be associated with one OAuth account.
    if (player.userId) {
      return NextResponse.json(
        { error: "Player already linked to a user" },
        { status: 409 }
      );
    }

    // Step 3: Check if the requesting user is already linked to another player.
    // Each user can only be associated with one player profile.
    // Uses findUnique on userId which has a unique constraint.
    const existingLink = await prisma.player.findUnique({
      where: { userId: session.user.id },
    });

    if (existingLink) {
      return NextResponse.json(
        { error: "You are already linked to a player profile" },
        { status: 409 }
      );
    }

    // Step 4: Create the link by setting the userId on the player record
    const updatedPlayer = await prisma.player.update({
      where: { id },
      data: { userId: session.user.id },
    });

    return NextResponse.json(updatedPlayer);
  } catch (error) {
    // Log error with both player ID and user ID for debugging link issues
    logger.error("Failed to link player", {
      error,
      playerId: id,
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: "Failed to link player" },
      { status: 500 }
    );
  }
}
