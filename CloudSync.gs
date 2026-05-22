// ═══════════════════════════════════════════════════════════════
//  AvssrVL Portfolio — Global Cloud Sync Database (Google Apps Script)
//  Deploy as Web App: Execute as ME, Access: Anyone
// ═══════════════════════════════════════════════════════════════

// The Google Sheet acts as a persistent, free, HTTPS-accessible database.
// This script exposes GET and POST endpoints for the portfolio frontend.

// --- Configuration ---
// The script auto-creates a spreadsheet named "PortfolioCloudDB" 
// in your Google Drive on first run.

function getOrCreateSheet() {
  const SS_NAME = 'PortfolioCloudDB';
  const files = DriveApp.getFilesByName(SS_NAME);
  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SS_NAME);
  }
  
  // Ensure "registrations" sheet exists
  let regSheet = ss.getSheetByName('registrations');
  if (!regSheet) {
    regSheet = ss.insertSheet('registrations');
    regSheet.appendRow(['key', 'name', 'phone', 'email', 'company', 'sessionId', 'loginTime', 'logoutTime', 'ip', 'timestamp']);
  }
  
  // Ensure "logs" sheet exists
  let logSheet = ss.getSheetByName('logs');
  if (!logSheet) {
    logSheet = ss.insertSheet('logs');
    logSheet.appendRow(['timestamp', 'type', 'ip', 'details']);
  }
  
  // Ensure "heartbeats" sheet exists
  let hbSheet = ss.getSheetByName('heartbeats');
  if (!hbSheet) {
    hbSheet = ss.insertSheet('heartbeats');
    hbSheet.appendRow(['sessionId', 'name', 'phone', 'email', 'company', 'lastHeartbeat', 'online', 'logoutTime']);
  }
  
  // Ensure "stats" sheet exists
  let statsSheet = ss.getSheetByName('stats');
  if (!statsSheet) {
    statsSheet = ss.insertSheet('stats');
    statsSheet.appendRow(['key', 'value']);
    statsSheet.appendRow(['totalViews', '0']);
    statsSheet.appendRow(['uniqueIps', '']);
  }
  
  // Remove default "Sheet1" if it exists and is empty
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch(e) {}
  }
  
  return ss;
}

