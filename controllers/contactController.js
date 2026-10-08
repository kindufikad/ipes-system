const { createEmailTransporter, verifyEmailTransporter } = require('../services/emailService');

const sendContactMessage = async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and message are required.',
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  try {
    const emailTransport = createEmailTransporter();
    await verifyEmailTransporter(emailTransport.transporter);

    const recipient = process.env.CONTACT_EMAIL || emailTransport.config.user || 'kindufikad085@gmail.com';

    await emailTransport.transporter.sendMail({
      from: emailTransport.config.from,
      to: recipient,
      replyTo: email,
      subject: `New Contact Message from ${name} - IPES System`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin-bottom: 16px; color: #0f172a;">New Contact Message</h2>
          <p><strong>Sender Name:</strong> ${name}</p>
          <p><strong>Sender Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 8px; white-space: pre-wrap;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>
      `,
      text: `New Contact Message\n\nSender Name: ${name}\nSender Email: ${email}\n\nMessage:\n${message}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully!',
      data: null,
    });
  } catch (error) {
    console.error('Nodemailer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to send the message. Please try again later.',
    });
  }
};

module.exports = {
  sendContactMessage,
};
