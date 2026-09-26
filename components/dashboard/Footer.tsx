export function Footer() {
  return (
    <footer className="mt-10 border-t border-[var(--tn-border)] bg-white/80">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-lg font-bold tracking-tight text-[var(--tn-navy)]">
          TREASURENOVA
        </p>
        <p className="text-sm font-medium text-[var(--tn-navy-soft)]">
          USDT Wallet Analytics
        </p>
        <p className="mt-1 text-xs font-semibold tracking-wide text-[var(--tn-muted)]">
          BEP-20 / BNB Smart Chain
        </p>

        <div className="mt-4 grid gap-2 text-sm text-[var(--tn-muted)] sm:grid-cols-2">
          <p>
            <span className="font-semibold text-[var(--tn-navy)]">Data source:</span>{" "}
            BNB Smart Chain + indexed blockchain data
          </p>
          <p>
            <span className="font-semibold text-[var(--tn-navy)]">Explorer:</span>{" "}
            <a
              href="https://bscscan.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tn-info)] hover:underline"
            >
              BscScan
            </a>
          </p>
        </div>

        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-[var(--tn-muted)]">
          Blockchain data is provided for analytics and informational purposes.
          Net Cash Flow is calculated from tracked wallet inflows and outflows
          and does not represent accounting profit. This dashboard is read-only
          and never requests private keys, seed phrases, or wallet connections.
        </p>
      </div>
    </footer>
  );
}
