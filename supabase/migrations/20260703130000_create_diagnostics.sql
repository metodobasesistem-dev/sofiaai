-- Create diagnostics table
CREATE TABLE IF NOT EXISTS diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  niche TEXT NOT NULL,
  main_product TEXT,
  main_objections TEXT,
  instagram_link TEXT,
  website_link TEXT,
  gmb_link TEXT,
  screenshot_urls JSONB DEFAULT '[]'::jsonb, -- Array of screenshot URLs
  
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  
  scenario_current JSONB,    -- Semaphores and justifications
  action_plan JSONB,         -- Action item details (short/medium term)
  execution_guide JSONB,     -- Content scripts and strategic directions
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for the diagnostics table
CREATE POLICY "Enable access for own company diagnostics" ON diagnostics
    FOR ALL USING (auth.uid() = company_id);
