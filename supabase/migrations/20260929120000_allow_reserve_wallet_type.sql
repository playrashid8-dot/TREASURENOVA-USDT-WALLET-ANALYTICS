-- Allow Reserve Fund rows in transactions / wallets (OUT indexing for Recent TX).
-- Display classification still uses from/to addresses; this only expands storage.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_wallet_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_wallet_type_check
  CHECK (wallet_type IN ('deposit', 'withdraw', 'reserve'));

ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_wallet_type_check;
ALTER TABLE wallets
  ADD CONSTRAINT wallets_wallet_type_check
  CHECK (wallet_type IN ('deposit', 'withdraw', 'reserve'));

COMMENT ON COLUMN transactions.wallet_type IS
  'deposit = Transfer TO deposit; withdraw = Transfer involving withdraw wallet; reserve = Transfer FROM reserve fund (OUT)';
