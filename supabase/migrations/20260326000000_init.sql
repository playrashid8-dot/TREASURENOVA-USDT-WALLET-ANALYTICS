-- TreasureNOVA USDT Wallet Analytics
-- Supabase PostgreSQL migration
-- Apply via Supabase SQL Editor or: supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('deposit', 'withdraw')),
  label TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 56,
  token_contract TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallets_address_unique UNIQUE (address)
);

CREATE INDEX IF NOT EXISTS idx_wallets_wallet_type ON wallets (wallet_type);
CREATE INDEX IF NOT EXISTS idx_wallets_token_contract ON wallets (token_contract);

-- ---------------------------------------------------------------------------
-- transactions
-- Unique identity: tx_hash + log_index + wallet_address
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('deposit', 'withdraw')),
  token_contract TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  amount_usdt NUMERIC(36, 18) NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  token_symbol TEXT NOT NULL DEFAULT 'USDT',
  token_decimals INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_unique_identity UNIQUE (tx_hash, log_index, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_block_number ON transactions (block_number DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions (tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_address ON transactions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_type ON transactions (wallet_type);
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON transactions (from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to_address ON transactions (to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_token_contract ON transactions (token_contract);
CREATE INDEX IF NOT EXISTS idx_transactions_type_timestamp ON transactions (wallet_type, timestamp DESC);

-- ---------------------------------------------------------------------------
-- daily_stats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  deposit_amount NUMERIC(36, 18) NOT NULL DEFAULT 0,
  withdrawal_amount NUMERIC(36, 18) NOT NULL DEFAULT 0,
  net_cash_flow NUMERIC(36, 18) NOT NULL DEFAULT 0,
  deposit_count INTEGER NOT NULL DEFAULT 0,
  withdrawal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_stats_date_unique UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats (date DESC);

-- ---------------------------------------------------------------------------
-- sync_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_key TEXT NOT NULL,
  last_indexed_block BIGINT NOT NULL DEFAULT 0,
  last_successful_sync TIMESTAMPTZ,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_state_sync_key_unique UNIQUE (sync_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_state_sync_key ON sync_state (sync_key);

-- Seed sync state row
INSERT INTO sync_state (sync_key, last_indexed_block, status)
VALUES ('usdt_wallet_transfers', 0, 'idle')
ON CONFLICT (sync_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Public clients must NOT use the secret key.
-- Dashboard data is served through Next.js server API routes.
-- ---------------------------------------------------------------------------
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

-- Optional read-only policies for the publishable (anon) key — realtime SELECT only.
-- Writes remain service-role only (bypasses RLS).
DROP POLICY IF EXISTS "Public read wallets" ON wallets;
CREATE POLICY "Public read wallets" ON wallets
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public read transactions" ON transactions;
CREATE POLICY "Public read transactions" ON transactions
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Public read daily_stats" ON daily_stats;
CREATE POLICY "Public read daily_stats" ON daily_stats
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Public read sync_state" ON sync_state;
CREATE POLICY "Public read sync_state" ON sync_state
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Enable realtime for transactions (optional — run in Supabase dashboard if needed)
-- ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE daily_stats;
-- ALTER PUBLICATION supabase_realtime ADD TABLE sync_state;

COMMENT ON TABLE wallets IS 'Monitored deposit/withdraw wallets for TreasureNOVA analytics';
COMMENT ON TABLE transactions IS 'Validated BEP-20 USDT transfers into monitored wallets';
COMMENT ON TABLE daily_stats IS 'UTC daily aggregation of deposits and withdrawals';
COMMENT ON TABLE sync_state IS 'Indexer sync checkpoint and status';
COMMENT ON COLUMN transactions.wallet_type IS 'deposit = transfer TO deposit wallet; withdraw = transfer TO withdraw wallet';
