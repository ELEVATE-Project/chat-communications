'use strict'

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.sequelize.query(`
      ALTER TABLE users
      ALTER COLUMN user_info
      SET DATA TYPE JSONB
      USING user_info::jsonb;
    `)
	},

	down: async (queryInterface, Sequelize) => {
		await queryInterface.sequelize.query(`
      ALTER TABLE users
      ALTER COLUMN user_info
      SET DATA TYPE JSON
      USING user_info::json;
    `)
	},
}
