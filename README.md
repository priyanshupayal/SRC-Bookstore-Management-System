# 📚 SRC Bookstore Management System

A robust, enterprise-grade full-stack Bookstore Management & Inventory ERP designed for Microsoft SQL Server, Node.js/Express, and React + Vite.

---

## 🌟 Key Features & Business Modules

### 1. 📊 Operations Dashboard
- Real-time inventory valuation and catalog metrics.
- Active receivables and outstanding credit tracking.
- Stock movements audit ledger with live event logging.
- Low-stock threshold alerting to prevent stockouts.

### 2. 📦 Live Inventory & Product Catalog
- Multi-variant book tracking (Hardcover, Paperback, Digital).
- Real-time stock counts (`quantity_on_hand`, `reorder_point`).
- Dynamic search by title, ISBN, category, and format.
- Price valuation, selling price, and reorder status indicators.

### 3. 🚚 Procurement & Goods Receipt (GRN)
- End-to-end procurement lifecycle: **Purchase Order → Shipment → GRN Verification → Inward Stock Movement**.
- Supplier selection with calculated order totals and scheduled delivery dates.
- Formal GRN creation with accepted/rejected quantity verification.
- Automated inventory inward posting and audit movement logging.

### 4. 🛒 Sales Orders & Payments Processing
- Point-of-Sale (POS) order entry supporting **Retail Counter Sales**, **Institutional Bulk Orders**, and **Customer Credit Accounts**.
- Live stock availability checks preventing overselling.
- Multi-method payments: Cash, Digital (UPI, Cards, Bank Transfer) with transaction references.
- Official sequential sales receipts registry with receipt viewing and print inspection.

### 5. 💳 Credit Receivables & Settlements
- Debtor receivables management with credit limit and repayment terms.
- Partial installment and full settlement workflows.
- Automated receipt issuance per settlement payment.
- Overpayment protection and remaining balance recalculation.

### 6. ⚠️ Damaged Stock Write-offs
- Inventory write-off recording for damaged, expired, or defective publications.
- Permanent inventory deduction with negative stock movement audit trails.
- Separation of draft logging and final write-off authorization.

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite | Modular component architecture, Lucide Icons, responsive vanilla CSS design system |
| **Backend** | Node.js, Express | RESTful API, parameterized SQL queries, atomic transactional protection |
| **Database** | Microsoft SQL Server | Relational schema (`SRC_Bookstore`), stored procedures, strict constraints |
| **Driver** | `mssql` (Tedious) | High-performance pooled SQL Server connection |

---

## 🏗️ System Architecture

```
SRC Bookstore Management System
├── docs/                                # Final schema definitions and documentation
│   └── SRC_Bookstore_Final_Database_Schema.xlsx
├── backend/                             # Express REST API Server
│   ├── src/
│   │   ├── config/                      # Database connection pool (mssql)
│   │   ├── controllers/                 # Business logic & SQL controllers
│   │   ├── routes/                      # API endpoint routing
│   │   ├── app.js                       # Express middleware & app config
│   │   └── server.js                    # Server entrypoint (Port 5000)
│   ├── .env.example                     # Environment template
│   └── package.json
└── frontend/                            # React + Vite Single-Page Application
    ├── src/
    │   ├── components/                  # View components (Dashboard, Sales, Purchases, Credit, Inventory)
    │   ├── api.js                       # Frontend HTTP client service
    │   ├── index.css                    # Unified modern design system
    │   ├── App.jsx                      # Root application layout & state
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js                   # Vite dev server with proxy to /api (Port 3000)
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18.0.0 or later)
- **npm** (v9.0.0 or later)
- **Microsoft SQL Server** (2019 / 2022 / Express / LocalDB) with `SRC_Bookstore` database configured.

---

### 1. Database Setup
Ensure Microsoft SQL Server is running and the `SRC_Bookstore` database schema is initialized.

---

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` configuration from the example:
   ```bash
   cp .env.example .env
   ```
4. Configure your database connection in `.env`:
   ```env
   PORT=5000
   DB_SERVER=localhost
   DB_PORT=1433
   DB_NAME=SRC_Bookstore
   DB_USER=src_bookstore_app
   DB_PASSWORD=your_secure_password_here
   DB_ENCRYPT=false
   DB_TRUST_SERVER_CERTIFICATE=true
   ```
5. Start the backend server:
   ```bash
   npm run dev
   ```
   *The API will be available at `http://localhost:5000`.*

---

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The application UI will be accessible at `http://localhost:3000`.*

---

## 📡 API Reference Summary

### Health & Analytics
- `GET /api/health` — System status and SQL Server connection latency
- `GET /api/dashboard/stats` — High-level KPI metrics (inventory valuation, sales, receivables)
- `GET /api/dashboard/recent-activity` — Recent stock movements ledger

### Inventory
- `GET /api/inventory` — Filterable product catalog (`search`, `category`, `status`, `sortBy`, `sortDir`)
- `GET /api/inventory/categories` — Distinct product categories

### Procurement & GRN
- `GET /api/purchases/suppliers` — Supplier directory
- `GET /api/purchases/variants` — Product variants with unit costs
- `GET /api/purchases/orders` — Purchase orders list
- `POST /api/purchases/orders` — Create new purchase order
- `POST /api/purchases/shipments` — Record incoming shipment
- `GET /api/purchases/grns` — List Goods Received Notes
- `POST /api/purchases/grns` — Create GRN
- `POST /api/purchases/grns/:id/verify` — Verify GRN and post inward inventory

### Sales & Payments
- `GET /api/sales/customers` — Customer accounts directory
- `GET /api/sales` — Sales orders list with balances
- `GET /api/sales/receipts` — Global receipts registry ledger
- `GET /api/sales/:id` — Sale details with items, payments, and receipts
- `POST /api/sales` — Create new draft sale order
- `POST /api/sales/:id/complete` — Deduct live inventory and complete sale
- `POST /api/sales/:id/payments` — Record payment and issue official receipt

### Credit & Receivables
- `GET /api/credit/receivables` — Receivables ledger
- `GET /api/credit/eligible-sales` — Completed credit sales awaiting receivable terms
- `POST /api/credit/receivables` — Establish credit receivable
- `POST /api/credit/receivables/:id/settle` — Record installment/full settlement payment
- `GET /api/credit/receivables/:id/receipts` — Settlement receipts for account

### Stock Write-offs
- `GET /api/writeoffs` — Damaged stock write-off records
- `POST /api/writeoffs` — Draft damaged stock write-off
- `POST /api/writeoffs/:id/process` — Authorize write-off and post negative stock movement

---

## 🔒 Security Best Practices
- **Credential Protection**: Real `.env` files are excluded from Git version control. Only `.env.example` with sanitized placeholders is committed.
- **Parameterized SQL**: All API endpoints use parameterized queries and stored procedures to prevent SQL injection.
- **Transactional Atomicity**: Complex multi-table writes (orders, inventory deductions, receipts) are wrapped in atomic SQL transactions (`sql.Transaction`) with concurrency table locks.

---

## 📄 License
This project is proprietary and confidential. Developed for the SRC Bookstore Management System demonstration.
