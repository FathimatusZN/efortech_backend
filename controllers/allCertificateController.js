const db = require("../config/db");
const {
  sendSuccessResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

function getValidityStatus(expiredDate) {
  if (!expiredDate) return "Valid";

  const today = new Date();
  const expiry = new Date(expiredDate);
  return today <= expiry ? "Valid" : "Expired";
}

// Endpoint for get all certificates (certificate & user_certificates)
exports.getAllCertificates = async (req, res) => {
  const client = await db.connect();
  try {
    // 1. Get from certificate table (relation to user and training)
    const query1 = `
        SELECT 
            c.certificate_id,
            c.certificate_number,
            u.fullname,
            t.training_name AS certificate_title,
            c.issued_date,
            c.expired_date,
            c.cert_file,
            1 AS type,
            'PT. Efortech Solusi Integrasi' AS issued_by
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN training t ON r.training_id = t.training_id
        WHERE c.cert_file IS NOT NULL AND c.cert_file <> ''
    `;

    const { rows: cert1 } = await client.query(query1);

    // Inject validity_status ke cert1
    const cert1WithStatus = cert1.map((cert) => ({
      ...cert,
      validity_status: getValidityStatus(cert.expired_date),
    }));

    // 2. Get from user_certificates
    const query2 = `
      SELECT 
        user_certificate_id AS certificate_id,
        certificate_number,
        original_number,
        fullname,
        cert_type AS certificate_title,
        issued_date,
        expired_date,
        cert_file,
        2 AS type,
        issuer AS issued_by
      FROM user_certificates
      WHERE status = 2
    `;
    const { rows: cert2 } = await client.query(query2);

    // Inject validity_status ke cert2
    const cert2WithStatus = cert2.map((cert) => ({
      ...cert,
      validity_status: getValidityStatus(cert.expired_date),
    }));

    // 3. Combine the result
    const combined = [...cert1WithStatus, ...cert2WithStatus];

    return sendSuccessResponse(res, "Success get all certificates", combined);
  } catch (error) {
    console.error("Error getting certificates:", error);
    return sendErrorResponse(res, 500, "Failed to get certificates");
  } finally {
    client.release();
  }
};

// Endpoint for search certificates based on query param with sort support
exports.searchCertificates = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      certificate_number,
      fullname,
      certificate_title,
      issued_date,
      expired_date,
      issued_date_from,
      issued_date_to,
      expired_date_from,
      expired_date_to,
      q,
      type,
      sort_by = "issued_date",
      sort_order = "desc",
      validity_status,
    } = req.query;

    const allowedSortFields = [
      "certificate_number",
      "fullname",
      "certificate_title",
      "issued_date",
      "expired_date",
    ];
    const safeSortBy = allowedSortFields.includes(sort_by)
      ? sort_by
      : "issued_date";
    const safeSortOrder = sort_order?.toLowerCase() === "asc" ? "ASC" : "DESC";

    const cert1Conditions = [];
    const cert1Values = [];

    const addCond = (field, value, tableAlias = "") => {
      const idx = cert1Values.length + 1;
      const col = tableAlias ? `${tableAlias}.${field}` : field;
      cert1Conditions.push(`${col}::text ILIKE $${idx}`);
      cert1Values.push(`%${value}%`);
    };

    if (certificate_number)
      addCond("certificate_number", certificate_number, "c");
    if (fullname) addCond("fullname", fullname, "u");
    if (certificate_title) addCond("training_name", certificate_title, "t");
    if (issued_date) {
      cert1Conditions.push(`c.issued_date = $${cert1Values.length + 1}`);
      cert1Values.push(issued_date);
    }
    if (expired_date) {
      cert1Conditions.push(`c.expired_date = $${cert1Values.length + 1}`);
      cert1Values.push(expired_date);
    }
    if (issued_date_from) {
      cert1Conditions.push(`c.issued_date >= $${cert1Values.length + 1}`);
      cert1Values.push(issued_date_from);
    }
    if (issued_date_to) {
      cert1Conditions.push(`c.issued_date <= $${cert1Values.length + 1}`);
      cert1Values.push(issued_date_to);
    }
    if (expired_date_from) {
      cert1Conditions.push(`c.expired_date >= $${cert1Values.length + 1}`);
      cert1Values.push(expired_date_from);
    }
    if (expired_date_to) {
      cert1Conditions.push(`c.expired_date <= $${cert1Values.length + 1}`);
      cert1Values.push(expired_date_to);
    }

    if (q) {
      const search = `%${q}%`;
      cert1Conditions.push(`(
        c.certificate_number ILIKE $${cert1Values.length + 1} OR
        u.fullname ILIKE $${cert1Values.length + 2} OR
        t.training_name ILIKE $${cert1Values.length + 3} OR
        CAST(c.issued_date AS TEXT) ILIKE $${cert1Values.length + 4} OR
        CAST(c.expired_date AS TEXT) ILIKE $${cert1Values.length + 5}
      )`);
      cert1Values.push(search, search, search, search, search);
    }

    if (validity_status) {
      const validityArray = Array.isArray(validity_status)
        ? validity_status
        : [validity_status];
      cert1Conditions.push(`(
        CASE 
          WHEN c.expired_date >= CURRENT_DATE THEN 'Valid'
          ELSE 'Expired'
        END
      ) = ANY($${cert1Values.length + 1}::text[])`);
      cert1Values.push(validityArray);
    }

    let cert1WithStatus = [];
    let cert2WithStatus = [];

    if (!type || type === "1") {
      let query1 = `
        SELECT 
          c.certificate_id,
          c.certificate_number,
          u.fullname,
          t.training_name AS certificate_title,
          c.issued_date,
          c.expired_date,
          c.cert_file,
          1 AS type,
          'PT. Efortech Solusi Integrasi' AS issued_by
        FROM certificate c
        JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
        JOIN users u ON rp.user_id = u.user_id
        JOIN registration r ON rp.registration_id = r.registration_id
        JOIN training t ON r.training_id = t.training_id
      `;

      cert1Conditions.push(`c.cert_file IS NOT NULL AND c.cert_file <> ''`);

      if (cert1Conditions.length > 0) {
        query1 += ` WHERE ` + cert1Conditions.join(" AND ");
      }

      query1 += ` ORDER BY ${
        safeSortBy === "certificate_title"
          ? "t.training_name"
          : safeSortBy === "fullname"
          ? "u.fullname"
          : `c.${safeSortBy}`
      } ${safeSortOrder}`;

      const cert1 = await client.query(query1, cert1Values);
      cert1WithStatus = cert1.rows.map((cert) => ({
        ...cert,
        validity_status: getValidityStatus(cert.expired_date),
      }));
    }

    if (!type || type === "2") {
      const cert2Conditions = [`status = 2`];
      const cert2Values = [];

      const addCert2Cond = (field, value) => {
        const idx = cert2Values.length + 1;
        cert2Conditions.push(`${field}::text ILIKE $${idx}`);
        cert2Values.push(`%${value}%`);
      };

      if (certificate_number)
        addCert2Cond("certificate_number", certificate_number);
      if (fullname) addCert2Cond("fullname", fullname);
      if (certificate_title) addCert2Cond("cert_type", certificate_title);
      if (issued_date) {
        cert2Conditions.push(`issued_date = $${cert2Values.length + 1}`);
        cert2Values.push(issued_date);
      }
      if (expired_date) {
        cert2Conditions.push(`expired_date = $${cert2Values.length + 1}`);
        cert2Values.push(expired_date);
      }
      if (issued_date_from) {
        cert2Conditions.push(`issued_date >= $${cert2Values.length + 1}`);
        cert2Values.push(issued_date_from);
      }
      if (issued_date_to) {
        cert2Conditions.push(`issued_date <= $${cert2Values.length + 1}`);
        cert2Values.push(issued_date_to);
      }
      if (expired_date_from) {
        cert2Conditions.push(`expired_date >= $${cert2Values.length + 1}`);
        cert2Values.push(expired_date_from);
      }
      if (expired_date_to) {
        cert2Conditions.push(`expired_date <= $${cert2Values.length + 1}`);
        cert2Values.push(expired_date_to);
      }

      if (q) {
        const search = `%${q}%`;
        cert2Conditions.push(`(
          COALESCE(original_number, certificate_number) ILIKE $${
            cert2Values.length + 1
          } OR
          fullname ILIKE $${cert2Values.length + 2} OR
          cert_type ILIKE $${cert2Values.length + 3} OR
          CAST(issued_date AS TEXT) ILIKE $${cert2Values.length + 4} OR
          CAST(expired_date AS TEXT) ILIKE $${cert2Values.length + 5}
        )`);
        cert2Values.push(search, search, search, search, search);
      }
      if (validity_status) {
        const validityArray = Array.isArray(validity_status)
          ? validity_status
          : [validity_status];
        cert2Conditions.push(`(
          CASE 
            WHEN expired_date >= CURRENT_DATE THEN 'Valid'
            ELSE 'Expired'
          END
        ) = ANY($${cert2Values.length + 1}::text[])`);
        cert2Values.push(validityArray);
      }

      let query2 = `
        SELECT 
          user_certificate_id AS certificate_id,
          certificate_number,
          original_number,
          fullname,
          cert_type AS certificate_title,
          issued_date,
          expired_date,
          cert_file,
          2 AS type,
          issuer AS issued_by
        FROM user_certificates
      `;

      if (cert2Conditions.length > 0) {
        query2 += ` WHERE ` + cert2Conditions.join(" AND ");
      }

      query2 += ` ORDER BY ${
        safeSortBy === "certificate_title" ? "cert_type" : safeSortBy
      } ${safeSortOrder}`;

      const cert2 = await client.query(query2, cert2Values);
      cert2WithStatus = cert2.rows.map((cert) => ({
        ...cert,
        validity_status: getValidityStatus(cert.expired_date),
      }));
    }

    const combined =
      type === "1"
        ? cert1WithStatus
        : type === "2"
        ? cert2WithStatus
        : [...cert1WithStatus, ...cert2WithStatus];

    return sendSuccessResponse(res, "Certificates fetched", combined);
  } catch (err) {
    console.error("Error fetching certificates:", err);
    return sendErrorResponse(res, 500, "Failed to fetch certificates");
  } finally {
    client.release();
  }
};

