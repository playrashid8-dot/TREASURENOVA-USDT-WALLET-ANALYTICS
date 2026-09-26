export function ConfigBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      role="alert"
    >
      <p className="font-semibold">Configuration required</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-xs text-red-800">
        Copy <code className="rounded bg-white/70 px-1">.env.example</code> to{" "}
        <code className="rounded bg-white/70 px-1">.env.local</code>, set{" "}
        <code className="rounded bg-white/70 px-1">USDT_CONTRACT_ADDRESS</code>,
        Supabase, and Etherscan keys, then run{" "}
        <code className="rounded bg-white/70 px-1">npm run verify:token</code>{" "}
        and <code className="rounded bg-white/70 px-1">npm run sync</code>.
      </p>
    </div>
  );
}
