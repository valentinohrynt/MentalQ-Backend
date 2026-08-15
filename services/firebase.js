const {
   cert,
   getApp,
   getApps,
   initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

let app;

function parseCredentials() {
   if (!process.env.FIREBASE_CREDENTIALS) {
      throw new Error("FIREBASE_CREDENTIALS is not configured");
   }

   try {
      return JSON.parse(process.env.FIREBASE_CREDENTIALS);
   } catch (_error) {
      throw new Error("FIREBASE_CREDENTIALS must be valid single-line JSON");
   }
}

function getFirebaseApp() {
   if (app) return app;
   if (getApps().length > 0) {
      app = getApp();
      return app;
   }

   const credentials = parseCredentials();
   const options = {
      credential: cert(credentials),
      projectId: credentials.project_id,
   };
   if (process.env.FIREBASE_DATABASE_URL) {
      options.databaseURL = process.env.FIREBASE_DATABASE_URL.trim();
   }
   app = initializeApp(options);
   return app;
}

function getFirebaseAuth() {
   return getAuth(getFirebaseApp());
}

function getFirebaseDatabase() {
   if (!process.env.FIREBASE_DATABASE_URL?.trim()) {
      throw new Error("FIREBASE_DATABASE_URL is not configured");
   }
   return getDatabase(getFirebaseApp());
}

module.exports = {
   getFirebaseAuth,
   getFirebaseDatabase,
};
