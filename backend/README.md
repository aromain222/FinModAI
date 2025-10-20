# FinModAI Backend - FastAPI Application

Professional financial modeling platform with real-time data integration.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Required
JWT_SECRET=your-256-bit-secret-here-change-in-production

# Optional (with defaults)
DATA_MODE=production
DATA_STALENESS_MAX_MIN=30
REQUIRE_MIN_FUND_YEARS=3
DATABASE_URL=sqlite:///./finmodai.db
DEBUG=True

# API Keys (optional)
ALPHAVANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
POLYGON_API_KEY=your_key_here
```

### 3. Initialize Database

```bash
python -c "from persistence.database import init_db; init_db()"
```

### 4. Run the Server

```bash
python app.py
```

Or with uvicorn directly:

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 5. Test the API

```bash
# Health check
curl http://localhost:8000/health

# API docs
open http://localhost:8000/api/docs
```

---

## 📚 API Endpoints

### Authentication

#### Sign Up
```bash
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

#### Login
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### Get Current User
```bash
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Model Generation

#### Generate DCF Model
```bash
POST /api/v1/models/generate
Content-Type: application/json

{
  "model_type": "dcf",
  "ticker": "AAPL",
  "custom_assumptions": {
    "wacc": 0.095,
    "terminal_growth": 0.025,
    "revenue_cagr_1_5": 0.07,
    "capex_pct_sales": 0.05,
    "delta_nwc_pct_sales": 0.01
  }
}
```

#### Get Model
```bash
GET /api/v1/models/{model_id}
```

#### Download Excel
```bash
GET /api/v1/models/{model_id}/excel
```

#### Download PDF
```bash
GET /api/v1/models/{model_id}/pdf
```

#### Delete Model
```bash
DELETE /api/v1/models/{model_id}
```

---

## 🏗️ Architecture

### Project Structure

```
backend/
├── app.py                 # FastAPI application
├── config.py              # Configuration
├── requirements.txt       # Dependencies
├── auth/                  # Authentication
│   ├── models.py
│   ├── jwt.py
│   └── hashing.py
├── persistence/           # Database
│   ├── database.py
│   └── schema.py
├── models_data/           # Model generation
│   ├── bundles.py
│   └── generate.py
├── api/v1/                # API endpoints
│   ├── auth.py
│   └── models.py
├── exports/               # Export generation (TODO)
│   ├── excel.py
│   └── pdf.py
└── tests/                 # Tests (TODO)
```

### Data Flow

```
User Request
    ↓
FastAPI Router
    ↓
Authentication (JWT)
    ↓
Model Generation
    ↓
Data Fetching (minimal_app.py)
    ↓
Model Execution (generate.py)
    ↓
Results Storage (Database)
    ↓
Response (JSON/Excel/PDF)
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Required | Secret key for JWT tokens (min 32 chars) |
| `DATA_MODE` | `production` | Data mode: production or test |
| `DATA_STALENESS_MAX_MIN` | `30` | Max data age in minutes |
| `REQUIRE_MIN_FUND_YEARS` | `3` | Min years of historical data |
| `DATABASE_URL` | `sqlite:///./finmodai.db` | Database connection string |
| `DEBUG` | `False` | Enable debug mode |
| `JWT_EXPIRATION_HOURS` | `24` | JWT token expiration |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |

---

## 🧪 Testing

### Manual Testing

```bash
# Test configuration
python config.py

# Test database
python -c "from persistence.database import init_db; init_db(); print('✅ Database initialized')"

# Test auth
python -c "from auth import hash_password, verify_password; h = hash_password('test123'); print('Hash:', h); print('Verify:', verify_password('test123', h))"

# Test JWT
python -c "from auth.jwt import create_access_token, verify_token; t = create_access_token({'sub': 'user123', 'email': 'test@example.com'}); print('Token:', t); print('Verify:', verify_token(t))"
```

### API Testing with curl

```bash
# Sign up
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Generate DCF model
curl -X POST http://localhost:8000/api/v1/models/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"model_type":"dcf","ticker":"AAPL"}'
```

---

