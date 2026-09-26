export function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--tn-border)] bg-slate-50/80 px-4 py-10 text-center"
      role="status"
    >
      <p className="max-w-md text-sm font-medium text-[var(--tn-muted)]">
        {message}
      </p>
    </div>
  );
}
