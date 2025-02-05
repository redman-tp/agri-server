const express = require("express");
const multer = require("multer");
const { google } = require("googleapis");
const cors = require("cors");
const fs = require("fs");

require("dotenv").config();

const GOOGLE_KEY_FILE = process.env.GOOGLE_KEY_FILE;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID;

const app = express();
const upload = multer({ dest: "uploads/" }); // Temporary storage for uploaded files

const corsOptions = {
  // origin: "*",
  origin: ['http://localhost:9001', 'https://agritech.greysoft.ng'],
  methods: ["GET", "POST"],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Google Drive and Sheets setup
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_KEY_FILE, // Path to your Google service account JSON key
  scopes: SCOPES,
});
const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

// Upload file to Google Drive
const uploadToDrive = async (file) => {
  const fileMetadata = {
    name: file.originalname,
    parents: [GDRIVE_FOLDER_ID],
  }; // Replace with your Google Drive folder ID
  const media = {
    mimeType: file.mimetype,
    body: fs.createReadStream(file.path),
  };
  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id, webViewLink",
  });

  // Delete the local file after uploading
  fs.unlinkSync(file.path);
  return response.data.webViewLink;
};

// Append data to Google Sheets
const appendToSheet = async (sheetName, data) => {
  const spreadsheetId = SPREADSHEET_ID; // Replace with your Google Sheet ID

  const targetSheet = sheetName;
  const range = `${targetSheet}!A2:A`;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [data], // The data you want to append, should be an array
      },
    });
    console.log("Data appended successfully!");
  } catch (error) {
    console.error("Error appending data to Google Sheets: ", error);
    throw new Error("Failed to append data to the sheet.");
  }
};

const checkIfEmailExists = async (sheetName, email) => {
  const spreadsheetId = SPREADSHEET_ID;

  const columnMapping = {
    Papers: 'C',    // Column C for Papers
    Partners: 'I',  // Column E for Partners
    BootcampApplicants: 'C',  // Column D for BootCamp
    // Add more mappings as needed
  };

  const column = columnMapping[sheetName];

  const range = `${sheetName}!${column}:${column}`;
  // const range = `${sheetName}!C:C`; // Assuming the email is in column B

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    // console.log("Checking email:", email);
    // console.log("Rows in sheet:", rows);
    if (rows && rows.length > 0) {
      // Check if the email exists in the column
      return rows.some((row) => row[0] === email);
    }
    return false; // No data in the sheet
  } catch (error) {
    console.error("Error reading data from Google Sheets: ", error);
    throw new Error("Failed to check email in the sheet.");
  }
};

app.post(
  "/submit",
  upload.fields([
    { name: "paperFile" },
    { name: "supplementary" },
    { name: "resume" },
    { name: "porfolio" },
    { name: "logo" },
  ]),
  async (req, res) => {
    try {
      const { body, files } = req;

      const sheetName = body.sheetName;

      const paperMsg =
        "Your paper has been successfully submitted! Our team will review your submission, and we’ll get back to you soon with updates. Thank you for contributing to our knowledge exchange!";
      const partnerMsg =
        "Thank you for your interest in partnering with us! Your submission has been received, and our team will reach out shortly to discuss collaboration opportunities.";
      const bootcampMsg =
        "Your BootCamp registration is successful! We’re excited to have you on board. Stay tuned for further details on schedules and next steps.";

      const successMessages = {
        Papers: paperMsg,
        Partners: partnerMsg,
        BootcampApplicants: bootcampMsg,
      };

      const successMsg = successMessages[sheetName] || "Submission successful!";

      const email = body.email; // Assuming the email is part of the form data
      // console.log("This is a body something", body);

      // Check if the email already exists in the sheet
      const emailExists = await checkIfEmailExists(sheetName, email);
      if (emailExists) {
        return res.status(400).send({
          message:
            "This email is already in use. Please try another one or verify if you’ve already registered with this email.",
        });
      }

      // Upload files to Google Drive and get links
      const paperFileLink = files.paperFile
        ? await uploadToDrive(files.paperFile[0])
        : "";
      const supplementaryLink = files.supplementary
        ? await uploadToDrive(files.supplementary[0])
        : "";

      const resumeLink = files.resume
        ? await uploadToDrive(files.resume[0])
        : "No File";
      const porfolioLink = files.porfolio
        ? await uploadToDrive(files.porfolio[0])
        : "No File";

      const logoLink = files.logo ? await uploadToDrive(files.logo[0]) : "";

      // console.log(logoLink);

      const formData = Object.values(body);
      formData.shift();

      if (sheetName === "Papers") {
        formData.splice(12, 0, paperFileLink);
        formData.splice(13, 0, supplementaryLink);
      }
      if (sheetName === "BootcampApplicants") {
        formData.splice(12, 0, resumeLink);
        formData.splice(13, 0, porfolioLink);
      }
      if (sheetName === "Partners") {
        formData.splice(5, 0, logoLink);
      }

      // Insert the new values at the specific indices
      const filteredFormData = formData.filter(
        (value) => value !== null && value !== "null"
      );
      // Prepare data for Google Sheets
      const sheetData = filteredFormData;

      // Append to Google Sheets
      await appendToSheet(sheetName, sheetData);

      res.status(200).send({ message: successMsg });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .send({
          message:
            "Oops! Something went wrong while submitting your paper. Please check your connection and try again, or contact support if the issue persists.",
          error: error.message,
        });
    }
  }
);

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
