import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Create logger for players [id] API module
// Using structured logging to provide consistent error tracking and debugging capabilities
// The logger provides proper log levels (error, warn, info, debug) and includes service name context
const logger = createLogger('players-id-api');

// GET single player (public access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const player = await prisma.player.findUnique({
      where: { id }
    });

    if (!player) {
      return NextResponse.json({ success: false, error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json(player);
  } catch (error) {
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    const { id } = await params;
    logger.error("Failed to fetch player", { error, playerId: id });
    return NextResponse.json(
      { success: false, error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}

// PUT update player (requires admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }
  
  try {
    const { id } = await params;
    const body = sanitizeInput(await request.json());
    const { name, nickname, country } = body;

    if (!name || !nickname) {
      return NextResponse.json(
        { success: false, error: "Name and nickname are required" },
        { status: 400 }
      );
    }

    const player = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        country: country || null,
      },
    });

    // Create audit log
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_PLAYER,
        targetId: id,
        targetType: 'Player',
        details: {
          name,
          nickname,
          country,
        },
      });
    } catch (logError) {
      // Log audit log failures with error context for monitoring
      // Audit log failures shouldn't prevent the main operation from completing
      logger.warn('Failed to create audit log', { error: logError, playerId: id, action: 'update_player' });
    }

    return NextResponse.json(player);
  } catch (error: unknown) {
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    logger.error("Failed to update player", { error, playerId: id });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ success: false, error: "Player not found" }, { status: 404 });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "A player with this nickname already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to update player" },
      { status: 500 }
    );
  }
}

// DELETE player (requires admin) - Soft Delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }
  
  try {
    const { id } = await params;
    // Use soft delete instead of hard delete
    await prisma.player.delete({
      where: { id }
    });

    // Create audit log
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_PLAYER,
        targetId: id,
        targetType: 'Player',
        details: {
          playerId: id,
          softDeleted: true,
        },
      });
    } catch (logError) {
      // Log audit log failures with error context for monitoring
      // Audit log failures shouldn't prevent the main operation from completing
      logger.warn('Failed to create audit log', { error: logError, playerId: id, action: 'delete_player' });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Player deleted successfully (soft delete)",
      softDeleted: true 
    });
  } catch (error: unknown) {
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    logger.error("Failed to delete player", { error, playerId: id });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ success: false, error: "Player not found" }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
