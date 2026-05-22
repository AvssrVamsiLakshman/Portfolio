#!/bin/bash

# ==============================================================================
#            PORTFOLIO SERVER REAL-TIME MONITOR & DASHBOARD
# ==============================================================================

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

LOG_FILE="visitors.log"

# Create log file if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
    touch "$LOG_FILE"
fi

# Function to clear screen and print terminal header
print_header() {
    clear
    echo -e "${RED}${BOLD}======================================================================${NC}"
    echo -e "${WHITE}${BOLD}               AVSSR PORTFOLIO REAL-TIME SERVER MONITOR                ${NC}"
    echo -e "${RED}${BOLD}======================================================================${NC}"
    echo -e "Server Time: $(date '+%Y-%m-%d %H:%M:%S') | Logging File: ${CYAN}${LOG_FILE}${NC}"
    
    # Calculate statistics from log file
    local total_views=$(grep -c "VISIT" "$LOG_FILE" 2>/dev/null || echo 0)
    local total_regs=$(grep -c "REGISTER" "$LOG_FILE" 2>/dev/null || echo 0)
    local total_warns=$(grep -c -E "WARN|ERROR" "$LOG_FILE" 2>/dev/null || echo 0)

    echo -e "----------------------------------------------------------------------"
    echo -e "  📊 STATS BAR:  Total Page Views: ${CYAN}${BOLD}${total_views}${NC}  |  Registrations: ${GREEN}${BOLD}${total_regs}${NC}  |  Alert Warnings: ${YELLOW}${BOLD}${total_warns}${NC}"
    echo -e "----------------------------------------------------------------------"
    echo -e "${YELLOW}Waiting for server logs... (Press Ctrl+C to exit)${NC}"
    echo ""
}

# Print header on launch
print_header

# Continuously tail and process log entries (streams from beginning to load history)
tail -n +1 -f "$LOG_FILE" | while read -r line; do
    # Log entry pattern: [YYYY-MM-DD HH:mm:ss] TYPE | IP: ip | details
    
    # Extract timestamp, type, IP, and details
    if [[ "$line" =~ ^\[([0-9: -]+)\]\ ([A-Z]+)\ \|\ IP:\ ([a-fA-F0-9.:]+)\ \|\ (.*)$ ]]; then
        timestamp="${BASH_REMATCH[1]}"
        event_type="${BASH_REMATCH[2]}"
        ip="${BASH_REMATCH[3]}"
        details="${BASH_REMATCH[4]}"
        
        case "$event_type" in
            "VISIT")
                # Clean up device details to show only browser / OS highlights
                device=""
                if [[ "$details" =~ UserAgent:\ (.*) ]]; then
                    agent="${BASH_REMATCH[1]}"
                    # Shorten agent for cleaner layout
                    if [[ "$agent" =~ Chrome/([0-9.]+) ]]; then device="Chrome";
                    elif [[ "$agent" =~ Safari/([0-9.]+) ]]; then device="Safari";
                    elif [[ "$agent" =~ Firefox/([0-9.]+) ]]; then device="Firefox";
                    else device="Mobile/WebBrowser"; fi
                fi
                echo -e "[${BLUE}${timestamp}${NC}]  ${BLUE}• VISIT${NC}      | IP: ${CYAN}${ip}${NC} | Accessed portfolio via ${WHITE}${device}${NC}"
                ;;
                
            "REGISTER")
                # Parse Name, Phone, and Email fields from details string
                name="Unknown"
                phone="Unknown"
                email="Unknown"
                
                if [[ "$details" =~ Name:\ ([^|]+) ]]; then name=$(echo "${BASH_REMATCH[1]}" | xargs); fi
                if [[ "$details" =~ Phone:\ ([^|]+) ]]; then phone=$(echo "${BASH_REMATCH[1]}" | xargs); fi
                if [[ "$details" =~ Email:\ ([^|]+) ]]; then email=$(echo "${BASH_REMATCH[1]}" | xargs); fi
                
                # Render a gorgeous double-lined highlight box for registrations
                echo ""
                echo -e "  ${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
                echo -e "  ${GREEN}${BOLD}║ ★ NEW PORTFOLIO REGISTRATION DETECTED                            ║${NC}"
                echo -e "  ${GREEN}${BOLD}╠══════════════════════════════════════════════════════════════════╣${NC}"
                printf "  ${GREEN}${BOLD}║${NC}  %-14s : ${WHITE}%-45s${NC}${GREEN}${BOLD}║${NC}\n" "Timestamp" "$timestamp"
                printf "  ${GREEN}${BOLD}║${NC}  %-14s : ${CYAN}%-45s${NC}${GREEN}${BOLD}║${NC}\n" "IP Address" "$ip"
                printf "  ${GREEN}${BOLD}║${NC}  %-14s : ${WHITE}${BOLD}%-45s${NC}${GREEN}${BOLD}║${NC}\n" "Full Name" "$name"
                printf "  ${GREEN}${BOLD}║${NC}  %-14s : ${YELLOW}%-45s${NC}${GREEN}${BOLD}║${NC}\n" "Phone Number" "$phone"
                printf "  ${GREEN}${BOLD}║${NC}  %-14s : ${CYAN}%-45s${NC}${GREEN}${BOLD}║${NC}\n" "Email Address" "$email"
                echo -e "  ${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
                echo ""
                ;;
                
            "SUCCESS")
                echo -e "[${GREEN}${timestamp}${NC}]  ${GREEN}✔ SUCCESS${NC}    | IP: ${CYAN}${ip}${NC} | ${GREEN}${details}${NC}"
                ;;
                
            "WARN")
                echo -e "[${YELLOW}${timestamp}${NC}]  ${YELLOW}⚠ WARNING${NC}    | IP: ${CYAN}${ip}${NC} | ${YELLOW}${details}${NC}"
                ;;
                
            "ERROR")
                echo -e "[${RED}${timestamp}${NC}]  ${RED}✘ ERROR${NC}      | IP: ${CYAN}${ip}${NC} | ${RED}${details}${NC}"
                ;;
                
            *)
                echo -e "[${timestamp}]  ${event_type} | IP: ${ip} | ${details}"
                ;;
        esac
    else
        # Fallback for plain lines
        echo -e "${WHITE}${line}${NC}"
    fi
done
