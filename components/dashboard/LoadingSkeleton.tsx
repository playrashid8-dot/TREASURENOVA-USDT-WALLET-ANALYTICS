interface LoadingSkeletonProps {
  variant: "kpi" | "wallets" | "chart" | "table" | "cards" | "status";
}

export function LoadingSkeleton({ variant }: LoadingSkeletonProps) {
  if (variant === "wallets") {
    return (
      <div className="space-y-4 md:space-y-5" aria-busy>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="tn-card h-44 p-5">
              <div className="tn-skeleton h-5 w-28" />
              <div className="tn-skeleton mt-4 h-4 w-56" />
              <div className="tn-skeleton mt-8 h-8 w-40" />
            </div>
          ))}
        </div>
        <div className="tn-card tn-card-reserve h-44 p-5">
          <div className="tn-skeleton h-5 w-52" />
          <div className="tn-skeleton mt-4 h-4 w-64 max-w-full" />
          <div className="tn-skeleton mt-8 h-8 w-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="tn-card space-y-2 p-5" aria-busy>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="tn-skeleton h-10 w-full" />
      ))}
    </div>
  );
}
