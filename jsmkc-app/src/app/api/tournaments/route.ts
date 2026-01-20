import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { paginate } from "@/lib/pagination";

// GET all tournaments (public access, excluding soft deleted)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    const result = await paginate(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: prisma.tournament.findMany as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        count: prisma.tournament.count as any,
      },
      {
        deletedAt: null,
      },
      { date: "desc" },
      { page, limit }
    );

    return NextResponse.json(result);
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
