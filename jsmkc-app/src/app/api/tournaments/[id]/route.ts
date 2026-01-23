import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('tournament-api');

// GET single tournament with related data (public access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        date: true,
        status: true,
        token: true,
        tokenExpiresAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        bmQualifications: {
          include: { player: true },
          orderBy: [{ group: "asc" }, { score: "desc" }],
        },
        bmMatches: {
          include: {
            player1: true,
            player2: true,
          },
          orderBy: { matchNumber: "asc" },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch tournament", { error, id });
    return NextResponse.json(
      { error: "Failed to fetch tournament" },
      { status: 500 }
    );
  }
}

// PUT update tournament (requires admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }
  
  const { id } = await params;
  try {
    const body = sanitizeInput(await request.json());
    const { name, date, status } = body;

    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(date && { date: new Date(date) }),
        ...(status && { status }),
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
        action: AUDIT_ACTIONS.UPDATE_TOURNAMENT,
        targetId: id,
        targetType: 'Tournament',
        details: {
          name,
          date,
          status,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, id, action: 'UPDATE_TOURNAMENT' });
    }

    return NextResponse.json(tournament);
  } catch (error: unknown) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update tournament", { error, id });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update tournament" },
      { status: 500 }
    );
  }
}

// DELETE tournament (requires admin) - Soft Delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }
  
  const { id } = await params;
  try {
    // Use soft delete instead of hard delete
    await prisma.tournament.delete({
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
        action: AUDIT_ACTIONS.DELETE_TOURNAMENT,
        targetId: id,
        targetType: 'Tournament',
        details: {
          tournamentId: id,
          softDeleted: true,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, id, action: 'DELETE_TOURNAMENT' });
    }

    return NextResponse.json({ 
      success: true,
      message: "Tournament deleted successfully (soft delete)",
      softDeleted: true 
    });
  } catch (error: unknown) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to delete tournament", { error, id });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete tournament" },
      { status: 500 }
    );
  }
}
