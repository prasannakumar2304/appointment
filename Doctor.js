const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema({
  doctorId: String,
  name: String,
  email: String,
  phone: String,
  specialty: String,
  qualification: String,
  experience: Number,
  consultationFee: Number,
  rating: Number,
  availability: Object,
  calendarId: String,
  timezone: String,
  isActive: Boolean
});

module.exports = mongoose.model("Doctor", doctorSchema);
