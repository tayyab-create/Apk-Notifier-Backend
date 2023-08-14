// Import required modules
const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const cors = require("cors");
const gplay = require("google-play-scraper");
const cron = require("node-cron"); // Import the node-cron module
const nodemailer = require("nodemailer");
const multer = require("multer"); // Import multer
const xlsx = require("xlsx"); // Import xlsx
const axios = require("axios");
const cheerio = require("cheerio");

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/myapp");
// You can use the following line to connect to a MongoDB Atlas cluster
// mongoose.connect('mongodb://admin:admin@mindstudio-shard-00-00.lrz3u.mongodb.net:27017,mindstudio-shard-00-01.lrz3u.mongodb.net:27017,mindstudio-shard-00-02.lrz3u.mongodb.net:27017/?ssl=true&replicaSet=atlas-d6n22t-shard-0&authSource=admin&retryWrites=true&w=majority');
const app = express();

app.use(cors());

app.use(express.json()); // for parsing application/json

// Define schema for app data
const appSchema = new mongoose.Schema({
  appName: String,
  appURL: String,
  appVersion: String,
  googlePlayVersion: {
    type: String,
    default: null,
  },
  versionUpdateStatus: {
    type: String,
    default: null,
  },
  appId: String,
  date: {
    type: Date,
    default: Date.now,
  },
});

// Define model based on the schema
const AppData = mongoose.model("AppData", appSchema);

