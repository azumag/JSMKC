"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlayoffEntry {
  id: string;
  nickname: string;
  _autoRank: number;
  rankOverride: number | null;
}

interface PlayoffGroup {
  id: string;
  rank: number;
  players: PlayoffEntry[];
}

interface QualificationPlayoffManagerProps {
  groups: PlayoffGroup[];
  isAdmin: boolean;
  onSave: (entries: PlayoffEntry[]) => Promise<boolean>;
}

function moveEntry<T>(entries: T[], from: number, to: number): T[] {
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

export function QualificationPlayoffManager({
  groups,
  isAdmin,
  onSave,
}: QualificationPlayoffManagerProps) {
  const tc = useTranslations("common");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<PlayoffEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === openGroupId) ?? null,
    [groups, openGroupId],
  );

  const openDialog = (group: PlayoffGroup) => {
    setOpenGroupId(group.id);
    setDraftOrder(group.players);
  };

  const closeDialog = () => {
    if (saving) return;
    setOpenGroupId(null);
    setDraftOrder([]);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(draftOrder);
    setSaving(false);
    if (ok) closeDialog();
  };

  if (groups.length === 0) return null;

  return (
    <>
      <div className="mb-4 space-y-2">
        {groups.map((group) => (
          <Card key={group.id} className="border-yellow-300 bg-yellow-50">
            <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-yellow-900">
                <div className="font-medium">
                  {tc("playoffGroupTitle", { rank: group.rank })}
                </div>
                <div>
                  {group.players.map((player) => player.nickname).join(" / ")}
                </div>
              </div>
              {isAdmin ? (
                <Button size="sm" variant="outline" onClick={() => openDialog(group)}>
                  {tc("recordPlayoffResult")}
                </Button>
              ) : (
                <div className="text-sm text-yellow-900">
                  {tc("playoffPending")}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={activeGroup != null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeGroup ? tc("playoffDialogTitle", { rank: activeGroup.rank }) : ""}
            </DialogTitle>
            <DialogDescription>
              {tc("playoffDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {draftOrder.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">
                    {index + 1}. {player.nickname}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tc("playoffAssignedRank", { rank: player._autoRank + index })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0 || saving}
                    onClick={() => setDraftOrder((current) => moveEntry(current, index, index - 1))}
                  >
                    {tc("moveUp")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === draftOrder.length - 1 || saving}
                    onClick={() => setDraftOrder((current) => moveEntry(current, index, index + 1))}
                  >
                    {tc("moveDown")}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? tc("saving") : tc("savePlayoffResult")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
