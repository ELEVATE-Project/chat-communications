'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.addColumn('users', 'tenant_code', {
			type: Sequelize.STRING,
			allowNull: true,
		})

		await queryInterface.addIndex('users', ['tenant_code'], {
			name: 'idx_users_tenant_code',
		})
	},

	async down(queryInterface, Sequelize) {
		await queryInterface.removeIndex('users', 'idx_users_tenant_code')
		await queryInterface.removeColumn('users', 'tenant_code')
	},
}
