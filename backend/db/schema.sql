CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS review_periods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  starts_on DATE,
  ends_on DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'manager', 'hr')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appraisals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'completed')),
  employee_signed BOOLEAN NOT NULL DEFAULT FALSE,
  manager_signed BOOLEAN NOT NULL DEFAULT FALSE,
  employee_signed_at TIMESTAMP,
  manager_signed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period)
);

CREATE TABLE IF NOT EXISTS kpis (
  id SERIAL PRIMARY KEY,
  appraisal_id INTEGER NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  weight NUMERIC(5,2) NOT NULL CHECK (weight >= 0),
  target NUMERIC(12,2) NOT NULL CHECK (target >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance (
  id SERIAL PRIMARY KEY,
  kpi_id INTEGER NOT NULL UNIQUE REFERENCES kpis(id) ON DELETE CASCADE,
  actual NUMERIC(12,2) NOT NULL DEFAULT 0,
  self_score NUMERIC(8,2),
  manager_score NUMERIC(8,2),
  final_score NUMERIC(8,2),
  manager_score_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('employee', 'manager')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_kpis_user ON kpis(user_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_user ON appraisals(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_kpi ON comments(kpi_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_periods_single_active ON review_periods ((is_active)) WHERE is_active = TRUE;
