module.exports = (sequelize, DataTypes) => {
	const User = sequelize.define(
		'User',
		{
			user_id: {
				type: DataTypes.STRING,
				allowNull: false,
				primaryKey: true,
			},
			user_info: {
				type: DataTypes.JSON,
				allowNull: true,
			},
			is_admin: {
				type: DataTypes.BOOLEAN,
				defaultValue: false,
				allowNull: false,
			},
			created_at: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			updated_at: {
				allowNull: false,
				type: DataTypes.DATE,
			},
			deleted_at: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			tenant_code: {
				type: DataTypes.STRING,
				allowNull: true,
				primaryKey: true,
			},
		},
		{ sequelize, modelName: 'User', tableName: 'users', freezeTableName: true, paranoid: true }
	)

	return User
}
