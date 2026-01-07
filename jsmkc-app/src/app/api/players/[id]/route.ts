import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET single player
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json(player);
  } catch (error) {
    console.error("Failed to fetch player:", error);
    return NextResponse.json(
      { error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}

// PUT update player
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, nickname, country } = body;

    if (!name || !nickname) {
      return NextResponse.json(
        { error: "Name and nickname are required" },
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

    return NextResponse.json(player);
  } catch (error: unknown) {
    console.error("Failed to update player:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
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
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}

// DELETE player
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.player.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Player deleted successfully" });
  } catch (error: unknown) {
    console.error("Failed to delete player:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
