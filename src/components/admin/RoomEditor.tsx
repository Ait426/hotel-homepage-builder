"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PlanInput {
  id: string;
  name: string;
  basePrice: number;
}

/** 객실 1개의 검수 카드: 객실 수 · 최대 인원 · 요금제별 기본가 수정 */
export function RoomEditor({
  hotelSlug,
  room,
  plans,
}: {
  hotelSlug: string;
  room: {
    id: string;
    name: string;
    totalRooms: number;
    occupancyBase: number;
    occupancyMax: number;
  };
  plans: PlanInput[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError(false);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          roomTypeId: room.id,
          totalRooms: Number(form.get("totalRooms")),
          occupancyMax: Number(form.get("occupancyMax")),
          plans: plans.map((plan) => ({
            id: plan.id,
            basePrice: Number(form.get(`price-${plan.id}`)),
          })),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error();
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-token border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand";
  const labelCls = "mb-1 block text-[0.65rem] uppercase tracking-wide text-ink-muted";

  return (
    <form
      onSubmit={save}
      className="rounded-token bg-surface p-5 shadow-sm ring-1 ring-ink/5"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium text-ink">{room.name}</p>
        <div className="flex items-center gap-3">
          {saved ? <span className="text-xs text-brand">저장됨 ✓</span> : null}
          {error ? <span className="text-xs text-red-600">저장 실패</span> : null}
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-token bg-brand px-4 py-2 text-xs font-medium tracking-wide text-brand-ink disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={labelCls}>객실 수</label>
          <input
            name="totalRooms"
            type="number"
            min={0}
            max={500}
            defaultValue={room.totalRooms}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>최대 인원 (기준 {room.occupancyBase}인)</label>
          <input
            name="occupancyMax"
            type="number"
            min={room.occupancyBase}
            max={20}
            defaultValue={room.occupancyMax}
            className={inputCls}
          />
        </div>
        {plans.map((plan) => (
          <div key={plan.id}>
            <label className={labelCls}>{plan.name} (₩/박)</label>
            <input
              name={`price-${plan.id}`}
              type="number"
              min={0}
              step={1000}
              defaultValue={plan.basePrice}
              className={inputCls}
            />
          </div>
        ))}
      </div>
    </form>
  );
}
