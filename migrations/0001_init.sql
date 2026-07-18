PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS franchisees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  org_no TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  region TEXT,
  address TEXT,
  postcode TEXT,
  city TEXT,
  daily_capacity INTEGER NOT NULL DEFAULT 6,
  route_priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  franchisee_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'franchisee', 'staff')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'Mobilvask',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  price_ex_vat INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 25,
  description TEXT,
  public_bookable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  franchisee_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  postcode_from INTEGER,
  postcode_to INTEGER,
  postcode_prefix TEXT,
  municipality TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  exclusive INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id) ON DELETE CASCADE,
  CHECK (
    (postcode_from IS NOT NULL AND postcode_to IS NOT NULL)
    OR postcode_prefix IS NOT NULL
    OR municipality IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  franchisee_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  capacity_override INTEGER,
  closed INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(franchisee_id, work_date),
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE,
  franchisee_id INTEGER,
  service_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  city TEXT,
  vehicle_reg_no TEXT,
  vehicle_make_model TEXT,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT,
  notes TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ny' CHECK (status IN ('ny', 'tildelt', 'bekreftet', 'avvist', 'omfordeles', 'konvertert', 'avlyst')),
  assignment_reason TEXT,
  source TEXT NOT NULL DEFAULT 'nettside',
  source_ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  franchisee_id INTEGER,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  postcode TEXT,
  city TEXT,
  org_no TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  reg_no TEXT,
  make_model TEXT,
  color TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE,
  source_request_id INTEGER UNIQUE,
  franchisee_id INTEGER NOT NULL,
  assigned_user_id INTEGER,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER,
  service_id INTEGER,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ny' CHECK (status IN ('ny', 'bekreftet', 'pågår', 'ferdig', 'fakturaklar', 'fakturert', 'avlyst')),
  scheduled_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  address TEXT,
  postcode TEXT,
  city TEXT,
  notes TEXT,
  price_ex_vat INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 25,
  invoice_status TEXT NOT NULL DEFAULT 'ikke_klar' CHECK (invoice_status IN ('ikke_klar', 'klar', 'sendt', 'betalt', 'forfalt')),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_request_id) REFERENCES booking_requests(id),
  FOREIGN KEY (franchisee_id) REFERENCES franchisees(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE,
  order_id INTEGER NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast', 'sendt', 'betalt', 'kreditert', 'forfalt')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  buyer_reference TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  vat INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_services_public ON services(active, public_bookable);
CREATE INDEX IF NOT EXISTS idx_service_areas_range ON service_areas(postcode_from, postcode_to, active);
CREATE INDEX IF NOT EXISTS idx_service_areas_prefix ON service_areas(postcode_prefix, active);
CREATE INDEX IF NOT EXISTS idx_service_areas_franchisee ON service_areas(franchisee_id, active);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability_blocks(franchisee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_requests_franchisee_date ON booking_requests(franchisee_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_requests_status ON booking_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_ip ON booking_requests(source_ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_franchisee ON customers(franchisee_id);
CREATE INDEX IF NOT EXISTS idx_orders_franchisee_date ON orders(franchisee_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
