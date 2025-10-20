const certificateIssuedTemplate = ({
  userName,
  registration_participant_id,
  certificateNumber,
  trainingName,
  issuedDate,
  expiredDate,
}) => {
  return {
    subject: `🎓 Your Certificate for ${trainingName} is Now Available`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <p>Dear ${userName},</p>

        <p>We are pleased to inform you that you have successfully completed the <strong>${trainingName}</strong> training.</p>

        <p>As a recognition of your achievement, your certificate has been officially issued. Please find the details below:</p>

        <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
          <tr><td style="padding: 4px;"><strong>Participant Name</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${userName}</td></tr>
          <tr><td style="padding: 4px;"><strong>Training Program</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${trainingName}</td></tr>
          <tr><td style="padding: 4px;"><strong>Certificate Number</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${certificateNumber}</td></tr>
          <tr><td style="padding: 4px;"><strong>Issued Date</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${issuedDate}</td></tr>
          <tr><td style="padding: 4px;"><strong>Expiration Date</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${
            expiredDate || "No Expiry Date"
          }</td></tr>
        </table>

        <br/>
        <p>You can check your certificate using the following link:<br/>
        <a href="https://edu.efortechsolutions.com/certificate/${certificateNumber}" target="_blank" style="color: #1a73e8; font-weight: bold; font-style: italic;">
          https://edu.efortechsolutions.com/certificate/${certificateNumber}
        </a></p>
        <p>We sincerely thank you for your active participation and commitment throughout the training.</p>
        <br/>
      </div>

      ${htmlSignature}
    `,
  };
};

const certificateValidationTemplate = ({
  userName,
  certificateNumber,
  certificateName,
  issuedDate,
  expiredDate,
  status,
  notes,
  originalNumber,
}) => {
  const isAccepted = status === "Accepted";
  const isRejected = status === "Rejected";

  return {
    subject: `Certificate Validation Status: ${status}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <p>Dear ${userName},</p>

        <p>We hope this message finds you well. We are writing to inform you that your certificate has been <strong>${status.toUpperCase()}</strong>.</p>

        <p><strong>Certificate Details:</strong></p>
        <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
          <tr><td style="padding: 4px;"><strong>Certificate Name</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${certificateName}</td></tr>
          <tr><td style="padding: 4px;"><strong>Certificate Number</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${
            originalNumber || certificateNumber
          }</td></tr>
          <tr><td style="padding: 4px;"><strong>Issued Date</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${issuedDate}</td></tr>
          <tr><td style="padding: 4px;"><strong>Expiration Date</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;">${
            expiredDate || "No Expiry Date"
          }</td></tr>
          <tr><td style="padding: 4px;"><strong>Validation Status</strong></td><td style="padding: 4px;">:</td><td style="padding: 4px;"><strong>${status}</strong></td></tr>
        </table>

        ${
          isAccepted
            ? `<p>🎉 Congratulations! Your certificate has been successfully verified and accepted into our system.</p><br/>`
            : `<p><strong>Notes:</strong><br/>${notes || "-"}<br/><br/>
               If you believe this decision was made in error, you are welcome to resubmit your certificate for further review.</p>`
        }

        ${
          !isRejected
            ? `<p>You can view your certificate details at:<br/>
               <a href="https://edu.efortechsolutions.com/certificate/${certificateNumber}" target="_blank" style="color: #1a73e8; font-weight: bold; font-style: italic;">
               https://edu.efortechsolutions.com/certificate/${certificateNumber}</a></p>`
            : ""
        }

        <p>Thank you for your submission.<br/>
        <br/>
      </div>

      ${htmlSignature}
    `,
  };
};

const htmlSignature = `
  <div><p class="MsoNormal"><i><span lang="EN-US" style="font-size:13.5pt;color:#262626">Thanks &amp; Best Regards,</span></i></p>
  <p class="MsoNormal"><b><span lang="EN-US" style="font-size:13.5pt;font-family:'Trebuchet MS',sans-serif;color:#a4c9e8">EFORTECH SOLUSI INTEGRASI, PT</span></b></p> <br/>
  <table border="0" cellspacing="0" cellpadding="0" style="margin-left:.4pt;border-collapse:collapse">
    <tbody><tr style="height:64.05pt">
      <td width="141" valign="middle" style="width:105.95pt;border:none;border-right:solid windowtext 1.0pt;padding:0cm 5.4pt 0cm 5.4pt;height:64.05pt">
        <img width="131" height="25" src="https://edu.efortechsolutions.com/assets/email/logo.png" alt="Image" />
      </td>
      <td width="198" valign="top" style="width:148.8pt;padding:0cm 5.4pt 0cm 5.4pt;height:64.05pt">
        <p style="font-size:9pt;font-family:'Trebuchet MS',sans-serif;color:#262626">
          T: 0811 3300 143<br/>
          E: <a href="mailto:info@efortechsolutions.com" style="color:#467886">info@efortechsolutions.com</a><br/>
          W: <a href="https://www.efortechsolutions.com/" style="color:#7596d2">www.efortechsolutions.com</a><br/>
          W: <a href="https://edu.efortechsolutions.com/" style="color:#7596d2">edu.efortechsolutions.com</a>
        </p>
        <p style="margin: 0; padding: 0;">
          <a href="https://youtu.be/oDBnRDgy6RE" style="display: inline-block; margin-right: 5px;">
            <img width="23" height="23" src="https://edu.efortechsolutions.com/assets/email/youtube.png" alt="YouTube" style="display: inline-block;" />
          </a>
          <a href="https://www.linkedin.com/company/efortechsolutions/" style="display: inline-block;">
            <img width="22" height="23" src="https://edu.efortechsolutions.com/assets/email/linkedin.png" alt="LinkedIn" style="display: inline-block;" />
          </a>
        </p>
      </td>
    </tr></tbody>
  </table>
  <br/>
  <p style="font-size:9pt;font-family:'Trebuchet MS',sans-serif;color:#a2c2e8"><strong>Surabaya Office | Bandung Office | Jakarta Office</strong></p>
  <p style="font-size:8pt;font-family:'Trebuchet MS',sans-serif;color:#262626">Ayman Building 2<sup>nd</sup> Floor, Jl Masjid Al-Akbar Utara No. 7 Surabaya 60234 Indonesia</p><br/>
  <p><a href="http://www.efortechsolutions.com/"><img width="624" height="117" src="https://edu.efortechsolutions.com/assets/email/footer.png" alt="Footer Banner" /></a></p>
  </div>
`;

module.exports = { certificateIssuedTemplate, certificateValidationTemplate };
