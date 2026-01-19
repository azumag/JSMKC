import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";

// GET all tournaments (public access, excluding soft deleted)
export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { date: "desc" },
    });
    return NextResponse.json(tournaments);
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return NextResponse.json(
      { error: "Failed to fetch tournaments" },
      { status: 500 }
    );
  }
}

// POST create new tournament (requires authentication)
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    const body = sanitizeInput(await request.json());
    const { name, date } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: "Name and date are required" },
        { status: 400 }
      );
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        date: new Date(date),
        status: "draft",
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
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        targetId: tournament.id,
        targetType: 'Tournament',
        details: {
          name,
          date,
        },
      });
    } catch (logError) {
      console.error('Failed to create audit log:', logError);
    }

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error("Failed to create tournament:", error);
    return NextResponse.json(
      { error: "Failed to create tournament" },
      { status: 500 }
    );
  }
}
