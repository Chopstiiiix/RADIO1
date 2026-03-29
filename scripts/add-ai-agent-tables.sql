-- AI Agent Marketplace Tables
-- Replaces the old ai_hosts table with a full marketplace system
-- Tables: ai_agents, agent_subscriptions, broadcaster_agent_configs

-- ============================================================
-- 1. ai_agents — Agent catalog (replaces ai_hosts)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  gender                  text NOT NULL CHECK (gender IN ('male', 'female', 'non-binary')),
  personality             text NOT NULL,
  voice_id                text NOT NULL,
  avatar_url              text,
  description             text NOT NULL,
  sample_audio_url        text,
  catchphrases            text[] DEFAULT '{}',
  price_primary_cents     integer NOT NULL DEFAULT 5000,
  price_cohost_cents      integer NOT NULL DEFAULT 4000,
  stripe_price_id_primary text,
  stripe_price_id_cohost  text,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now()
);

COMMENT ON TABLE ai_agents IS 'AI host agent catalog for the marketplace';
COMMENT ON COLUMN ai_agents.price_primary_cents IS 'Monthly price in cents for primary host role (e.g. 5000 = $50)';
COMMENT ON COLUMN ai_agents.price_cohost_cents IS 'Monthly price in cents for co-host role (e.g. 4000 = $40)';

-- ============================================================
-- 2. agent_subscriptions — Broadcaster subscriptions to agents
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcaster_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id                uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  role                    text NOT NULL CHECK (role IN ('primary', 'cohost')),
  stripe_subscription_id  text,
  stripe_customer_id      text,
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end      timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (broadcaster_id, agent_id)
);

COMMENT ON TABLE agent_subscriptions IS 'Tracks which broadcasters have subscribed to which AI agents';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_broadcaster_id
  ON agent_subscriptions (broadcaster_id);

CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_stripe_subscription_id
  ON agent_subscriptions (stripe_subscription_id);

-- ============================================================
-- 3. broadcaster_agent_configs — Per-broadcaster AI host toggle
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcaster_agent_configs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcaster_id    uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  ai_host_enabled   boolean DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

COMMENT ON TABLE broadcaster_agent_configs IS 'Per-broadcaster toggle for enabling/disabling AI host features';

-- ============================================================
-- 4. Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcaster_agent_configs ENABLE ROW LEVEL SECURITY;

-- ai_agents: public catalog, readable by all authenticated users
CREATE POLICY "ai_agents_select_authenticated"
  ON ai_agents FOR SELECT
  TO authenticated
  USING (true);

-- agent_subscriptions: users can only see their own subscriptions
CREATE POLICY "agent_subscriptions_select_own"
  ON agent_subscriptions FOR SELECT
  TO authenticated
  USING (broadcaster_id = auth.uid());

CREATE POLICY "agent_subscriptions_insert_own"
  ON agent_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (broadcaster_id = auth.uid());

CREATE POLICY "agent_subscriptions_update_own"
  ON agent_subscriptions FOR UPDATE
  TO authenticated
  USING (broadcaster_id = auth.uid())
  WITH CHECK (broadcaster_id = auth.uid());

CREATE POLICY "agent_subscriptions_delete_own"
  ON agent_subscriptions FOR DELETE
  TO authenticated
  USING (broadcaster_id = auth.uid());

-- broadcaster_agent_configs: users can only manage their own config
CREATE POLICY "broadcaster_agent_configs_select_own"
  ON broadcaster_agent_configs FOR SELECT
  TO authenticated
  USING (broadcaster_id = auth.uid());

CREATE POLICY "broadcaster_agent_configs_insert_own"
  ON broadcaster_agent_configs FOR INSERT
  TO authenticated
  WITH CHECK (broadcaster_id = auth.uid());

CREATE POLICY "broadcaster_agent_configs_update_own"
  ON broadcaster_agent_configs FOR UPDATE
  TO authenticated
  USING (broadcaster_id = auth.uid())
  WITH CHECK (broadcaster_id = auth.uid());

-- ============================================================
-- 5. Seed data — Adam & Eve
-- ============================================================
INSERT INTO ai_agents (name, gender, personality, voice_id, description, catchphrases, price_primary_cents, price_cohost_cents)
VALUES
  (
    'Adam',
    'male',
    'Confident, energetic, and quick-witted. Adam brings high energy to every transition with sharp commentary on production techniques and music history. He leads conversations naturally and keeps the vibe up. Think morning radio host meets music journalist.',
    'ADAM_VOICE_ID_PLACEHOLDER',
    'Your high-energy lead host. Adam brings sharp music commentary and effortless transitions with a confident, commanding presence.',
    ARRAY['You''re locked in', 'Let''s keep it moving', 'That production though'],
    5000,
    4000
  ),
  (
    'Eve',
    'female',
    'Warm, insightful, and deeply knowledgeable about music culture. Eve adds depth to conversations with thoughtful observations about artists, samples, and cultural context. She balances energy with substance. Think music curator meets cultural commentator.',
    'EVE_VOICE_ID_PLACEHOLDER',
    'Your insightful co-host. Eve brings cultural depth and warmth, connecting tracks to their roots with effortless knowledge.',
    ARRAY['I love that', 'The way they flipped that sample', 'Such a vibe'],
    5000,
    4000
  );