// --- GET handler: Read all data for the admin monitor ---
function doGet(e) {
  try {
    const ss = getOrCreateSheet();
    const action = (e && e.parameter && e.parameter.action) || 'readAll';
    
    if (action === 'ping') {
      return jsonResponse({ success: true, message: 'pong' });
    }
    
    if (action === 'readAll') {
      // Read registrations
      const regSheet = ss.getSheetByName('registrations');
      const regData = regSheet.getDataRange().getValues();
      const regHeaders = regData[0];
      const registrations = [];
      for (let i = 1; i < regData.length; i++) {
        const row = {};
        regHeaders.forEach((h, idx) => { row[h] = regData[i][idx]; });
        registrations.push(row);
      }
      
      // Read logs (last 80)
      const logSheet = ss.getSheetByName('logs');
      const logData = logSheet.getDataRange().getValues();
      const logHeaders = logData[0];
      const allLogs = [];
      for (let i = 1; i < logData.length; i++) {
        const row = {};
        logHeaders.forEach((h, idx) => { row[h] = logData[i][idx]; });
        allLogs.push(row);
      }
      const recentLogs = allLogs.slice(-80);
      
      // Read heartbeats
      const hbSheet = ss.getSheetByName('heartbeats');
      const hbData = hbSheet.getDataRange().getValues();
      const hbHeaders = hbData[0];
      const heartbeats = {};
      for (let i = 1; i < hbData.length; i++) {
        const row = {};
        hbHeaders.forEach((h, idx) => { row[h] = hbData[i][idx]; });
        heartbeats[row.sessionId] = row;
      }
      
      // Read stats
      const statsSheet = ss.getSheetByName('stats');
      const statsData = statsSheet.getDataRange().getValues();
      let totalViews = 0;
      let uniqueIpsStr = '';
      for (let i = 1; i < statsData.length; i++) {
        if (statsData[i][0] === 'totalViews') totalViews = parseInt(statsData[i][1]) || 0;
        if (statsData[i][0] === 'uniqueIps') uniqueIpsStr = statsData[i][1] || '';
      }
      const uniqueIpsList = uniqueIpsStr ? uniqueIpsStr.split(',').filter(x => x) : [];
      
      // Build unique visitors with online/offline status
      const now = Date.now();
      const uniqueVisitors = registrations.map(reg => {
        const hb = heartbeats[reg.sessionId];
        let isOnline = false;
        let logoutTime = reg.logoutTime || '';
        
        if (hb) {
          const lastHb = parseInt(hb.lastHeartbeat) || 0;
          isOnline = (hb.online === true || hb.online === 'true') && !hb.logoutTime && lastHb && (now - lastHb < 30000);
          if (!isOnline && hb.logoutTime) {
            logoutTime = hb.logoutTime;
          } else if (!isOnline && lastHb && !logoutTime) {
            const d = new Date(lastHb);
            logoutTime = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          }
        }
        
        return {
          name: reg.name,
          phone: reg.phone,
          email: reg.email,
          company: reg.company || 'Individual',
          timestamp: reg.timestamp || reg.loginTime,
          loginTime: reg.loginTime || reg.timestamp,
          sessionId: reg.sessionId,
          status: isOnline ? '🟢 Online' : '🔴 Offline',
          logoutTime: logoutTime || '—'
        };
      });
      
      // Count stats
      const uniqueRegsSet = new Set();
      uniqueVisitors.forEach(v => uniqueRegsSet.add((v.name + v.phone + v.email).toLowerCase()));
      
      let warns = 0;
      recentLogs.forEach(l => { if (l.type === 'WARN' || l.type === 'ERROR') warns++; });
      
      // Count total registrations and views from logs
      let totalRegs = registrations.length;
      let totalViewsFromLogs = 0;
      allLogs.forEach(l => { if (l.type === 'VISIT') totalViewsFromLogs++; });
      
      return jsonResponse({
        success: true,
        stats: {
          totalViews: Math.max(totalViews, totalViewsFromLogs),
          uniqueViews: uniqueIpsList.length,
          totalRegistrations: totalRegs,
          uniqueRegistrations: uniqueRegsSet.size,
          totalAlerts: warns
        },
        uniqueVisitors: uniqueVisitors,
        recentLogs: recentLogs
      });
    }
    
    return jsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

// --- POST handler: Write data ---
function doPost(e) {
  try {
    const ss = getOrCreateSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || '';
    
    if (action === 'register') {
      const regSheet = ss.getSheetByName('registrations');
      const safeKey = (payload.name + '_' + payload.phone + '_' + payload.email)
        .replace(/[^a-zA-Z0-9_@.]/g, '_').toLowerCase();
      
      // Check if already registered (update instead of duplicate)
      const data = regSheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === safeKey) {
          // Update existing row
          regSheet.getRange(i + 1, 6).setValue(payload.sessionId || data[i][5]);
          regSheet.getRange(i + 1, 7).setValue(payload.loginTime || data[i][6]);
          regSheet.getRange(i + 1, 8).setValue(''); // Clear logout
          found = true;
          break;
        }
      }
      
      if (!found) {
        regSheet.appendRow([
          safeKey,
          payload.name || '',
          payload.phone || '',
          payload.email || '',
          payload.company || 'Individual',
          payload.sessionId || '',
          payload.loginTime || '',
          '',  // logoutTime
          payload.ip || '',
          payload.timestamp || ''
        ]);
      }
      
      return jsonResponse({ success: true, message: 'Registration synced' });
    }
    
    if (action === 'log') {
      const logSheet = ss.getSheetByName('logs');
      logSheet.appendRow([
        payload.timestamp || '',
        payload.type || '',
        payload.ip || '',
        payload.details || ''
      ]);
      
      // Keep only last 200 log rows to prevent sheet bloat
      const totalRows = logSheet.getLastRow();
      if (totalRows > 201) {
        logSheet.deleteRows(2, totalRows - 201);
      }
      
      return jsonResponse({ success: true });
    }
    
    if (action === 'heartbeat') {
      const hbSheet = ss.getSheetByName('heartbeats');
      const data = hbSheet.getDataRange().getValues();
      let found = false;
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === payload.sessionId) {
          hbSheet.getRange(i + 1, 6).setValue(Date.now().toString());
          hbSheet.getRange(i + 1, 7).setValue('true');
          hbSheet.getRange(i + 1, 8).setValue('');
          found = true;
          break;
        }
      }
      
      if (!found) {
        hbSheet.appendRow([
          payload.sessionId || '',
          payload.name || '',
          payload.phone || '',
          payload.email || '',
          payload.company || '',
          Date.now().toString(),
          'true',
          ''
        ]);
      }
      
      return jsonResponse({ success: true });
    }
    
    if (action === 'logout') {
      const hbSheet = ss.getSheetByName('heartbeats');
      const data = hbSheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === payload.sessionId) {
          hbSheet.getRange(i + 1, 7).setValue('false');
          hbSheet.getRange(i + 1, 8).setValue(payload.logoutTime || new Date().toISOString());
          break;
        }
      }
      
      // Also update registration logoutTime
      const regSheet = ss.getSheetByName('registrations');
      const regData = regSheet.getDataRange().getValues();
      for (let i = 1; i < regData.length; i++) {
        if (regData[i][5] === payload.sessionId) {
          regSheet.getRange(i + 1, 8).setValue(payload.logoutTime || new Date().toISOString());
          break;
        }
      }
      
      return jsonResponse({ success: true });
    }
    
    if (action === 'trackView') {
      const statsSheet = ss.getSheetByName('stats');
      const data = statsSheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === 'totalViews') {
          const current = parseInt(data[i][1]) || 0;
          statsSheet.getRange(i + 1, 2).setValue(current + 1);
        }
        if (data[i][0] === 'uniqueIps') {
          const existing = data[i][1] ? data[i][1].toString().split(',').filter(x => x) : [];
          const ip = payload.ip || '';
          if (ip && !existing.includes(ip)) {
            existing.push(ip);
            statsSheet.getRange(i + 1, 2).setValue(existing.join(','));
          }
        }
      }
      
      return jsonResponse({ success: true });
    }
    
    return jsonResponse({ success: false, message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
