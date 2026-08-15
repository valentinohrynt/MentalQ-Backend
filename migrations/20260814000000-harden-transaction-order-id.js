"use strict";

module.exports = {
   async up(queryInterface, Sequelize) {
      await queryInterface.changeColumn("transactions", "order_id", {
         type: Sequelize.STRING,
         allowNull: false,
      });
      await queryInterface.addIndex("transactions", ["order_id"], {
         unique: true,
         name: "transactions_order_id_unique",
      });
   },

   async down(queryInterface) {
      await queryInterface.removeIndex("transactions", "transactions_order_id_unique");

      // UUID order IDs cannot be converted safely back to integers. Keep the widened
      // column type when rolling back so existing payment references are preserved.
   },
};
