interface LoadingSkeletonProps {
  variant: "kpi" | "wallets" | "chart" | "table" | "cards" | "status";
}

export function LoadingSkeleton({ variant }: LoadingSkeletonProps) {
  if (variant === "kpi") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tn-card h-24 p-4">
            <div className="tn-skeleton h-3 w-24" />
            <div className="tn-skeleton mt-4 h-7 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "wallets") {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="tn-card h-48 p-5">
            <div className="tn-skeleton h-5 w-28" />
            <div className="tn-skeleton mt-4 h-4 w-40" />
            <div className="tn-skeleton mt-6 h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className="tn-card h-80 p-5" aria-busy>
        <div className="tn-skeleton h-5 w-40" />
        <div className="tn-skeleton mt-6 h-56 w-full" />
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="tn-card space-y-3 p-5" aria-busy>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="tn-skeleton h-16 w-full" />
        ))}
      </div>
    );
  }

  if (variant === "status") {
    return (
      <div className="tn-card h-40 p-5" aria-busy>
        <div className="tn-skeleton h-5 w-40" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="tn-skeleton h-16 w-full" />
          ))}
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
