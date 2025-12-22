'use strict'

module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Use a transaction to ensure atomic operations
		const transaction = await queryInterface.sequelize.transaction()

		try {
			console.log('🚀 Starting chat-communications tenant-code migration...')
			console.log('='.repeat(70))

			// Environment variables for default values
			const defaultTenantCode = process.env.DEFAULT_TENANT_CODE

			console.log(`📋 Environment Variables:`)
			console.log(`   DEFAULT_TENANT_CODE: ${defaultTenantCode || 'NOT SET'}`)
			console.log('='.repeat(70))

			if (!defaultTenantCode) {
				throw new Error('DEFAULT_TENANT_CODE environment variable is required')
			}

			const tableName = 'users'

			console.log('\n📝 PHASE 1: Adding tenant_code column...')
			console.log('='.repeat(50))

			// Check if table exists
			const tableExists = await queryInterface.sequelize.query(
				`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :tableName)`,
				{
					replacements: { tableName },
					type: Sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			if (!tableExists[0].exists) {
				throw new Error(`Table ${tableName} does not exist`)
			}

			// Check if tenant_code column already exists
			const columnExists = await queryInterface.sequelize.query(
				`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = :tableName AND column_name = 'tenant_code')`,
				{
					replacements: { tableName },
					type: Sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			if (!columnExists[0].exists) {
				await queryInterface.addColumn(
					tableName,
					'tenant_code',
					{
						type: Sequelize.STRING(255),
						allowNull: true, // Start as nullable
					},
					{ transaction }
				)
				console.log(`✅ Added tenant_code to ${tableName}`)
			} else {
				console.log(`✅ ${tableName} already has tenant_code column`)
			}

			console.log('\n📝 PHASE 2: Populating default values for tenant_code...')
			console.log('='.repeat(50))

			// Update NULL tenant_code values with default
			const [, rowsAffected] = await queryInterface.sequelize.query(
				`UPDATE ${tableName} SET tenant_code = :defaultTenantCode WHERE tenant_code IS NULL`,
				{
					replacements: { defaultTenantCode },
					type: Sequelize.QueryTypes.UPDATE,
					transaction,
				}
			)

			console.log(`✅ Updated ${tableName}: ${rowsAffected} rows with default tenant_code`)

			console.log('\n📝 PHASE 3: Making tenant_code non-nullable...')
			console.log('='.repeat(50))

			await queryInterface.changeColumn(
				tableName,
				'tenant_code',
				{
					type: Sequelize.STRING(255),
					allowNull: false, // Now required
				},
				{ transaction }
			)

			console.log(`✅ Made tenant_code non-nullable in ${tableName}`)

			console.log('\n📝 PHASE 4: Updating primary key constraint...')
			console.log('='.repeat(50))

			// Get current primary key constraint
			const currentConstraints = await queryInterface.sequelize.query(
				`SELECT constraint_name 
				FROM information_schema.table_constraints 
				WHERE table_name = :tableName 
				AND constraint_type = 'PRIMARY KEY'`,
				{
					replacements: { tableName },
					type: Sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			// Drop existing primary key constraint if exists
			if (currentConstraints.length > 0) {
				const constraintName = currentConstraints[0].constraint_name
				console.log(`   Dropping existing primary key: ${constraintName}`)

				await queryInterface.sequelize.query(`ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`, {
					transaction,
				})
			}

			// Create composite primary key
			console.log('   Creating composite primary key (user_id, tenant_code)')
			await queryInterface.sequelize.query(
				`ALTER TABLE ${tableName} ADD CONSTRAINT users_pkey PRIMARY KEY (user_id, tenant_code)`,
				{ transaction }
			)

			console.log('\n📝 PHASE 5: Adding indexes...')
			console.log('='.repeat(50))

			// Create index for tenant_code lookups (if not exists)
			await queryInterface.sequelize.query(
				`CREATE INDEX IF NOT EXISTS idx_users_tenant_code ON ${tableName} (tenant_code)`,
				{ transaction }
			)

			console.log(`✅ Created index: idx_users_tenant_code`)

			// Commit the transaction
			await transaction.commit()

			console.log('\n🎯 CHAT COMMUNICATIONS TENANT MIGRATION COMPLETED!')
			console.log('='.repeat(70))
			console.log('✅ All operations completed within single transaction')
			console.log('✅ Column added, populated, made non-nullable, and primary key updated')
			console.log('✅ Composite primary key (user_id, tenant_code) created')
			console.log('✅ Indexes created for performance')
			console.log('='.repeat(70))
		} catch (error) {
			// Rollback the transaction on any error
			await transaction.rollback()
			console.error('❌ Chat communications migration failed, transaction rolled back:', error)
			throw error
		}
	},

	down: async (queryInterface, Sequelize) => {
		const transaction = await queryInterface.sequelize.transaction()

		try {
			console.log('🔄 Rolling back chat-communications tenant-code migration...')

			const tableName = 'users'

			// Remove composite primary key constraint and restore original
			const currentConstraints = await queryInterface.sequelize.query(
				`SELECT constraint_name 
				FROM information_schema.table_constraints 
				WHERE table_name = :tableName 
				AND constraint_type = 'PRIMARY KEY'`,
				{
					replacements: { tableName },
					type: queryInterface.sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			if (currentConstraints.length > 0) {
				const constraintName = currentConstraints[0].constraint_name
				// Only drop if it's not the original users_pkey constraint
				if (constraintName !== 'users_pkey') {
					await queryInterface.sequelize.query(`ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`, {
						transaction,
					})
					console.log(`✅ Removed composite primary key constraint: ${constraintName}`)

					// Restore original primary key
					await queryInterface.sequelize.query(
						`ALTER TABLE ${tableName} ADD CONSTRAINT users_pkey PRIMARY KEY (user_id)`,
						{ transaction }
					)
					console.log(`✅ Restored original primary key (user_id)`)
				} else {
					console.log(`ℹ️  Original primary key already in place: ${constraintName}`)
				}
			} else {
				console.log(`ℹ️  No primary key constraint found`)
			}

			// Remove index if exists
			const indexExists = await queryInterface.sequelize.query(
				`SELECT indexname 
				FROM pg_indexes 
				WHERE tablename = :tableName 
				AND indexname = :indexName`,
				{
					replacements: { tableName, indexName: 'idx_users_tenant_code' },
					type: queryInterface.sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			if (indexExists.length > 0) {
				await queryInterface.removeIndex(tableName, 'idx_users_tenant_code', { transaction })
				console.log(`✅ Removed index: idx_users_tenant_code`)
			} else {
				console.log(`ℹ️  Index idx_users_tenant_code does not exist`)
			}

			// Remove tenant_code column if exists
			const columnExists = await queryInterface.sequelize.query(
				`SELECT column_name 
				FROM information_schema.columns 
				WHERE table_name = :tableName 
				AND column_name = :columnName`,
				{
					replacements: { tableName, columnName: 'tenant_code' },
					type: queryInterface.sequelize.QueryTypes.SELECT,
					transaction,
				}
			)

			if (columnExists.length > 0) {
				await queryInterface.removeColumn(tableName, 'tenant_code', { transaction })
				console.log(`✅ Removed tenant_code column`)
			} else {
				console.log(`ℹ️  Column tenant_code does not exist`)
			}

			await transaction.commit()
			console.log('✅ Rollback completed')
		} catch (error) {
			await transaction.rollback()
			console.error('❌ Rollback failed, transaction rolled back:', error)
			throw error
		}
	},
}
