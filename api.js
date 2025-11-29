// ============================================
// COMPLETE BACKEND API - api.js
// ============================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const Doctor = require('./Doctor');
const Patient = require('./Patient');
const Appointment = require('./Appointment');

const { getFreeBusy, createEvent, listCalendars } = require('./google');

// ----------------------
// Middleware - API Key Authentication
// ----------------------
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!process.env.API_KEY) return next();
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ----------------------
// Email Configuration
// ----------------------
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  
  console.log('📧 Configuring Email Transport...');
  
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  SMTP not fully configured - emails will be skipped');
    return null;
  }
  
  const config = {
    host: process.env.SMTP_HOST.trim(),
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: (process.env.SMTP_PORT === '465'),
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASS.trim()
    },
    tls: {
      rejectUnauthorized: false
    }
  };
  
  transporter = nodemailer.createTransport(config);
  console.log('✅ Email transport configured');
  
  return transporter;
}

// ----------------------
// Email Description Builder
// ----------------------
function buildDescriptionPayload({ patient, doctor, reason, appointmentType, paymentStatus, doctorInstructions, attachmentUrl }) {
  const now = new Date().toISOString();

  const plain = [
    `Patient Name     : ${patient.name || '-'}`,
    `Patient Email    : ${patient.email || '-'}`,
    `Patient Phone    : ${patient.phone || '-'}`,
    `Patient ID       : ${patient.patientId || '-'}`,
    `Appointment Type : ${appointmentType || 'In-Person'}`,
    `Payment Status   : ${paymentStatus || 'pending'}`,
    `Reason / Symptoms: ${reason || '-'}`,
    `Doctor Notes     : ${doctorInstructions || '-'}`,
    `Booked Through   : Medicare AI Bot`,
    `Booking Time     : ${now}`,
    attachmentUrl ? `Attachment       : ${attachmentUrl}` : ''
  ].filter(Boolean).join('\n');

  const html = `
    <h3>Appointment Details</h3>
    <table border="0" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
      <tr><td><strong>Patient Name</strong></td><td>${patient.name || '-'}</td></tr>
      <tr><td><strong>Patient Email</strong></td><td>${patient.email || '-'}</td></tr>
      <tr><td><strong>Patient Phone</strong></td><td>${patient.phone || '-'}</td></tr>
      <tr><td><strong>Patient ID</strong></td><td>${patient.patientId || '-'}</td></tr>
      <tr><td><strong>Appointment Type</strong></td><td>${appointmentType || 'In-Person'}</td></tr>
      <tr><td><strong>Payment Status</strong></td><td>${paymentStatus || 'pending'}</td></tr>
      <tr><td><strong>Reason / Symptoms</strong></td><td>${reason || '-'}</td></tr>
      <tr><td><strong>Doctor Instructions</strong></td><td>${doctorInstructions || '-'}</td></tr>
      <tr><td><strong>Booked Through</strong></td><td>Medicare AI Bot</td></tr>
      <tr><td><strong>Booking Time</strong></td><td>${now}</td></tr>
    </table>
    ${attachmentUrl ? `<p><strong>Attachment:</strong> <a href="${attachmentUrl}">View attachment</a></p>` : ''}
  `;
  return { plain, html };
}

// ----------------------
// Email Sender (Async)
// ----------------------
async function sendConfirmationEmail({ toEmail, subject, htmlBody, textBody }) {
  if (!toEmail) {
    console.log('⏩ No recipient email - skipping');
    return { skipped: true, reason: 'No recipient email' };
  }

  const mailer = getTransporter();
  if (!mailer) {
    console.log('⏩ SMTP not configured - skipping email');
    return { skipped: true, reason: 'SMTP not configured' };
  }
  
  try {
    const info = await mailer.sendMail({
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody
    });
    
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return { error: error.message };
  }
}

// ============================================
// API ROUTES
// ============================================