// Function to send update email
async function sendUpdateEmail(appNames) {
  console.log("Mail Sent!");
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "tayyabmailsender@gmail.com",
      pass: "hxzejifzewszfirr",
    },
  });

  let mailOptions = {
    from: "tayyabmailsender@gmail.com",
    to: "tayyabofficial78@gmail.com",
    subject: "App Version Update",
    text: `The following apps have been updated:\n${appNames.join("\n")}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

// Function to check updates for all apps and send email if needed
async function checkUpdates() {
  try {
    const apps = await AppData.find({ versionUpdateStatus: "Need Update" });
    const appNames = apps.map((app) => app.appName);

    if (appNames.length > 0) {
      await sendUpdateEmail(appNames);
    }
  } catch (error) {
    console.log(error);
  }
}

// Schedule the checkUpdates function to run every 60 minutes
setInterval(checkUpdates, 60 * 60 * 1000);
//setInterval(checkUpdates, 15000);

// GET endpoint to fetch all data
app.get("/apps", async (req, res) => {
  const apps = await AppData.find({});
  res.json(apps);
});

// POST endpoint to add new app data
app.post("/apps", async (req, res) => {
  const { appName, appVersion } = req.body;
  console.log(appName); // Log the app name

  try {
    // Search for the app on Google Play Store
    const searchResults = await gplay.search({
      term: appName,
      num: 1,
    });

    if (searchResults.length > 0) {
      const app = searchResults[0];
      console.log("App Data: ", app);
      const appDetails = await gplay.app({ appId: app.appId });

      // Fetch the HTML of the app's Google Play page
      const { data } = await axios.get(appDetails.url);
      const $ = cheerio.load(data);

      // Extract the date from the page
      const dateText = $(".xg1aie").text(); // replace '.xg1aie' with the actual selector for the date element

      let versionUpdateStatus = "No Update Needed";
      if (appVersion !== appDetails.version) {
        versionUpdateStatus = "Need Update";
      }

      // Create app data object
      const appData = {
        appName: app.title,
        appURL: app.url,
        appVersion: appVersion,
        appId: app.appId,
        googlePlayVersion: appDetails.version,
        versionUpdateStatus: versionUpdateStatus,
        date: dateText,
      };

      console.log(appData);

      // Create a new instance of AppData model with app data
      const newAppData = new AppData(appData);

      // Save the new app data to the database
      const savedAppData = await newAppData.save();

      // Send the saved app data in the response
      res.json(savedAppData);
    } else {
      res.status(404).json({ error: "No app found with the given name." });
    }
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE endpoint to delete an app data
app.delete("/apps/:id", async (req, res) => {
  const deletedAppData = await AppData.findByIdAndDelete(req.params.id);
  res.json(deletedAppData);
});

// PUT endpoint to update an app data
app.put("/apps/:id", async (req, res) => {
  const { id } = req.params;
  const { appName, appVersion, googlePlayVersion } = req.body;

  try {
    const versionUpdateStatus =
      appVersion === googlePlayVersion ? "No Update Need" : "Need Update";

    // Find and update the app data based on the ID
    const updatedAppData = await AppData.findByIdAndUpdate(
      id,
      {
        appName,
        appVersion,
        googlePlayVersion,
        versionUpdateStatus,
      },
      { new: true }
    );

    // Send the updated app data in the response
    res.json(updatedAppData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT endpoint to update app data by fetching from Google Play Store
app.put("/apps/:id/update", async (req, res) => {
  const { id } = req.params;

  try {
    const appData = await AppData.findById(id);
    const appInfo = await gplay.app({ appId: appData.appId });
    // Fetch the HTML of the app's Google Play page
    const { data } = await axios.get(appInfo.url);
    const $ = cheerio.load(data);

    // Extract the date from the page
    const dateText = $(".xg1aie").text(); // replace '.xg1aie' with the actual selector for the date element
    console.log(dateText);

    let versionUpdateStatus = "No Update Needed";
    if (appData.appVersion !== appInfo.version) {
      versionUpdateStatus = "Need Update";
    }
    const updatedAppData = await AppData.findByIdAndUpdate(
      id,
      {
        googlePlayVersion: appInfo.version,
        versionUpdateStatus: versionUpdateStatus,
        date: dateText,
      },
      { new: true }
    );
    res.json(updatedAppData);
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
app.listen(5000, () => console.log("Server listening on port 5000"));

let cronJobCounter = 0;

// This is the cron job that runs every 60 minutes
cron.schedule("0 */6 * * *", async () => {
  cronJobCounter++; // Increase the counter each time the job runs
  const apps = await AppData.find({});

  for (let app of apps) {
    try {
      const appDetails = await gplay.app({ appId: app.appId });
      let versionUpdateStatus = "No Update Needed";
      if (app.appVersion !== appDetails.version) {
        versionUpdateStatus = "Need Update";
      }

      app.googlePlayVersion = appDetails.version;
      app.versionUpdateStatus = versionUpdateStatus;

      await app.save();
    } catch (error) {
      console.error("An error occurred:", error);
    }
  }

  console.log("Updated Google Play versions");
});

// GET endpoint to fetch the cron job counter
app.get("/cron-job-counter", (req, res) => {
  res.json({ counter: cronJobCounter });
});

// Function to fetch app names from WordPress site and store in the database
const getPostUrls = async (siteUrl) => {
  try {
    // Fetch the posts data from the WordPress API
    const { data } = await axios.get(
      `${siteUrl}/wp-json/wp/v2/posts?per_page=100`
    );

    // Process the data and extract the app names and URLs
    return data.map((post) => {
      // Remove base URL
      const urlSuffix = post.link.replace(siteUrl, "");

      // Split the URL by slashes
      const urlParts = urlSuffix.split("/");

      // Select the first two parts after the base URL
      // join them back together with a slash
      // Note: filter is used to remove empty strings that may occur due to leading or trailing slashes
      const firstTwoWords = urlParts.filter(Boolean).slice(0, 2).join("/");

      // Replace dashes with spaces and capitalize each word
      const titleParts = firstTwoWords
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

      // Join the title parts and remove 'Mod Apk'
      const title = titleParts
        .join(" ")
        .replace(/Mod Apk/i, "")
        .replace(/Download/i, "");

      return { title, url: post.link };
    });
  } catch (error) {
    console.error(`Error: ${error}`);
    // Return an empty array to avoid 'not iterable' error
    return [];
  }
};

// Endpoint to fetch app names from the WordPress site and store in the database
app.get("/fetch-apps", async (req, res) => {
  try {
    // Get post URLs and app names from the WordPress site
    const appUrls = await getPostUrls("https://apkzalmi.com");

    for (const appUrl of appUrls) {
      try {
        // Search for the app on Google Play Store
        const searchResults = await gplay.search({
          term: appUrl.title,
          num: 1,
        });

        if (searchResults.length > 0) {
          const app = searchResults[0];
          const appDetails = await gplay.app({ appId: app.appId });

          // Get APK version by fetching the HTML content of the app URL
          const { data } = await axios.get(appUrl.url);
          const $ = cheerio.load(data);

          // Extract the APK version element
          const apkVersion = $("span.spec-cont[itemprop='softwareVersion']")
            .text()
            .trim();
          const cleanedApkVersion = apkVersion.replace(/^v/i, ""); // Remove 'v' from the beginning of the apkVersion

          // Determine version update status
          const versionUpdateStatus =
            appDetails.version === cleanedApkVersion
              ? "No Update Needed"
              : "Need Update";

          // Find existing app data based on the appId
          let existingApp = await AppData.findOne({ appId: app.appId });

          /// Fetch the HTML of the app's Google Play page
          const { data: googlePlayData } = await axios.get(app.url);
          const googlePlay$ = cheerio.load(googlePlayData);

          // Extract the date from the page
          const dateText = googlePlay$(".xg1aie").text(); // replace '.xg1aie' with the actual selector for the date element

          if (!existingApp) {
            // If no existing app data found, create a new instance
            existingApp = new AppData();
          }

          // Update the app data fields
          existingApp.appName = app.title;
          existingApp.appURL = app.url;
          existingApp.appVersion = cleanedApkVersion;
          existingApp.appId = app.appId;
          existingApp.googlePlayVersion = appDetails.version;
          existingApp.versionUpdateStatus = versionUpdateStatus;
          existingApp.date = dateText;

          // Save the app data to the database
          const savedAppData = await existingApp.save();
          console.log("App data saved:", dateText);
        }
      } catch (error) {
        console.error("An error occurred:", error);
      }
    }

    // Fetch the updated app data from the database
    const updatedAppData = await AppData.find();

    // Send the updated app data in the response
    res.json(updatedAppData);
    console.log("All Apps Fetched and updated!");
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "An error occurred while fetching apps" });
  }
});

// Endpoint to delete all app data
app.delete("/apps", async (req, res) => {
  try {
    await AppData.deleteMany({});
    res.json({ message: "All apps deleted successfully" });
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "An error occurred while deleting apps" });
  }
});
