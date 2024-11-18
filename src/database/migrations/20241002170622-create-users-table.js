'use strict'

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable('users', {
			user_id: {
				type: Sequelize.STRING,
				allowNull: false,
				primaryKey: true,
			},
			user_info: {
				type: Sequelize.JSON,
				allowNull: true,
			},
			is_admin: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
				allowNull: false,
			},
			created_at: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			updated_at: {
				allowNull: false,
				type: Sequelize.DATE,
			},
			deleted_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
		})
	},

	down: async (queryInterface, Sequelize) => {
		await queryInterface.dropTable('users')
	},
}
