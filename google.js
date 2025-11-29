// ============================================
// GOOGLE CALENDAR INTEGRATION - google.js (IMPROVED)
// ============================================

const { google } = require('googleapis');

// ----------------------
// OAuth2 Client Setup
// ----------------------
function getOAuth2Client() {
  // Check if credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || 
      !process.env.GOOGLE_CLIENT_SECRET || 
      !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google Calendar not configured - missing environment variables');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/oauth/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return oauth2Client;
}

// ----------------------
// Get Calendar Instance
// ----------------------
function getCalendar() {
  try {
    const auth = getOAuth2Client();
    return google.calendar({ version: 'v3', auth });
  } catch (err) {
    console.error('❌ Failed to initialize Google Calendar:', err.message);
    throw err;
  }
}

// ----------------------
// Check if Calendar Integration is Available
// ----------------------
function isCalendarAvailable() {
  try {
    getOAuth2Client();
    return true;
  } catch (err) {
    return false;
  }
}

// ----------------------
// Create Calendar Event
// ----------------------
async function createEvent(calendarId, eventDetails) {
  if (!isCalendarAvailable()) {
    console.warn('⚠️  Google Calendar not configured - skipping event creation');
    return null;
  }

  try {
    const calendar = getCalendar();
    
    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: eventDetails,
      sendUpdates: 'all' // Send email invites to attendees
    });

    console.log('✅ Calendar event created:', response.data.id);
    return response.data;

  } catch (err) {
    console.error('❌ Error creating calendar event:', err.message);
    
    // Handle specific error types
    if (err.message.includes('deleted_client')) {
      throw new Error('Google OAuth client has been deleted or revoked. Please reconfigure Google Calendar integration.');
    } else if (err.message.includes('invalid_grant')) {
      throw new Error('Google OAuth token expired or invalid. Please re-authenticate Google Calendar.');
    } else if (err.message.includes('insufficient permissions')) {
      throw new Error('Insufficient permissions for Google Calendar. Please grant calendar access.');
    } else if (err.message.includes('Calendar not found')) {
      throw new Error(`Calendar "${calendarId}" not found. Please check the calendar ID.`);
    } else if (err.code === 403) {
      throw new Error('Access forbidden. Check Google Calendar API quotas and permissions.');
    } else if (err.code === 401) {
      throw new Error('Authentication failed. Google OAuth credentials may be invalid.');
    }
    
    throw err;
  }
}

// ----------------------
// Get Free/Busy Information
// ----------------------
async function getFreeBusy(calendarId, timeMin, timeMax) {
  if (!isCalendarAvailable()) {
    console.warn('⚠️  Google Calendar not configured - returning empty busy periods');
    return { busy: [] };
  }

  try {
    const calendar = getCalendar();
    
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin,
        timeMax: timeMax,
        items: [{ id: calendarId }]
      }
    });

    const calendarData = response.data.calendars[calendarId];
    
    if (!calendarData) {
      console.warn(`⚠️  No data found for calendar: ${calendarId}`);
      return { busy: [] };
    }

    console.log(`✅ Free/busy fetched for ${calendarId}: ${calendarData.busy.length} busy periods`);
    return calendarData;

  } catch (err) {
    console.error('❌ Error fetching free/busy:', err.message);
    
    // Handle specific errors
    if (err.message.includes('deleted_client')) {
      console.error('🔴 OAuth client deleted - falling back to database-only availability');
    } else if (err.message.includes('invalid_grant')) {
      console.error('🔴 OAuth token expired - falling back to database-only availability');
    } else if (err.message.includes('Calendar not found')) {
      console.error(`🔴 Calendar "${calendarId}" not found - falling back to database-only availability`);
    }
    
    // Return empty busy periods as fallback
    return { busy: [] };
  }
}

// ----------------------
// Update Calendar Event
// ----------------------
async function updateEvent(calendarId, eventId, updates) {
  if (!isCalendarAvailable()) {
    console.warn('⚠️  Google Calendar not configured - skipping event update');
    return null;
  }

  try {
    const calendar = getCalendar();
    
    const response = await calendar.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: updates,
      sendUpdates: 'all'
    });

    console.log('✅ Calendar event updated:', eventId);
    return response.data;

  } catch (err) {
    console.error('❌ Error updating calendar event:', err.message);
    throw err;
  }
}

// ----------------------
// Delete Calendar Event
// ----------------------
async function deleteEvent(calendarId, eventId) {
  if (!isCalendarAvailable()) {
    console.warn('⚠️  Google Calendar not configured - skipping event deletion');
    return null;
  }

  try {
    const calendar = getCalendar();
    
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
      sendUpdates: 'all'
    });

    console.log('✅ Calendar event deleted:', eventId);
    return true;

  } catch (err) {
    console.error('❌ Error deleting calendar event:', err.message);
    throw err;
  }
}

// ----------------------
// List Available Calendars
// ----------------------
async function listCalendars() {
  if (!isCalendarAvailable()) {
    console.warn('⚠️  Google Calendar not configured');
    return [];
  }

  try {
    const calendar = getCalendar();
    
    const response = await calendar.calendarList.list();
    
    const calendars = response.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole
    }));

    console.log(`✅ Found ${calendars.length} calendars`);
    return calendars;

  } catch (err) {
    console.error('❌ Error listing calendars:', err.message);
    throw err;
  }
}

// ----------------------
// Test Calendar Connection
// ----------------------
async function testConnection() {
  console.log('🧪 Testing Google Calendar connection...');
  
  try {
    if (!isCalendarAvailable()) {
      console.log('❌ Google Calendar not configured');
      return {
        success: false,
        error: 'Missing environment variables',
        configured: false
      };
    }

    const calendars = await listCalendars();
    
    console.log('✅ Google Calendar connection successful');
    console.log(`📅 Available calendars: ${calendars.length}`);
    
    return {
      success: true,
      configured: true,
      calendarsCount: calendars.length,
      calendars: calendars
    };

  } catch (err) {
    console.error('❌ Calendar connection test failed:', err.message);
    
    return {
      success: false,
      error: err.message,
      configured: true
    };
  }
}

// ----------------------
// Exports
// ----------------------
module.exports = {
  createEvent,
  getFreeBusy,
  updateEvent,
  deleteEvent,
  listCalendars,
  testConnection,
  isCalendarAvailable
};

// ----------------------
// Self-Test on Module Load (Optional)
// ----------------------
if (require.main === module) {
  // Run test if executed directly
  testConnection().then(result => {
    console.log('\n📊 Test Result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}