exports.getCertificateByNumber = async (req, res) => {
  const client = await db.connect();
  try {
    const { number } = req.params;

    // 1. Table `certificate` (type 1)
    const query1 = `
      SELECT 
        c.certificate_id,
        c.certificate_number,
        u.user_id,
        u.fullname,
        u.user_photo,
        t.*,
        c.issued_date,
        c.expired_date,
        c.cert_file,
        1 AS type,
        'PT. Efortech Solusi Integrasi' AS issued_by
      FROM certificate c
      JOIN registration_participant rp ON c.registration_participant_id = rp.registration_participant_id
      JOIN users u ON rp.user_id = u.user_id
      JOIN registration r ON rp.registration_id = r.registration_id
      JOIN training t ON r.training_id = t.training_id
      WHERE c.certificate_number = $1
    `;
    const result1 = await client.query(query1, [number]);

    if (result1.rowCount > 0) {
      const cert = result1.rows[0];

      const mappedCert = {
        certificate_id: cert.certificate_id,
        certificate_number: cert.certificate_number,
        user_id: cert.user_id,
        fullname: cert.fullname,
        user_photo: cert.user_photo,
        certificate_title: cert.training_name,
        certificate_status: getValidityStatus(cert.expired_date),
        issued_date: cert.issued_date,
        expired_date: cert.expired_date,
        completed_date: cert.completed_date,
        cert_file: cert.cert_file,
        issued_by: cert.issued_by,
        type: cert.type,
        training: {
          training_id: cert.training_id,
          training_name: cert.training_name,
          description: cert.description,
          level: cert.level,
          duration: cert.duration,
          training_fees: cert.training_fees,
          discount: cert.discount,
          validity_period: cert.validity_period,
          term_condition: cert.term_condition,
          status: cert.status,
          graduates: cert.graduates,
          rating: cert.rating,
          images: cert.images,
          skills: cert.skills,
          created_by: cert.created_by,
          created_date: cert.created_date,
        },
      };

      return sendSuccessResponse(res, "Success get certificate", mappedCert);
    }

    // 2. Table `user_certificates` (type 2) + join users
    const query2 = `
      SELECT 
        uc.user_certificate_id AS certificate_id,
        uc.certificate_number,
        uc.original_number,
        uc.fullname,
        uc.cert_type AS certificate_title,
        uc.issued_date,
        uc.expired_date,
        uc.cert_file,
        2 AS type,
        uc.issuer AS issued_by,
        u.user_id,
        u.user_photo
      FROM user_certificates uc
      LEFT JOIN users u ON uc.user_id = u.user_id
      WHERE (uc.certificate_number = $1 OR uc.original_number = $1) AND uc.status = 2
    `;
    const result2 = await client.query(query2, [number]);

    if (result2.rowCount > 0) {
      const cert = result2.rows[0];
      return sendSuccessResponse(res, "Success get user certificate", {
        ...cert,
        certificate_status: getValidityStatus(cert.expired_date),
        training: null,
      });
    }

    return sendErrorResponse(res, 404, "Certificate not found");
  } catch (error) {
    console.error("Error getting certificate by ID:", error);
    return sendErrorResponse(res, 500, "Failed to get certificate");
  } finally {
    client.release();
  }
};
