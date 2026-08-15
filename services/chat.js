const db = require("../models");
const { getFirebaseDatabase } = require("./firebase");

const { Psychologist, Users } = db;

function nullable(value) {
   return value ?? null;
}

async function ensurePaidChatRoom(transaction) {
   const [buyer, psychologist] = await Promise.all([
      Users.findByPk(transaction.buyer_id),
      Psychologist.findByPk(transaction.psychologist_id, {
         include: [{
            model: Users,
            as: "users",
            attributes: ["user_id", "name", "profile_photo_url"],
         }],
      }),
   ]);

   if (!buyer || !psychologist?.users) {
      throw new Error("Transaction participants could not be loaded");
   }

   const chatId = transaction.order_id;
   const userId = String(buyer.user_id);
   const psychologistUserId = String(psychologist.users.user_id);
   const database = getFirebaseDatabase();
   const chatReference = database.ref("chatroom").child(chatId);
   const existing = await chatReference.once("value");

   const updates = {
      [`userChats/${userId}/${chatId}`]: chatId,
      [`userChats/${psychologistUserId}/${chatId}`]: chatId,
   };

   if (!existing.exists()) {
      const timestamp = Date.now().toString();
      updates[`chatroom/${chatId}`] = {
         lastMessageSenderId: "",
         lastMessage: "",
         members: {
            user: {
               id: userId,
               name: buyer.name,
               profile: nullable(buyer.profile_photo_url),
            },
            psychologist: {
               id: psychologistUserId,
               name: psychologist.users.name,
               profile: nullable(psychologist.users.profile_photo_url),
               prefix: nullable(psychologist.prefix_title),
               suffix: nullable(psychologist.suffix_title),
            },
         },
         psychologistId: psychologistUserId,
         paymentOrderId: transaction.order_id,
         createdAt: timestamp,
         updatedAt: timestamp,
         isEnded: false,
      };
   }

   await database.ref().update(updates);
   return chatId;
}

module.exports = { ensurePaidChatRoom };
