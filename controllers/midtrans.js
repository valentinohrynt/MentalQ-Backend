require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const db = require("../models");
const { ensurePaidChatRoom } = require("../services/chat");

const { Psychologist } = db;
const Transactions = db.transactions;

const midtransHeaders = () => ({
   "Content-Type": "application/json",
   Authorization: `Basic ${Buffer.from(process.env.MIDTRANS_SERVER_KEY).toString("base64")}:`,
});

function isSuccessfulPayment(status) {
   return status.transaction_status === "settlement"
      || (status.transaction_status === "capture"
         && (!status.fraud_status || status.fraud_status === "accept"));
}

exports.createTransaction = async (req, res) => {
   const { item_id } = req.body;

   try {
      if (!item_id) {
         return res.status(400).json({
            error: true,
            message: "item_id is required",
         });
      }

      const psychologist = await Psychologist.findOne({
         where: { user_id: item_id, isVerified: true },
      });
      if (!psychologist) {
         return res.status(404).json({ error: true, message: "Psychologist not found" });
      }

      const price = Number(psychologist.price);
      if (!Number.isSafeInteger(price) || price <= 0) {
         return res.status(422).json({ error: true, message: "Psychologist price is invalid" });
      }

      const order_id = `MentalQ-${crypto.randomUUID()}`;
      const requestBody = {
         transaction_details: {
            order_id,
            gross_amount: price,
         },
         credit_card: { secure: true },
         item_details: [
            {
               id: String(item_id),
               price,
               quantity: 1,
               name: "MentalQ - Psychologist Service",
            },
         ],
      };

      const response = await axios.post(
         "https://app.sandbox.midtrans.com/snap/v1/transactions",
         requestBody,
         { headers: midtransHeaders() }
      );

      await Transactions.create({
         order_id,
         psychologist_id: psychologist.psychologist_id,
         price,
         buyer_id: req.user_id,
      });

      return res.status(200).json({
         message: "Transaction created successfully",
         error: false,
         data: {
            item_id,
            order_id,
            token: response.data.token,
            redirect_url: response.data.redirect_url,
         },
      });
   } catch (error) {
      return res.status(500).json({ error: true, message: error.message });
   }
};

exports.getStatusTransaction = async (req, res) => {
   const { id } = req.params;

   try {
      const transaction = await Transactions.findOne({
         where: { order_id: id, buyer_id: req.user_id },
      });
      if (!transaction) {
         return res.status(404).json({ error: true, message: "Transaction not found" });
      }

      const response = await axios.get(
         `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(id)}/status`,
         { headers: midtransHeaders() }
      );
      let chatId = null;
      let chatError = null;
      if (isSuccessfulPayment(response.data)) {
         await transaction.update({ isPaid: true });
         try {
            chatId = await ensurePaidChatRoom(transaction);
         } catch (error) {
            console.error("Payment confirmed but chat creation failed:", error.message);
            chatError = "Payment is confirmed, but the chat is not ready. Please check again.";
         }
      }

      return res.status(200).json({
         message: "Transaction status retrieved successfully",
         error: false,
         data: {
            transaction_status: response.data.transaction_status,
            status_message: response.data.status_message,
            chat_id: chatId,
            chat_error: chatError,
         },
      });
   } catch (error) {
      return res.status(500).json({ error: true, message: error.message });
   }
};

exports.cancelTransaction = async (req, res) => {
   const { id } = req.params;

   try {
      const transaction = await Transactions.findOne({
         where: { order_id: id, buyer_id: req.user_id },
      });
      if (!transaction) {
         return res.status(404).json({ error: true, message: "Transaction not found" });
      }

      const response = await axios.post(
         `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(id)}/cancel`,
         {},
         { headers: midtransHeaders() }
      );
      if (response.data.status_code !== "200") {
         return res.status(400).json({ error: true, message: "Failed to cancel transaction" });
      }

      return res.status(200).json({
         message: "Transaction canceled successfully",
         error: false,
         data: {
            transaction_status: response.data.transaction_status,
            status_message: response.data.status_message,
         },
      });
   } catch (error) {
      return res.status(500).json({ error: true, message: error.message });
   }
};
