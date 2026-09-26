# TreasureNOVA USDT Wallet Analytics

Real-time, **read-only** BEP-20 USDT wallet analytics on **BNB Smart Chain (Chain ID 56)**.

This dashboard tracks public blockchain activity for two configured wallets. It never connects user wallets, never requests private keys or seed phrases, and never sends or signs transactions.

## Features

- Live USDT balances via `balanceOf` on the configured BEP-20 contract
- Historical USDT Transfer indexing via BSC RPC `eth_getLogs` (chunked, resumable)
- Incremental sync with duplicate protection (`tx_hash + log_index + wallet_address`)
- Daily aggregation and Net Cash Flow (Deposits − Withdrawals)
- KPI cards, Recharts flow chart, daily summary, transaction history
- CSV export, search, mobile-first responsive UI
- Supabase PostgreSQL storage with RLS
- Protected sync endpoint and public API rate limiting

## Monitored wallets

| Role | Address |
|------|---------|
| Deposit | `0xc051a1b111085ddD6Bc2FF8346Ad0f4E7dF26935` |
| Withdraw | `0x48A909049FB00581CA83beA39BB824eBb90132FA` |

**Classification rules**

- **Deposit** = USDT transfer **to** the deposit wallet
- **Withdrawal** = USDT transfer **to** the withdraw wallet

## Architecture

```
Browser (Next.js App Router)
  → GET /api/dashboard | daily-stats | transactions | wallets | sync-status
  → optional Supabase Realtime (publishable key)

Server
  → Supabase (secret key) — reads/writes indexed data
  → BSC JSON-RPC — balances, chain health, token metadata, eth_getLogs history
  → Etherscan V2 API (optional) — kept for compatibility / latest-block fallback

Background / scripts
  → npm run sync — historical + incremental indexing (RPC eth_getLogs)
  → npm run verify:token / verify:blockchain
```

## Folder structure

```
app/                  # App Router pages + API routes
components/dashboard/ # UI components
lib/blockchain/       # RPC, token, logs, etherscan, sync, validation
lib/supabase/         # server + browser clients
lib/analytics/        # aggregation, calculations, filters
scripts/              # verify + sync CLI
supabase/migrations/  # SQL schema + RLS
types/                # shared TypeScript types
tests/                # Vitest unit tests
```

## Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CHAIN_ID` | Must be `56` |
| `BSC_RPC_URL` | BSC JSON-RPC endpoint (required for sync) |
| `USDT_CONTRACT_ADDRESS` | BEP-20 USDT contract (do not invent) |
| `DEPOSIT_WALLET` | Deposit wallet address |
| `WITHDRAW_WALLET` | Withdraw wallet address |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | Supabase service role / secret key |

### Optional

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_APP_NAME` | TreasureNOVA USDT Wallet Analytics |
| `NEXT_PUBLIC_EXPLORER_URL` | https://bscscan.com |
| `ETHERSCAN_API_KEY` | Optional; not required for sync |
| `SYNC_INTERVAL_SECONDS` | 20 |
| `HISTORICAL_BATCH_SIZE` | 1000 |
| `MAX_TRANSACTION_PAGE_SIZE` | 100 |
| `SYNC_START_BLOCK` | 6982962 (first-time scan floor) |
| `LOG_SCAN_CHUNK_SIZE` | 5000 (adaptive eth_getLogs range) |
| `SYNC_SECRET` | Protects `POST /api/sync` |

**Never** expose `SUPABASE_SECRET_KEY` or `ETHERSCAN_API_KEY` via `NEXT_PUBLIC_*` variables.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the migration file:

   `supabase/migrations/20260326000000_init.sql`

4. Confirm tables exist: `wallets`, `transactions`, `daily_stats`, `sync_state`.
5. Copy project URL + keys into `.env.local`.
6. (Optional) Enable Realtime for `transactions` in Supabase Dashboard.

## BSC RPC setup

Default RPC: `https://bsc-dataseed.bnbchain.org`

