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

app.use(cors());
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

app.post(
  "/submit",
  upload.fields([{ name: "paperFile" }, { name: "supplementary" }, { name: "resume" }, { name: "porfolio" }, { name: "logo" }]),
  async (req, res) => {
    try {
      const { body, files } = req;

      const sheetName = body.sheetName;
      // Upload files to Google Drive and get links
      const paperFileLink = files.paperFile
        ? await uploadToDrive(files.paperFile[0])
        : "";
      const supplementaryLink = files.supplementary
        ? await uploadToDrive(files.supplementary[0])
        : "";

      const resumeLink = files.resume
        ? await uploadToDrive(files.resume[0])
        : "";
      const porfolioLink = files.porfolio
        ? await uploadToDrive(files.porfolio[0])
        : "";
        
      const logoLink = files.logo
        ? await uploadToDrive(files.logo[0])
        : "";

          console.log(logoLink);
                
         
      const formData = Object.values(body);
      formData.shift();
          
      if(sheetName === 'Papers'){
        formData.splice(12, 0, paperFileLink); 
        formData.splice(13, 0, supplementaryLink);
      }
      if (sheetName === 'BootcampApplicants') {
        formData.splice(12, 0, resumeLink); 
        formData.splice(13, 0, porfolioLink);
      }
      if (sheetName === 'Partners') {
        formData.splice(5, 0, logoLink); 
      }
   
      
      // Insert the new values at the specific indices
      console.log(formData);
      
      // Prepare data for Google Sheets
      const sheetData = formData;

      // Append to Google Sheets
      await appendToSheet(sheetName, sheetData);

      res.status(200).send({ message: "Form submitted successfully!" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .send({ message: "Failed to submit form", error: error.message });
    }
  }
);

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