## 📊 Database Schema

### Users Table
- `id` (UUID) - Primary key
- `email` (String) - Unique email
- `email_hash` (String) - Email hash
- `password_hash` (String) - Bcrypt hash
- `name` (String) - User name
- `created_at` (DateTime) - Creation timestamp

### Model Runs Table
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to users
- `model_type` (String) - DCF/LBO/Comps/Merger
- `ticker` (String) - Company ticker
- `target` (String) - Target ticker (for merger)
- `created_at` (DateTime) - Creation timestamp
- `as_of_quotes` (DateTime) - Quote timestamp
- `as_of_fundamentals` (DateTime) - Fundamentals timestamp
- `stale` (Boolean) - Staleness flag
- `results_json` (JSONB) - Model results
- `inputs_json` (JSONB) - Model inputs
- `provenance_json` (JSONB) - Data provenance
- `custom_assumptions` (JSONB) - Custom assumptions
- `deleted_at` (DateTime) - Soft delete timestamp

### Files Table
- `id` (UUID) - Primary key
- `model_id` (UUID) - Foreign key to model_runs
- `kind` (String) - xlsx or pdf
- `path` (String) - File path
- `size` (Integer) - File size
- `created_at` (DateTime) - Creation timestamp

---

## 🚨 Error Handling

### Error Codes

- `validation_error` - Invalid input parameters
- `missing_fields` - Required fields missing
- `data_stale` - Data too old
- `provider_unavailable` - External API down
- `reconciliation_failed` - Data reconciliation error
- `export_failed` - Export generation failed

### Error Response Format

```json
{
  "error": "validation_error",
  "code": "invalid_request",
  "message": "Invalid request parameters",
  "details": [...],
  "request_id": "uuid"
}
```

---

## 🔒 Security

### Authentication
- JWT tokens with HS256 algorithm
- Password hashing with bcrypt
- Token expiration (24 hours default)

### Data Protection
- No dummy data in production mode
- Staleness checks enforced
- Provenance tracking for all data
- Soft delete for audit trails

### CORS
- Configurable allowed origins
- Credentials support
- Preflight handling

---

## 📈 Performance

### Caching
- In-memory TTL cache for quotes (15 min)
- In-memory TTL cache for fundamentals (24 hours)

### Database
- SQLite for development
- PostgreSQL for production
- Connection pooling
- Query optimization

---

## 🐛 Troubleshooting

### Issue: JWT_SECRET not set
**Solution**: Set `JWT_SECRET` in `.env` file (min 32 characters)

### Issue: Database connection failed
**Solution**: Check `DATABASE_URL` in `.env` file

### Issue: Import errors
**Solution**: Install dependencies with `pip install -r requirements.txt`

### Issue: Port already in use
**Solution**: Change port in `app.py` or kill existing process

### Issue: Data not available for ticker
**Solution**: Check if ticker is in SEC EDGAR database or has API data

---

## 🚀 Deployment

### Production Checklist

- [ ] Set `DEBUG=False`
- [ ] Set strong `JWT_SECRET`
- [ ] Configure `DATABASE_URL` for PostgreSQL
- [ ] Set `DATA_MODE=production`
- [ ] Configure CORS origins
- [ ] Setup SSL/TLS
- [ ] Configure logging
- [ ] Setup monitoring
- [ ] Run migrations
- [ ] Test all endpoints

### Docker (TODO)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 📝 TODO

### Week 1
- [x] Backend setup
- [x] Authentication module
- [x] Database persistence
- [x] Model generation endpoints (DCF)
- [ ] Excel export
- [ ] PDF export

### Week 2
- [ ] User authentication routes
- [ ] Model history
- [ ] Custom assumptions
- [ ] LBO/Comps/Merger models

### Week 3
- [ ] Validation guardrails
- [ ] Results visualization
- [ ] Tests
- [ ] CI/CD

---

## 📞 Support

For questions or issues:
- Check the logs for API errors
- Verify API keys are set correctly
- Test with AAPL first (has complete data)
- Check SEC EDGAR data availability

---

**Built with ❤️ for FinModAI**
