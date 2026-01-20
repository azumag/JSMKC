import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import { generateSecurePassword, hashPassword } from "@/lib/password-utils";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { paginate } from "@/lib/pagination";

// GET all players (excluding soft deleted)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    const result = await paginate(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: prisma.player.findMany as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        count: prisma.player.count as any,
      },
      {
        deletedAt: null,
      },
      { nickname: "asc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch players:", error);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}

// POST create new player
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    const body = sanitizeInput(await request.json());
    const { name, nickname, country } = body;

    if (!name || !nickname) {
      return NextResponse.json(
        { error: "Name and nickname are required" },
        { status: 400 }
      );
    }

    const plainPassword = generateSecurePassword(12);
    const hashedPassword = await hashPassword(plainPassword);

    const player = await prisma.player.create({
      data: {
        name,
        nickname,
        country: country || null,
        password: hashedPassword,
      },
    });

    // Audit log
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_PLAYER,
        targetId: player.id,
        targetType: 'Player',
        details: { name, nickname, country, passwordGenerated: true },
      });
    } catch (logError) {
      console.error('Failed to create audit log:', logError);
    }

    return NextResponse.json({
      player,
      temporaryPassword: plainPassword,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create player:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A player with this nickname already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}
