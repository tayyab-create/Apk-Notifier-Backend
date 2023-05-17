
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const cors = require('cors');
const gplay = require('google-play-scraper')
const cron = require('node-cron'); // Import the node-cron module
const nodemailer = require('nodemailer');
const multer = require('multer'); // Import multer
const xlsx = require('xlsx'); // Import xlsx

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Connect to MongoDB
//mongoose.connect('mongodb://127.0.0.1:27017/myapp');
mongoose.connect('mongodb://admin:admin@mindstudio-shard-00-00.lrz3u.mongodb.net:27017,mindstudio-shard-00-01.lrz3u.mongodb.net:27017,mindstudio-shard-00-02.lrz3u.mongodb.net:27017/?ssl=true&replicaSet=atlas-d6n22t-shard-0&authSource=admin&retryWrites=true&w=majority');
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
        default: null
    },
    versionUpdateStatus: {
        type: String,
        default: null
    },
    appId: String
});

// Define model based on the schema
const AppData = mongoose.model('AppData', appSchema);

async function sendUpdateEmail(appName) {
    console.log("Mail Sent!");
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'tayyabmailsender@gmail.com',
        pass: 'hxzejifzewszfirr'
      }
    });
  
    let mailOptions = {
      from: 'tayyabmailsender@gmail.com',
      to: 'tayyabofficial78@gmail.com',
      subject: 'App Version Update',
      text: `The version of ${appName} has been updated. Please check it.`
    };
  
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });
  }
  async function checkAppUpdate(id) {
    try {
      const app = await AppData.findById(id);
  
      if (app.versionUpdateStatus === 'Need Update') {
        await sendUpdateEmail(app.appName);
      }
    } catch (error) {
      console.log(error);
    }
  }
  
  async function checkUpdates() {
    try {
      const apps = await AppData.find({});
      for (let app of apps) {
        await checkAppUpdate(app._id);
      }
    } catch (error) {
      console.log(error);
    }
  }
  
  // schedule to run every 60 minutes
setInterval(checkUpdates, 60 * 60 * 1000);
  
// GET endpoint to fetch all data
app.get('/apps', async (req, res) => {
    const apps = await AppData.find({});
    res.json(apps);
});

// POST endpoint to add new app data
app.post('/apps', async (req, res) => {
    const { appName, appVersion } = req.body;
    console.log(appName); // Log the app name

    try {
        const searchResults = await gplay.search({
            term: appName,
            num: 1,
        });

        if (searchResults.length > 0) {
            const app = searchResults[0];
            console.log("App Data: ", app);
            const appDetails = await gplay.app({ appId: app.appId });
            let versionUpdateStatus = "No Update Needed";
            if (appVersion !== appDetails.version) {
                versionUpdateStatus = "Need Update";
            }
            const appData = {
                appName: app.title,
                appURL: app.url,
                appVersion: appVersion,
                appId: app.appId,
                googlePlayVersion: appDetails.version,
                versionUpdateStatus: versionUpdateStatus
            };
            console.log(appData);
            const newAppData = new AppData(appData);
            const savedAppData = await newAppData.save();
            res.json(savedAppData);
        } else {
            res.status(404).json({ error: 'No app found with the given name.' });
        }
    } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// DELETE endpoint to delete an app data
app.delete('/apps/:id', async (req, res) => {
    const deletedAppData = await AppData.findByIdAndDelete(req.params.id);
    res.json(deletedAppData);
});

app.put('/apps/:id', async (req, res) => {
    const { id } = req.params;
    const { appName, appVersion, googlePlayVersion } = req.body;
  
    try {
      const versionUpdateStatus = appVersion === googlePlayVersion ? 'No Update Need' : 'Need Update';

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
  
      res.json(updatedAppData);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.put('/apps/:id/update', async (req, res) => {
    const { id } = req.params;

    try {
        const appData = await AppData.findById(id);
        const appInfo = await gplay.app({appId: appData.appId});
        let versionUpdateStatus = "No Update Needed";
            if (appData.appVersion !== appInfo.version) {
                versionUpdateStatus = "Need Update";
            }
            const updatedAppData = await AppData.findByIdAndUpdate(
              id,
              {
                  googlePlayVersion: appInfo.version,
                  versionUpdateStatus: versionUpdateStatus,
              },
              { new: true }
          );

          res.json(updatedAppData);
    } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST endpoint to upload a file and add new app data
app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('upload file ')
  try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet_name_list = workbook.SheetNames;
      const appsData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

      for (const appData of appsData) {
          const { appName, appVersion } = appData;

          const searchResults = await gplay.search({
              term: appName,
              num: 1,
          });

          if (searchResults.length > 0) {
              const app = searchResults[0];
              const appDetails = await gplay.app({ appId: app.appId });

              let versionUpdateStatus = "No Update Needed";
              if (appVersion !== appDetails.version) {
                  versionUpdateStatus = "Need Update";
              }
              
              const newAppData = {
                  appName: app.title,
                  appURL: app.url,
                  appVersion: appVersion,
                  appId: app.appId,
                  googlePlayVersion: appDetails.version,
                  versionUpdateStatus: versionUpdateStatus
              };

              const newApp = new AppData(newAppData);
              await newApp.save();
          }
      }

      res.json({ success: true });
  } catch (error) {
      console.error('An error occurred:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Start the server
app.listen(5000, () => console.log('Server listening on port 3000'));

let cronJobCounter = 0;

// This is the cron job that runs every 60 minutes
cron.schedule('* * * * *', async () => {
    cronJobCounter++; // Increase the counter each time the job runs
    const apps = await AppData.find({});
  
    for (let app of apps) {
      

      try {
        const appDetails = await gplay.app({ appId: app.appId });
        let versionUpdateStatus = "No Update Needed";
      if (app.appVersion !== appDetails.version) {
        versionUpdateStatus = "Need Update";
      }
      if (app.appVersion !== appDetails.version) {
        versionUpdateStatus = "Need Update";
      }
      app.googlePlayVersion = appDetails.version;
      app.versionUpdateStatus = versionUpdateStatus;

      await app.save();
      } catch (error) {
        console.error('An error occurred:', error);
      }
    }
    console.log('Updated Google Play versions');
  });

  app.get('/cron-job-counter', (req, res) => {
    res.json({ counter: cronJobCounter });
  });