// ----------------------
// 1. GET ALL SPECIALTIES
// ----------------------
router.get('/specialties', async (req, res) => {
  try {
    const specialties = await Doctor.distinct('specialty');
    res.json({
      success: true,
      count: specialties.length,
      specialties: specialties.sort()
    });
  } catch (err) {
    console.error('Error fetching specialties:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 2. GET DOCTORS BY SPECIALTY
// ----------------------
router.get('/doctors/specialty/:specialty', async (req, res) => {
  try {
    const specialty = req.params.specialty;
    
    const doctors = await Doctor.find({ 
      specialty: new RegExp(`^${specialty}$`, 'i')
    }).select('doctorId name specialty qualification experience rating consultationFee availability');
    
    if (doctors.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "No doctors found for this specialty",
        specialty: specialty
      });
    }
    
    res.json({
      success: true,
      specialty: specialty,
      count: doctors.length,
      doctors: doctors
    });
    
  } catch (err) {
    console.error('Error fetching doctors:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 3. GET SINGLE DOCTOR
// ----------------------
router.get('/doctors/:doctorId', async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ doctorId: req.params.doctorId });
    
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    
    res.json({
      success: true,
      doctor: doctor
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 4. GET ALL DOCTORS
// ----------------------
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select('doctorId name specialty qualification experience rating consultationFee');
    
    res.json({
      success: true,
      count: doctors.length,
      doctors: doctors
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// HELPER: Generate Time Slots
// ----------------------
function generateAvailableSlots(date, startTime, endTime, busyPeriods = [], existingAppointments = []) {
  const slots = [];
  
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let currentMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  
  while (currentMinutes + 30 <= endMinutes) {
    const slotHour = Math.floor(currentMinutes / 60);
    const slotMinute = currentMinutes % 60;
    
    const nextMinutes = currentMinutes + 30;
    const nextHour = Math.floor(nextMinutes / 60);
    const nextMinute = nextMinutes % 60;
    
    const slotStart = `${slotHour.toString().padStart(2, '0')}:${slotMinute.toString().padStart(2, '0')}`;
    const slotEnd = `${nextHour.toString().padStart(2, '0')}:${nextMinute.toString().padStart(2, '0')}`;
    
    const slotStartISO = `${date}T${slotStart}:00+05:30`;
    const slotEndISO = `${date}T${slotEnd}:00+05:30`;
    
    const isAvailable = !isSlotConflicting(
      slotStartISO,
      slotEndISO,
      busyPeriods,
      existingAppointments
    );
    
    if (isAvailable) {
      const displayStart = formatTimeDisplay(slotHour, slotMinute);
      const displayEnd = formatTimeDisplay(nextHour, nextMinute);
      
      slots.push({
        time: `${displayStart} - ${displayEnd}`,
        startTime: slotStart,
        endTime: slotEnd,
        startISO: slotStartISO,
        endISO: slotEndISO
      });
    }
    
    currentMinutes += 30;
  }
  
  return slots;
}

function formatTimeDisplay(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
  return `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
}

function isSlotConflicting(slotStart, slotEnd, busyPeriods, existingAppointments) {
  const slotStartTime = new Date(slotStart).getTime();
  const slotEndTime = new Date(slotEnd).getTime();
  
  for (const busy of busyPeriods) {
    const busyStart = new Date(busy.start).getTime();
    const busyEnd = new Date(busy.end).getTime();
    
    if (slotStartTime < busyEnd && slotEndTime > busyStart) {
      return true;
    }
  }
  
  for (const appointment of existingAppointments) {
    const apptStart = new Date(appointment.startDateTime).getTime();
    const apptEnd = new Date(appointment.endDateTime).getTime();
    
    if (slotStartTime < apptEnd && slotEndTime > apptStart) {
      return true;
    }
  }
  
  return false;
}

// ----------------------
// 5. GET DOCTOR AVAILABILITY
// ----------------------
router.post('/doctors/:doctorId/availability', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: "Date is required (format: YYYY-MM-DD)" });
    }
    
    const doctor = await Doctor.findOne({ doctorId: req.params.doctorId });
    
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'lowercase' });
    const dayAvailability = doctor.availability[dayOfWeek];
    
    if (!dayAvailability || !dayAvailability.available) {
      return res.json({
        success: true,
        date,
        doctorId: doctor.doctorId,
        doctorName: doctor.name,
        availableSlots: [],
        message: "Doctor not available on this day"
      });
    }
    
    const timeMin = `${date}T00:00:00+05:30`;
    const timeMax = `${date}T23:59:59+05:30`;
    
    let busyPeriods = [];
    try {
      if (doctor.calendarId) {
        const freeBusy = await getFreeBusy(doctor.calendarId, timeMin, timeMax);
        busyPeriods = freeBusy.busy || [];
      }
    } catch (calErr) {
      console.warn('Calendar check skipped:', calErr.message);
    }
    
    const existingAppointments = await Appointment.find({
      doctorId: doctor.doctorId,
      date: date,
      status: { $ne: 'cancelled' }
    });
    
    const availableSlots = generateAvailableSlots(
      date,
      dayAvailability.start,
      dayAvailability.end,
      busyPeriods,
      existingAppointments
    );
    
    res.json({
      success: true,
      date,
      doctorId: doctor.doctorId,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      consultationFee: doctor.consultationFee,
      workingHours: {
        start: dayAvailability.start,
        end: dayAvailability.end
      },
      availableSlots: availableSlots,
      totalSlots: availableSlots.length
    });
    
  } catch (err) {
    console.error('Error checking availability:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 6. BOOK APPOINTMENT (OPTIMIZED)
// ----------------------
router.post('/appointments/book', requireApiKey, async (req, res) => {
  try {
    const {
      doctorId,
      patientName,
      patientEmail,
      patientPhone,
      date,
      timeSlot,
      reason,
      appointmentType = "In-Person",
      paymentOrderId,
      paymentMethod
    } = req.body;
    
    console.log('📅 Booking request:', { doctorId, patientName, date, timeSlot });
    
    // Validation
    if (!doctorId || !patientName || !date || !timeSlot) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields",
        required: ["doctorId", "patientName", "date", "timeSlot"]
      });
    }
    
    if (!patientEmail && !patientPhone) {
      return res.status(400).json({ 
        success: false,
        error: "Either email or phone is required"
      });
    }
    
    // Get doctor
    const doctor = await Doctor.findOne({ doctorId });
    if (!doctor) {
      return res.status(404).json({ 
        success: false,
        error: "Doctor not found" 
      });
    }
    
    // Create/update patient
    let patient = await Patient.findOne({ 
      $or: [
        ...(patientEmail ? [{ email: patientEmail }] : []),
        ...(patientPhone ? [{ phone: patientPhone }] : [])
      ]
    });
    
    if (!patient) {
      patient = new Patient({
        patientId: `P-${uuidv4().slice(0, 8)}`,
        name: patientName,
        email: patientEmail,
        phone: patientPhone
      });
    } else {
      patient.name = patientName;
      if (patientEmail) patient.email = patientEmail;
      if (patientPhone) patient.phone = patientPhone;
    }
    
    await patient.save();
    console.log('✅ Patient saved:', patient.patientId);
    
    // Parse time slot
    const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid time slot format. Use: HH:MM AM/PM" 
      });
    }
    
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2];
    const period = timeMatch[3].toUpperCase();
    
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    const startTime = `${hour.toString().padStart(2, '0')}:${minute}:00`;
    const endHour = hour + (minute === '30' ? 1 : 0);
    const endMinute = minute === '30' ? '00' : '30';
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute}:00`;
    
    const startDateTimeISO = `${date}T${startTime}+05:30`;
    const endDateTimeISO = `${date}T${endTime}+05:30`;
    
    // Check conflicts
    const conflictingAppointment = await Appointment.findOne({
      doctorId: doctor.doctorId,
      status: { $ne: 'cancelled' },
      $or: [
        {
          startDateTime: { $lt: new Date(endDateTimeISO) },
          endDateTime: { $gt: new Date(startDateTimeISO) }
        }
      ]
    });
    
    if (conflictingAppointment) {
      return res.status(409).json({ 
        success: false,
        error: "This time slot is no longer available",
        message: "Please select a different time"
      });
    }
    
    // Create appointment
    const appointment = new Appointment({
      appointmentId: `A-${uuidv4().slice(0, 8)}`,
      doctorId: doctor.doctorId,
      patientId: patient.patientId,
      date: date,
      startDateTime: new Date(startDateTimeISO),
      endDateTime: new Date(endDateTimeISO),
      googleEventId: 'pending',
      status: 'confirmed',
      paymentStatus: paymentOrderId ? 'pending' : 'unpaid',
      paymentOrderId: paymentOrderId || null,
      paymentMethod: paymentMethod || null,
      reason: reason || 'General consultation',
      appointmentType: appointmentType
    });
    
    await appointment.save();
    console.log('✅ Appointment created:', appointment.appointmentId);
    
    // RESPOND IMMEDIATELY
    const response = {
      success: true,
      message: "Appointment booked successfully",
      appointment: {
        appointmentId: appointment.appointmentId,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        date: date,
        time: timeSlot,
        patientName: patient.name,
        status: appointment.status,
        consultationFee: doctor.consultationFee,
        paymentStatus: appointment.paymentStatus
      },
      patient: {
        patientId: patient.patientId,
        name: patient.name,
        email: patient.email,
        phone: patient.phone
      }
    };
    
    res.json(response);
    
    // ASYNC OPERATIONS (Email + Calendar)
    setImmediate(async () => {
      try {
        console.log('🔄 Starting async operations...');
        
        // Build description
        const { plain, html } = buildDescriptionPayload({
          patient,
          doctor,
          reason,
          appointmentType,
          paymentStatus: appointment.paymentStatus,
          doctorInstructions: '',
          attachmentUrl: null
        });
        
        // Google Calendar
        let googleEvent = null;
        if (doctor.calendarId) {
          try {
            const eventObj = {
              summary: `${appointmentType} - ${patient.name}`,
              description: plain,
              start: { 
                dateTime: startDateTimeISO, 
                timeZone: doctor.timezone || 'Asia/Kolkata' 
              },
              end: { 
                dateTime: endDateTimeISO, 
                timeZone: doctor.timezone || 'Asia/Kolkata' 
              },
              attendees: [
                ...(doctor.email ? [{ email: doctor.email }] : []),
                ...(patient.email ? [{ email: patient.email }] : [])
              ]
            };
            
            googleEvent = await createEvent(doctor.calendarId, eventObj);
            
            await Appointment.updateOne(
              { appointmentId: appointment.appointmentId },
              { googleEventId: googleEvent.id }
            );
            
            console.log('✅ Calendar event created:', googleEvent.id);
          } catch (calErr) {
            console.error('❌ Calendar error:', calErr.message);
          }
        }
        
        // Send email
        if (patient.email) {
          const emailResult = await sendConfirmationEmail({
            toEmail: patient.email,
            subject: `Appointment Confirmed: Dr. ${doctor.name} on ${date}`,
            htmlBody: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
                  <h1 style="margin: 0;">✓ Appointment Confirmed</h1>
                </div>
                
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0;">
                  <p style="font-size: 16px;">Dear <strong>${patient.name}</strong>,</p>
                  
                  <p>Your appointment has been successfully confirmed!</p>
                  
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #333;">📋 Appointment Details</h3>
                    <table style="width: 100%;">
                      <tr><td><strong>Appointment ID:</strong></td><td>${appointment.appointmentId}</td></tr>
                      <tr><td><strong>Doctor:</strong></td><td>Dr. ${doctor.name}</td></tr>
                      <tr><td><strong>Specialty:</strong></td><td>${doctor.specialty}</td></tr>
                      <tr><td><strong>Date:</strong></td><td>${date}</td></tr>
                      <tr><td><strong>Time:</strong></td><td>${timeSlot}</td></tr>
                      <tr><td><strong>Type:</strong></td><td>${appointmentType}</td></tr>
                      <tr><td><strong>Consultation Fee:</strong></td><td>₹${doctor.consultationFee}</td></tr>
                    </table>
                  </div>
                  
                  <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>⚠️ Important Reminders:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                      <li>Arrive 10 minutes before your scheduled time</li>
                      <li>Bring valid ID proof and insurance card</li>
                      <li>Bring relevant medical records or test results</li>
                      <li>Bring your prescription for follow-up visits</li>
                    </ul>
                  </div>
                  
                  ${googleEvent && googleEvent.htmlLink ? `
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${googleEvent.htmlLink}" 
                       style="background: #667eea; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                      📅 Add to Google Calendar
                    </a>
                  </div>
                  ` : ''}
                  
                  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
                  
                  <p style="color: #666; font-size: 12px; text-align: center;">
                    This is an automated message from Medicare AI Bot.<br>
                    For support: support@hospital.com | +91-XXX-XXXXXXX
                  </p>
                </div>
              </div>
            `,
            textBody: `
Appointment Confirmed

Dear ${patient.name},

Your appointment has been successfully confirmed!

APPOINTMENT DETAILS:
Appointment ID: ${appointment.appointmentId}
Doctor: Dr. ${doctor.name}
Specialty: ${doctor.specialty}
Date: ${date}
Time: ${timeSlot}
Type: ${appointmentType}
Consultation Fee: ₹${doctor.consultationFee}

IMPORTANT REMINDERS:
- Arrive 10 minutes before your scheduled time
- Bring valid ID proof and insurance card
- Bring relevant medical records or test results
- Bring your prescription for follow-up visits

${googleEvent && googleEvent.htmlLink ? `\nAdd to Calendar: ${googleEvent.htmlLink}` : ''}

---
Medicare AI Bot
For support: support@hospital.com
            `
          });
          
          console.log('📧 Email status:', emailResult);
        }
        
        console.log('✅ Async operations complete');
      } catch (asyncErr) {
        console.error('❌ Async operation error:', asyncErr);
      }
    });
    
  } catch (err) {
    console.error("❌ Booking error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to book appointment",
      details: err.message
    });
  }
});

// ----------------------
// 7. GET APPOINTMENT BY ID
// ----------------------
router.get('/appointments/:appointmentId', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ 
      appointmentId: req.params.appointmentId 
    });
    
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    
    const doctor = await Doctor.findOne({ doctorId: appointment.doctorId });
    const patient = await Patient.findOne({ patientId: appointment.patientId });
    
    res.json({
      success: true,
      appointment: {
        ...appointment.toObject(),
        doctorName: doctor ? doctor.name : 'Unknown',
        doctorSpecialty: doctor ? doctor.specialty : 'Unknown',
        patientName: patient ? patient.name : 'Unknown'
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 8. GET PATIENT APPOINTMENTS
// ----------------------
router.get('/patients/:patientId/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find({ 
      patientId: req.params.patientId 
    }).sort({ startDateTime: -1 });
    
    const enrichedAppointments = await Promise.all(
      appointments.map(async (appt) => {
        const doctor = await Doctor.findOne({ doctorId: appt.doctorId });
        return {
          ...appt.toObject(),
          doctorName: doctor ? doctor.name : 'Unknown',
          doctorSpecialty: doctor ? doctor.specialty : 'Unknown'
        };
      })
    );
    
    res.json({
      success: true,
      patientId: req.params.patientId,
      count: enrichedAppointments.length,
      appointments: enrichedAppointments
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 9. SEARCH PATIENTS
// ----------------------
router.get('/patients/search', async (req, res) => {
  try {
    const { email, phone } = req.query;
    
    if (!email && !phone) {
      return res.status(400).json({ error: "Email or phone required" });
    }
    
    const patient = await Patient.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : [])
      ]
    });
    
    if (!patient) {
      return res.status(404).json({ 
        success: false,
        error: "Patient not found" 
      });
    }
    
    res.json({
      success: true,
      patient: patient
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 10. CANCEL APPOINTMENT
// ----------------------
router.post('/appointments/:appointmentId/cancel', requireApiKey, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ 
      appointmentId: req.params.appointmentId 
    });
    
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: "Appointment already cancelled" });
    }
    
    appointment.status = 'cancelled';
    await appointment.save();
    
    res.json({
      success: true,
      message: "Appointment cancelled successfully",
      appointmentId: appointment.appointmentId
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// 11. HEALTH CHECK
// ----------------------
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Medicare API'
  });
});

// ----------------------
// Export Router
// ----------------------
module.exports = router;