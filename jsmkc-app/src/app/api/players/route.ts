import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET all players
export async function GET() {
  try {
    const players = await prisma.player.findMany({
      orderBy: { nickname: "asc" },
    });
    return NextResponse.json(players);
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
  try {
    const body = await request.json();
    const { name, nickname, country } = body;

    if (!name || !nickname) {
      return NextResponse.json(
        { error: "Name and nickname are required" },
        { status: 400 }
      );
    }

    const player = await prisma.player.create({
      data: {
        name,
        nickname,
        country: country || null,
      },
    });

    return NextResponse.json(player, { status: 201 });
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
