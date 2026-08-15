"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
   class Transactions extends Model {
      /**
       * Helper method for defining associations.
       * This method is not a part of Sequelize lifecycle.
       * The `models/index` file will call this method automatically.
       */
      static associate(models) {
         Transactions.belongsTo(models.Psychologist, {
            foreignKey: "psychologist_id",
            as: "psychologist",
         });

         Transactions.belongsTo(models.Users, {
            foreignKey: "buyer_id",
            as: "users",
         });
      }
   }
   Transactions.init(
      {
         transaction_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            field: "transaction_id",
         },

         order_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
         },

         psychologist_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
               model: "psychologist",
               key: "psychologist_id",
            },
         },

         price: { type: DataTypes.INTEGER, allowNull: false },

         buyer_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
               model: "users",
               key: "user_id",
            },
         },

         isPaid: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
         },
      },
      {
         sequelize,
         modelName: "transactions",
      }
   );
   return Transactions;
};
