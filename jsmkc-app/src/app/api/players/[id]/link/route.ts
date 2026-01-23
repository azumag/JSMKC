import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

// Create logger for players [id]/link API module
// Using structured logging to provide consistent error tracking and debugging capabilities
// The logger provides proper log levels (error, warn, info, debug) and includes service name context
const logger = createLogger('players-link-api');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { id } = await params;

    try {
        // Check if player exists and is not already linked
        const player = await prisma.player.findUnique({
            where: { id },
        });

        if (!player) {
            return NextResponse.json(
                { error: "Player not found" },
                { status: 404 }
            );
        }

        if (player.userId) {
            return NextResponse.json(
                { error: "Player already linked to a user" },
                { status: 409 }
            );
        }

        // Check if user is already linked to another player
        const existingLink = await prisma.player.findUnique({
            where: { userId: session.user.id },
        });

        if (existingLink) {
            return NextResponse.json(
                { error: "You are already linked to a player profile" },
                { status: 409 }
            );
        }

        // Link user to player
        const updatedPlayer = await prisma.player.update({
            where: { id },
            data: { userId: session.user.id },
        });

        return NextResponse.json(updatedPlayer);
    } catch (error) {
        // Log error with structured metadata for better debugging and monitoring
        // The error object is passed as metadata to maintain error stack traces
        logger.error("Failed to link player", { error, playerId: id, userId: session.user.id });
        return NextResponse.json(
            { error: "Failed to link player" },
            { status: 500 }
        );
    }
}
