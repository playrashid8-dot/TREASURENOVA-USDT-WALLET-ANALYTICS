export function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3 md:gap-4" aria-busy>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="tn-card h-52 p-3.5 sm:h-56 sm:p-5">
          <div className="tn-skeleton h-5 w-28" />
          <div className="tn-skeleton mt-3 h-4 w-40 max-w-full" />
          <div className="tn-skeleton mt-6 h-8 w-36" />
          <div className="tn-skeleton mt-6 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
