#!/bin/bash

# ==============================================================================
#           MASTER PORTFOLIO DEPLOYMENT & AUTOMATION SCRIPT
# ==============================================================================

# ANSI Color Codes for Premium UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Clear Screen and Print Banner
clear
echo -e "${RED}${BOLD}======================================================================${NC}"
echo -e "${WHITE}${BOLD}        ★ PORTFOLIO AUTOMATION DEPLOYMENT SYSTEM (UBUNTU) ★            ${NC}"
echo -e "${RED}${BOLD}======================================================================${NC}"
echo -e "Designed to set up, install, run, and monitor your Express portfolio"
echo -e "on this Ubuntu server automatically. Perfect for creative artists."
echo -e "----------------------------------------------------------------------"
echo ""

# Ensure the script is run with sudo/root privileges for installation
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}ℹ INFO: System installations require root privileges. ${NC}"
  echo -e "Please re-run this script with ${BOLD}sudo${NC}:"
  echo -e "  ${CYAN}sudo ./setup.sh${NC}"
  exit 1
fi

# Step 1: Git Repository & Cloning Setup
echo -e "${BLUE}${BOLD}[STEP 1] Project Directory Setup${NC}"
echo -e "----------------------------------"

if [ -f "server.js" ] && [ -f "index.html" ]; then
    echo -e "${GREEN}✔ Found portfolio files in the current directory.${NC}"
    echo -e "Skipping Git clone. Configuring existing workspace..."
    PROJECT_DIR=$(pwd)
else
    echo -e "No existing portfolio files found. Preparing fresh repository clone."
    read -p "Enter your Git Repository URL to clone: " GIT_URL
    if [ -z "$GIT_URL" ]; then
        echo -e "${RED}✘ Error: A Git Repository URL is required to clone. Exiting.${NC}"
        exit 1
    fi
    
    read -p "Enter your website folder name [portfolio]: " WEB_FOLDER
    WEB_FOLDER=${WEB_FOLDER:-"portfolio"}
    
    echo -e "${YELLOW}Cloning repository into ${WEB_FOLDER}...${NC}"
    git clone "$GIT_URL" "$WEB_FOLDER"
    
    if [ ! -d "$WEB_FOLDER" ]; then
        echo -e "${RED}✘ Error: Git clone failed. Please verify your repository URL.${NC}"
        exit 1
    fi
    
    cd "$WEB_FOLDER"
    PROJECT_DIR=$(pwd)
fi
echo ""

# Step 2: Fetch Public IP automatically
echo -e "${BLUE}${BOLD}[STEP 2] Fetching Network Public IP${NC}"
echo -e "-------------------------------------"
echo -e "Querying secure API servers for your public IP address..."
PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s ifconfig.me || echo "Unknown")

if [ "$PUBLIC_IP" != "Unknown" ]; then
    echo -e "${GREEN}✔ Successfully detected server Public IP: ${BOLD}${PUBLIC_IP}${NC}"
else
    echo -e "${YELLOW}⚠ Could not fetch Public IP automatically.${NC}"
    read -p "Please enter your server's Public IP address manually: " PUBLIC_IP
fi
echo ""

# Step 3: Ask for Website Name
echo -e "${BLUE}${BOLD}[STEP 3] Setting Website Identity${NC}"
echo -e "-----------------------------------"
read -p "Enter your website / portfolio title [Avssr Vamsi Lakshman Portfolio]: " WEBSITE_NAME
WEBSITE_NAME=${WEBSITE_NAME:-"Avssr Vamsi Lakshman Portfolio"}
echo -e "${GREEN}✔ Website Name set to: ${WHITE}${WEBSITE_NAME}${NC}"
echo ""

# Step 4: Install System Dependencies
echo -e "${BLUE}${BOLD}[STEP 4] Installing System Requirements (Node.js & PM2)${NC}"
echo -e "--------------------------------------------------------"
echo -e "Updating system package list..."
apt-get update -y >/dev/null

# Install curl and git if missing
if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Installing curl...${NC}"
    apt-get install -y curl >/dev/null
fi
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Installing git...${NC}"
    apt-get install -y git >/dev/null
fi

# Install Node.js & NPM
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js and NPM...${NC}"
    # Setup NodeSource repository for latest stable Node
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y nodejs >/dev/null
    echo -e "${GREEN}✔ Installed Node.js version: $(node -v)${NC}"
else
    echo -e "${GREEN}✔ Node.js already installed: $(node -v)${NC}"
fi

# Install PM2 Process Manager globally
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2 (Production Process Supervisor)...${NC}"
    npm install -g pm2 >/dev/null
    echo -e "${GREEN}✔ PM2 installed successfully.${NC}"
else
    echo -e "${GREEN}✔ PM2 already installed: $(pm2 -v)${NC}"
fi
echo ""

# Step 5: Configure Environmental Variables (.env)
echo -e "${BLUE}${BOLD}[STEP 5] Configuring App Environment & Email Alerts${NC}"
echo -e "------------------------------------------------------"
ENV_FILE="${PROJECT_DIR}/.env"

# Build default env structure
cat <<EOT > "$ENV_FILE"
PORT=3000
EMAIL_TO=lakshmanvamsi008@gmail.com
EOT

echo -e "To receive real-time email alerts when visitors view your page,"
echo -e "you can configure your SMTP email account now."
read -p "Would you like to set up email alerts now? (Recommended) [y/N]: " SET_SMTP

