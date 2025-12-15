#!/bin/bash

# FINMODAI Startup Script
# Provides easy access to all FINMODAI features

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║                  🚀  F I N M O D A I  🚀                     ║"
echo "║                                                               ║"
echo "║        Elite Private-Equity-Grade Financial Analysis         ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Function to display menu
show_menu() {
    echo -e "${CYAN}Select an option:${NC}\n"
    echo -e "  ${GREEN}1${NC}) 🌐 Start Web Interface (Recommended)"
    echo -e "  ${GREEN}2${NC}) 🔌 Start REST API Server"
    echo -e "  ${GREEN}3${NC}) 💬 Interactive Demo (Terminal)"
    echo -e "  ${GREEN}4${NC}) 📊 Run All Examples"
    echo -e "  ${GREEN}5${NC}) 🧪 Run Specific Example"
    echo -e "  ${GREEN}6${NC}) ❓ Custom Query"
    echo -e "  ${GREEN}7${NC}) 📖 View Documentation"
    echo -e "  ${GREEN}8${NC}) ✅ Check Dependencies"
    echo -e "  ${GREEN}9${NC}) 🔧 Install Dependencies"
    echo -e "  ${GREEN}0${NC}) 🚪 Exit"
    echo ""
}

# Function to check if Python is available
check_python() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Python 3 is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Python 3 found: $(python3 --version)${NC}"
}

# Function to check dependencies
check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}\n"
    
    DEPS=("pandas" "numpy" "fastapi" "uvicorn" "flask" "pydantic")
    MISSING=()
    
    for dep in "${DEPS[@]}"; do
        if python3 -c "import $dep" 2>/dev/null; then
            echo -e "  ${GREEN}✅${NC} $dep"
        else
            echo -e "  ${RED}❌${NC} $dep"
            MISSING+=("$dep")
        fi
    done
    
    if [ ${#MISSING[@]} -eq 0 ]; then
        echo -e "\n${GREEN}✅ All dependencies installed!${NC}"
        return 0
    else
        echo -e "\n${YELLOW}⚠️  Missing dependencies: ${MISSING[*]}${NC}"
        echo -e "${YELLOW}Run option 9 to install dependencies${NC}"
        return 1
    fi
}

# Function to install dependencies
install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}\n"
    
    pip3 install pandas numpy fastapi uvicorn flask pydantic
    
    echo -e "\n${GREEN}✅ Dependencies installed!${NC}"
}

# Function to start web interface
start_web() {
    echo -e "${CYAN}Starting Web Interface...${NC}\n"
    echo -e "${YELLOW}The web interface will be available at:${NC}"
    echo -e "${GREEN}http://localhost:5001${NC}\n"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"
    
    python3 finmodai_web.py
}

# Function to start API
start_api() {
    echo -e "${CYAN}Starting REST API Server...${NC}\n"
    echo -e "${YELLOW}API will be available at:${NC}"
    echo -e "${GREEN}http://localhost:8001${NC}"
    echo -e "${YELLOW}Documentation at:${NC}"
    echo -e "${GREEN}http://localhost:8001/docs${NC}\n"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"
    
    python3 finmodai_api.py
}

# Function to start interactive demo
start_interactive() {
    echo -e "${CYAN}Starting Interactive Demo...${NC}\n"
    python3 finmodai_examples.py --interactive
}

# Function to run all examples
run_all_examples() {
    echo -e "${CYAN}Running All Examples...${NC}\n"
    python3 finmodai_examples.py --all
}

# Function to run specific example
run_specific_example() {
    echo -e "${CYAN}Available Examples:${NC}\n"
    echo "  1) DCF Valuation"
    echo "  2) 5-Year Forecast"
    echo "  3) Peer Comparison"
    echo "  4) Risk Assessment"
    echo "  5) M&A Analysis"
    echo "  6) Market Analysis"
    echo "  7) Strategic Recommendations"
    echo "  8) Quick Analysis"
    echo "  9) Batch Analysis"
    echo "  10) General Analysis"
    echo ""
    
    read -p "Enter example number (1-10): " example_num
    
    if [[ "$example_num" =~ ^[1-9]$|^10$ ]]; then
        echo -e "\n${CYAN}Running Example $example_num...${NC}\n"
        python3 finmodai_examples.py --example "$example_num"
    else
        echo -e "${RED}❌ Invalid example number${NC}"
    fi
}

# Function to run custom query
run_custom_query() {
    echo -e "${CYAN}Custom Query${NC}\n"
    
    read -p "Enter your financial question: " query
    read -p "Enter ticker (optional, press Enter to skip): " ticker
    
    if [ -z "$query" ]; then
        echo -e "${RED}❌ Query cannot be empty${NC}"
        return
    fi
    
    echo -e "\n${CYAN}Generating analysis...${NC}\n"
    
    if [ -z "$ticker" ]; then
        python3 finmodai_examples.py --query "$query"
    else
        python3 finmodai_examples.py --query "$query" --ticker "$ticker"
    fi
}

# Function to view documentation
view_docs() {
    echo -e "${CYAN}Opening Documentation...${NC}\n"
    
    if [ -f "FINMODAI_README.md" ]; then
        if command -v less &> /dev/null; then
            less FINMODAI_README.md
        elif command -v more &> /dev/null; then
            more FINMODAI_README.md
        else
            cat FINMODAI_README.md
        fi
    else
        echo -e "${RED}❌ Documentation file not found${NC}"
    fi
}

# Main script
main() {
    # Check Python
    check_python
    
    # Main loop
    while true; do
        echo ""
        show_menu
        read -p "Enter your choice: " choice
        echo ""
        
        case $choice in
            1)
                start_web
                ;;
            2)
                start_api
                ;;
            3)
                start_interactive
                ;;
            4)
                run_all_examples
                ;;
            5)
                run_specific_example
                ;;
            6)
                run_custom_query
                ;;
            7)
                view_docs
                ;;
            8)
                check_dependencies
                ;;
            9)
                install_dependencies
                ;;
            0)
                echo -e "${CYAN}👋 Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}❌ Invalid option${NC}"
                ;;
        esac
        
        # Pause before showing menu again
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run main function
main

