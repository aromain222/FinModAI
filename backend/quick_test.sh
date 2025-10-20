#!/bin/bash
# Quick Test Script for FinModAI Backend
# Tests all critical functionality

set -e

echo "🧪 FinModAI Quick Test"
echo "======================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Test 1: Import check
echo "Test 1: Import check..."
if python3 -c "from app import app; print('✅ App imports OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 2: Configuration check
echo "Test 2: Configuration check..."
if python3 -c "from config import settings; assert settings.JWT_SECRET; print('✅ Configuration OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 3: Database check
echo "Test 3: Database check..."
if python3 -c "from persistence.database import engine; from persistence.schema import Base; Base.metadata.create_all(bind=engine); print('✅ Database OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 4: Model generation check
echo "Test 4: Model generation check..."
if python3 -c "from models_data.generate import generate_dcf_model; print('✅ Model generation OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 5: Export check
echo "Test 5: Export check..."
if python3 -c "from exports.excel import export_dcf_to_excel; from exports.pdf import export_dcf_to_pdf; print('✅ Export OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 6: Validation check
echo "Test 6: Validation check..."
if python3 -c "from validation.rules import validate_dcf_assumptions; print('✅ Validation OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

# Test 7: Auth check
echo "Test 7: Auth check..."
if python3 -c "from auth import hash_password, verify_password, create_access_token; print('✅ Auth OK')"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi
echo ""

echo "======================"
echo -e "${GREEN}✅ All Tests Passed!${NC}"
echo "======================"
echo ""
echo "🚀 Ready to start server:"
echo "   python app.py"
echo ""

