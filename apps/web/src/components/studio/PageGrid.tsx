"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check } from "lucide-react";

import { pageThumbnailUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PageGridProps {
  file: string;
  /** Page numbers in the order they are shown (drag to change it). */
  order: number[];
  onOrder: (order: number[]) => void;
  selected: Set<number>;
  onToggle: (page: number, extend: boolean) => void;
  onOpen: (page: number) => void;
}

function Thumb({
  file,
  page,
  position,
  selected,
  onToggle,
  onOpen,
}: {
  file: string;
  page: number;
  position: number;
  selected: boolean;
  onToggle: (page: number, extend: boolean) => void;
  onOpen: (page: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex flex-col items-center gap-2", isDragging && "z-10 opacity-80")}
    >
      <div
        {...attributes}
        {...listeners}
        role="checkbox"
        aria-checked={selected}
        aria-label={`Page ${page}`}
        onClick={(event) => onToggle(page, event.shiftKey)}
        onDoubleClick={() => onOpen(page)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onToggle(page, event.shiftKey);
          else listeners?.onKeyDown?.(event);
        }}
        className={cn(
          "relative flex aspect-[0.773] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[2px] bg-page shadow-[0_0_0_1px_var(--line-strong)] transition-shadow hover:shadow-[0_0_0_1px_var(--fg-subtle)]",
          selected && "shadow-[0_0_0_2px_var(--accent)] hover:shadow-[0_0_0_2px_var(--accent)]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered thumbnail */}
        <img
          src={pageThumbnailUrl(file, page)}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full select-none object-contain"
        />
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex size-[1.1rem] items-center justify-center rounded-full bg-accent text-on-accent">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className={cn("font-mono text-[0.75rem]", selected ? "font-semibold text-accent" : "text-fg-subtle")}>
        {position}
        {position !== page && <span className="text-fg-subtle"> (was {page})</span>}
      </span>
    </div>
  );
}

/** Page thumbnails: click to select, shift-click for a range, drag to reorder. */
export default function PageGrid({ file, order, onOrder, selected, onToggle, onOpen }: PageGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    onOrder(arrayMove(order, order.indexOf(Number(active.id)), order.indexOf(Number(over.id))));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-5 gap-y-6 p-6">
          {order.map((page, index) => (
            <Thumb
              key={page}
              file={file}
              page={page}
              position={index + 1}
              selected={selected.has(page)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
