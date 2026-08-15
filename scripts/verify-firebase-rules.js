const fs = require("fs");
const path = require("path");
const dns = require("dns");
require("dotenv").config();
const { getFirebaseAuth, getFirebaseDatabase } = require("../services/firebase");

dns.setDefaultResultOrder("ipv4first");

if (process.argv[2] !== "--live") {
   console.error("This check temporarily writes isolated diagnostic data. Re-run with --live.");
   process.exit(2);
}

const googleServicesPath = path.resolve(
   __dirname,
   "../../frontend/app/google-services.json"
);
const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, "utf8"));
const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key;
if (!apiKey) throw new Error("Firebase Android API key could not be loaded");

const databaseUrl = process.env.FIREBASE_DATABASE_URL?.replace(/\/$/, "");
if (!databaseUrl) throw new Error("FIREBASE_DATABASE_URL is not configured");

const suffix = Date.now().toString();
const chatId = `rules-test-${suffix}`;
const messageId = `message-${suffix}`;
const userId = `rules-user-${suffix}`;
const psychologistId = `rules-psychologist-${suffix}`;
const firebaseUserUid = `mentalq-rules-user-${suffix}`;
const firebasePsychologistUid = `mentalq-rules-psychologist-${suffix}`;

function assertStatus(response, expected, label) {
   if (response.status !== expected) {
      throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
   }
}

async function exchangeCustomToken(customToken) {
   const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
   );
   if (!response.ok) throw new Error(`Custom-token exchange failed: HTTP ${response.status}`);
   return (await response.json()).idToken;
}

async function databaseRequest(relativePath, idToken, options = {}) {
   const url = new URL(`${databaseUrl}/${relativePath}.json`);
   if (idToken) url.searchParams.set("auth", idToken);
   return fetch(url, options);
}

async function run() {
   const auth = getFirebaseAuth();
   const database = getFirebaseDatabase();
   const timestamp = Date.now().toString();

   try {
      await database.ref().update({
         [`chatroom/${chatId}`]: {
            lastMessage: "",
            lastMessageSenderId: "",
            members: {
               user: { id: userId, name: "Rules Test User", profile: null },
               psychologist: {
                  id: psychologistId,
                  name: "Rules Test Psychologist",
                  profile: null,
                  prefix: null,
                  suffix: null,
               },
            },
            psychologistId,
            paymentOrderId: chatId,
            createdAt: timestamp,
            updatedAt: timestamp,
            isEnded: false,
         },
         [`userChats/${userId}/${chatId}`]: chatId,
         [`userChats/${psychologistId}/${chatId}`]: chatId,
      });

      const [userToken, psychologistToken] = await Promise.all([
         auth.createCustomToken(firebaseUserUid, {
            app_user_id: userId,
            role: "user",
         }).then(exchangeCustomToken),
         auth.createCustomToken(firebasePsychologistUid, {
            app_user_id: psychologistId,
            role: "psychologist",
         }).then(exchangeCustomToken),
      ]);

      assertStatus(
         await databaseRequest(`userChats/${userId}`, null),
         401,
         "Unauthenticated read"
      );
      assertStatus(
         await databaseRequest(`userChats/${userId}`, userToken),
         200,
         "Owner read"
      );
      assertStatus(
         await databaseRequest(`userChats/${psychologistId}`, userToken),
         401,
         "Other-user read"
      );

      const messageTimestamp = Date.now().toString();
      assertStatus(
         await databaseRequest("", userToken, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               [`messages/${chatId}/${messageId}`]: {
                  id: messageId,
                  chatRoomId: chatId,
                  senderId: userId,
                  content: "Rules test message",
                  createdAt: messageTimestamp,
               },
               [`chatroom/${chatId}/lastMessage`]: "Rules test message",
               [`chatroom/${chatId}/lastMessageSenderId`]: userId,
               [`chatroom/${chatId}/updatedAt`]: messageTimestamp,
            }),
         }),
         200,
         "Participant message"
      );

      assertStatus(
         await databaseRequest(`chatroom/${chatId}/isEnded`, userToken, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "true",
         }),
         401,
         "User ending session"
      );
      assertStatus(
         await databaseRequest(`chatroom/${chatId}/isEnded`, psychologistToken, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "true",
         }),
         200,
         "Psychologist ending session"
      );

      console.log("FIREBASE_RULES_OK");
   } finally {
      await database.ref().update({
         [`chatroom/${chatId}`]: null,
         [`messages/${chatId}`]: null,
         [`userChats/${userId}`]: null,
         [`userChats/${psychologistId}`]: null,
      });
      await Promise.allSettled([
         auth.deleteUser(firebaseUserUid),
         auth.deleteUser(firebasePsychologistUid),
      ]);
   }
}

run().then(() => process.exit(0)).catch((error) => {
   console.error(error.stack || error.message);
   if (error.cause) console.error(error.cause);
   process.exit(1);
});