if [[ "$SET_SMTP" =~ ^[Yy]$ ]]; then
    read -p "Enter your alert sender Email (Gmail): " SMTP_USER
    read -p "Enter your Google App Password (16-character code): " SMTP_PASS
    
    # Save details into .env
    cat <<EOT >> "$ENV_FILE"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
EOT
    echo -e "${GREEN}✔ Email alerts configured successfully!${NC}"
else
    cat <<EOT >> "$ENV_FILE"
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EOT
    echo -e "${YELLOW}⚠ Skipping email alerts. (Logs will still track all visits in the terminal!)${NC}"
fi
echo ""

# Step 6: Launch Backend under PM2 Service
echo -e "${BLUE}${BOLD}[STEP 6] Deploying Portfolio Server under PM2 supervision${NC}"
echo -e "---------------------------------------------------------"
echo -e "Installing local npm dependencies..."
npm install >/dev/null

# Get standard non-root user who called sudo to execute the terminal monitor
SUDO_USER_NAME=${SUDO_USER:-$(whoami)}

# Clean up PM2 if old process exists
sudo -u "$SUDO_USER_NAME" pm2 delete portfolio &>/dev/null || true

echo -e "Starting server.js with PM2..."
sudo -u "$SUDO_USER_NAME" pm2 start server.js --name "portfolio"

# Configure PM2 to launch on system reboots automatically
echo -e "Configuring PM2 reboot persistence service..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$SUDO_USER_NAME" --hp "/home/$SUDO_USER_NAME" >/dev/null 2>&1 || true
sudo -u "$SUDO_USER_NAME" pm2 save >/dev/null
echo -e "${GREEN}✔ Server is active and running in the background!${NC}"
echo -e "${GREEN}✔ Reboot survival enabled. PM2 will auto-boot on system startup.${NC}"
echo ""

# Step 7: Configure Automated Daily Updates (2:00 AM Local Time)
echo -e "${BLUE}${BOLD}[STEP 7] Configuring Daily Auto-Updater (2:00 AM)${NC}"
echo -e "--------------------------------------------------------"
UPDATE_SCRIPT="${PROJECT_DIR}/pull_update.sh"

# Create pull_update.sh dynamically
cat <<EOT > "$UPDATE_SCRIPT"
#!/bin/bash
cd "${PROJECT_DIR}"
echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Auto-update started..." >> update.log
git pull >> update.log 2>&1
npm install >> update.log 2>&1
pm2 restart portfolio >> update.log 2>&1
echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Auto-update complete." >> update.log
EOT

# Adjust executing permissions and user ownership
chmod +x "$UPDATE_SCRIPT"
chown "$SUDO_USER_NAME:$SUDO_USER_NAME" "$UPDATE_SCRIPT" 2>/dev/null || true

# Setup Crontab for the standard non-root user (so PM2 commands restart correctly in user-space)
(crontab -u "$SUDO_USER_NAME" -l 2>/dev/null | grep -v "pull_update.sh"; echo "0 2 * * * ${UPDATE_SCRIPT}") | crontab -u "$SUDO_USER_NAME" -
echo -e "${GREEN}✔ Daily cron job scheduled for user ${WHITE}${SUDO_USER_NAME}${GREEN} at 2:00 AM local time.${NC}"
echo -e "  All daily git pull results will log directly to ${CYAN}update.log${NC}"
echo ""

# Step 8: Configure Startup Auto-Launch & Live Terminal Dashboard
echo -e "${BLUE}${BOLD}[STEP 8] Configuring Autostart & Launching Monitor Terminal${NC}"
echo -e "------------------------------------------------------------"
echo -e "Adjusting permissions for monitor.sh..."
chmod +x monitor.sh

# Create GNOME Terminal autostart shortcut for Ubuntu Desktop login
AUTOSTART_DIR="/home/${SUDO_USER_NAME}/.config/autostart"
if [ -d "/home/${SUDO_USER_NAME}" ]; then
    echo -e "Configuring desktop autostart to open monitor terminal on login..."
    mkdir -p "$AUTOSTART_DIR"
    cat <<EOT > "${AUTOSTART_DIR}/portfolio-monitor.desktop"
[Desktop Entry]
Type=Application
Name=Portfolio Live Monitor
Comment=Launches the portfolio live terminal monitor on login
Exec=gnome-terminal -- bash -c "cd ${PROJECT_DIR} && ./monitor.sh; exec bash"
Icon=utilities-terminal
Terminal=true
X-GNOME-Autostart-enabled=true
EOT
    # Ensure correct permissions and ownership so standard user can run it
    chmod +x "${AUTOSTART_DIR}/portfolio-monitor.desktop"
    chown -R "${SUDO_USER_NAME}:${SUDO_USER_NAME}" "$AUTOSTART_DIR"
    echo -e "${GREEN}✔ Configured GUI Desktop Autostart! The monitor terminal will automatically pop open upon user login.${NC}"
else
    echo -e "${YELLOW}⚠ Standard user home folder not found. Skipping GUI Desktop Autostart setup.${NC}"
fi

echo -e "${GREEN}✔ Deployment complete! Launching live visitor monitor...${NC}"
sleep 2

# Exec as standard user so the monitor has appropriate user-space terminal settings
sudo -u "$SUDO_USER_NAME" ./monitor.sh