Historical sync uses `eth_getLogs` against this endpoint (chunked block ranges with retry/backoff). You may replace `BSC_RPC_URL` with another reliable BSC mainnet endpoint if public dataseeds rate-limit.

### Optional Etherscan

Etherscan V2 (`chainid=56`) remains in the codebase for compatibility, but **sync does not require a paid Etherscan plan**. Set `ETHERSCAN_API_KEY` only if you use those helpers.

## Token contract setup

**Do not hardcode USDT.** Set `USDT_CONTRACT_ADDRESS` to the actual BEP-20 USDT contract you intend to track.

Verify before syncing:

```bash
npm run verify:token
npm run verify:blockchain
```

Or call:

```
GET /api/verify-token
```

If verification fails, the dashboard shows a configuration error instead of fake zeros.

## Initial sync

After env + migration are ready:

```bash
npm run sync
```

This will:

1. Verify the token contract on chain ID 56
2. Scan USDT `Transfer` logs via RPC `eth_getLogs` where `to` is the deposit or withdraw wallet
3. Validate (contract, event signature, receipt status, timestamp, decimals, addresses) and upsert
4. Rebuild `daily_stats`
5. Checkpoint `sync_state.last_indexed_block` after each chunk (resume-safe)

Default `npm run sync` resumes from the last indexed block. Full re-scan from `SYNC_START_BLOCK`:

```bash
npm run sync -- --full
```

Duplicates are skipped via unique constraint `tx_hash + log_index + wallet_address`.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run test` | Vitest unit tests |
| `npm run sync` | Historical / incremental sync |
| `npm run verify:blockchain` | RPC + wallets + token + balances |
| `npm run verify:token` | Token contract verification |
| `npm run db:migrate` | Migration reminder |

## Production / Vercel deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy.
5. Apply the SQL migration in Supabase.
6. Run sync once from a trusted machine:

   ```bash
   npm run sync
   ```

7. Optionally schedule incremental sync:

   ```bash
   curl -X POST https://YOUR_DOMAIN/api/sync \
     -H "Authorization: Bearer $SYNC_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"fullHistory":false,"reconcile":true}'
   ```

   Use Vercel Cron, GitHub Actions, or an external scheduler every 15–60 seconds / few minutes depending on rate limits.

## Real-time architecture

1. Server-side sync (script or protected `POST /api/sync`) pulls new indexed transfers.
2. Dashboard polls APIs every ~20 seconds.
3. Optional Supabase Realtime refreshes the UI when `transactions` change.
4. Live balances always come from RPC `balanceOf`, not from historical sums.

## Security notes

- Read-only analytics — no custody, no signing, no deposits/withdrawals
- Secret keys stay server-side only
- `POST /api/sync` requires `SYNC_SECRET`
- Public APIs are rate-limited
- RLS enabled on Supabase tables
- Security headers configured in `next.config.ts`

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Configuration banner on UI | Fill `.env.local`; verify with `npm run verify:token` |
| Empty transactions | Run `npm run sync` after migration |
| “Live balance temporarily unavailable” | Check `BSC_RPC_URL` / RPC health |
| Sync RPC errors / range limits | Sync auto-shrinks chunk size; try a more reliable `BSC_RPC_URL` |
| Database error | Confirm migration applied; check `SUPABASE_SECRET_KEY` |
| Wrong token / zeros | Do not invent a contract — set the correct USDT address and re-verify |

## Disclaimer

Blockchain data is for analytics and informational purposes. **Deposits** are USDT transfers IN to the Deposit Wallet; **Withdrawals** are USDT transfers IN to the Withdraw Wallet. Wallet OUT transfers are never counted. **Net Cash Flow** = Deposit − Withdrawal and **does not represent accounting profit**. Completed UTC days are final; today remains LIVE until the day ends.

## License

Private / proprietary — TreasureNOVA.
