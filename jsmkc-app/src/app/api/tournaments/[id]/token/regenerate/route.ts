import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { generateTournamentToken, getTokenExpiry } from "@/lib/token-utils";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";

// POST - Generate new tournament token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const { expiresInHours = 24 } = sanitizeInput(await request.json());

    // Validate input
    if (expiresInHours < 1 || expiresInHours > 168) { // Max 7 days
      return NextResponse.json(
        { success: false, error: 'Token expiry must be between 1 and 168 hours' },
        { status: 400 }
      );
    }

    // Generate new token
    const newToken = generateTournamentToken();
    const newExpiry = getTokenExpiry(expiresInHours);

    // Update tournament with new token
    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        token: newToken,
        tokenExpiresAt: newExpiry,
      },
      select: {
        id: true,
        name: true,
        token: true,
        tokenExpiresAt: true,
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
        action: 'REGENERATE_TOKEN',
        targetId: id,
        targetType: 'Tournament',
        details: {
          newToken: newToken.substring(0, 8) + '...', // Log partial token for security
          expiresInHours,
          newExpiry: newExpiry.toISOString(),
        },
      });
    } catch (logError) {
      console.error('Failed to create audit log:', logError);
    }

    return NextResponse.json({
      success: true,
      data: {
        token: tournament.token,
        expiresAt: tournament.tokenExpiresAt,
        expiresInHours,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to regenerate token:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to regenerate token" },
      { status: 500 }
    );
  }
}