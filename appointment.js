const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  appointmentId: String,
  patientId: String,
  doctorId: String,
  date: String,
  time: String,
  status: { type: String, default: "Booked" }
});

module.exports = mongoose.model("Appointment", appointmentSchema);
