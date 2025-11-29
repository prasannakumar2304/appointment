// ============================================
// GOOGLE CALENDAR API INTEGRATION
// ============================================

const { google } = require('googleapis');

// OAuth2 Client Setup
function getOAuth2Client() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
  }

  return oauth2Client;
}

// Get Calendar Instance
function getCalendar() {
  try {
    const auth = getOAuth2Client();
    return google.calendar({ version: 'v3', auth });
  } catch (error) {
    console.warn('⚠️  Google Calendar not configured:', error.message);
    return null;
  }
}

// ----------------------
// LIST CALENDARS
// ----------------------
async function listCalendars() {
  const calendar = getCalendar();
  if (!calendar) {
    throw new Error('Google Calendar not configured');
  }

  try {
    const response = await calendar.calendarList.list();
    return response.data.items;
  } catch (error) {
    console.error('Error listing calendars:', error.message);
    throw error;
  }
}

// ----------------------
// GET FREE/BUSY INFO
// ----------------------
async function getFreeBusy(calendarId, timeMin, timeMax) {
  const calendar = getCalendar();
  if (!calendar) {
    console.warn('Calendar not configured, returning empty busy periods');
    return { busy: [] };
  }

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: 'Asia/Kolkata',
        items: [{ id: calendarId }]
      }
    });

    const busyPeriods = response.data.calendars[calendarId]?.busy || [];
    return { busy: busyPeriods };
    
  } catch (error) {
    console.error('Error checking free/busy:', error.message);
    return { busy: [] };
  }
}

// ----------------------
// CREATE CALENDAR EVENT
// ----------------------
async function createEvent(calendarId, eventData) {
  const calendar = getCalendar();
  if (!calendar) {
    console.warn('Calendar not configured, skipping event creation');
    return { id: 'manual-' + Date.now(), htmlLink: null };
  }

  try {
    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: eventData.start,
        end: eventData.end,
        attendees: eventData.attendees || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 }
          ]
        },
        conferenceData: eventData.conferenceData || null
      },
      conferenceDataVersion: eventData.conferenceData ? 1 : 0,
      sendUpdates: 'all'
    });

    console.log('✅ Calendar event created:', response.data.id);
    return response.data;
    
  } catch (error) {
    console.error('Error creating event:', error.message);
    throw error;
  }
}

// ----------------------
// UPDATE CALENDAR EVENT
// ----------------------
async function updateEvent(calendarId, eventId, eventData) {
  const calendar = getCalendar();
  if (!calendar) {
    throw new Error('Google Calendar not configured');
  }

  try {
    const response = await calendar.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: eventData,
      sendUpdates: 'all'
    });

    console.log('✅ Calendar event updated:', response.data.id);
    return response.data;
    
  } catch (error) {
    console.error('Error updating event:', error.message);
    throw error;
  }
}

// ----------------------
// DELETE CALENDAR EVENT
// ----------------------
async function deleteEvent(calendarId, eventId) {
  const calendar = getCalendar();
  if (!calendar) {
    console.warn('Calendar not configured, skipping event deletion');
    return { deleted: true };
  }

  try {
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
      sendUpdates: 'all'
    });

    console.log('✅ Calendar event deleted:', eventId);
    return { deleted: true };
    
  } catch (error) {
    console.error('Error deleting event:', error.message);
    throw error;
  }
}

// ----------------------
// GET EVENT BY ID
// ----------------------
async function getEvent(calendarId, eventId) {
  const calendar = getCalendar();
  if (!calendar) {
    throw new Error('Google Calendar not configured');
  }

  try {
    const response = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    });

    return response.data;
    
  } catch (error) {
    console.error('Error getting event:', error.message);
    throw error;
  }
}

// ----------------------
// LIST EVENTS
// ----------------------
async function listEvents(calendarId, timeMin, timeMax) {
  const calendar = getCalendar();
  if (!calendar) {
    throw new Error('Google Calendar not configured');
  }

  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });

    return response.data.items || [];
    
  } catch (error) {
    console.error('Error listing events:', error.message);
    throw error;
  }
}

// ----------------------
// CREATE VIDEO CONFERENCE
// ----------------------
async function createVideoConference(calendarId, eventData) {
  const calendar = getCalendar();
  if (!calendar) {
    throw new Error('Google Calendar not configured');
  }

  try {
    const conferenceData = {
      createRequest: {
        requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    };

    const response = await calendar.events.insert({
      calendarId: calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        ...eventData,
        conferenceData: conferenceData
      },
      sendUpdates: 'all'
    });

    console.log('✅ Video conference created:', response.data.hangoutLink);
    return response.data;
    
  } catch (error) {
    console.error('Error creating video conference:', error.message);
    throw error;
  }
}

// ----------------------
// EXPORT FUNCTIONS
// ----------------------
module.exports = {
  getOAuth2Client,
  getCalendar,
  listCalendars,
  getFreeBusy,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  listEvents,
  createVideoConference
};