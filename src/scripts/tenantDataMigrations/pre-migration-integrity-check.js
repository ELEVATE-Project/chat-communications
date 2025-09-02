#!/usr/bin/env node
'use strict'

const { QueryTypes } = require('sequelize')
const fs = require('fs')
const path = require('path')
const DatabaseConnectionManager = require('./db-connection-utils')

class DatabaseIntegrityChecker {
	constructor() {
		// Initialize database connection manager with migration-specific settings
		this.dbManager = new DatabaseConnectionManager({
			poolMax: 5,
			poolMin: 0,
			logging: false,
		})
		this.sequelize = this.dbManager.getSequelize()

		this.issues = []
		this.warnings = []
		this.passed = []
		this.tableInfo = {}
		this.detailedIssues = []
		this.logFilePath = path.join(__dirname, 'data-integrity-issues.log')

		// CSV file path for validation - try multiple possible paths
		const possiblePaths = [
			path.join(__dirname, '../../../data/user_tenant_mapping.csv'),
			path.join(__dirname, '../../data/user_tenant_mapping.csv'),
			'/var/src/data/user_tenant_mapping.csv',
			path.join(__dirname, '../../../src/data/user_tenant_mapping.csv'),
		]

		this.csvFilePath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0]
	}

	async checkConnection() {
		try {
			const connectionResult = await this.dbManager.checkConnection()

			if (connectionResult.success) {
				console.log(`✅ Connected to: ${connectionResult.details.database}`)
				console.log(`⏱️  Connection time: ${connectionResult.details.connectionTime}ms`)
				return true
			} else {
				this.issues.push(`Connection failed: ${connectionResult.message}`)
				return false
			}
		} catch (error) {
			this.issues.push(`Connection error: ${error.message}`)
			return false
		}
	}

	/**
	 * Check if users table exists and has required structure
	 */
	async checkUsersTable() {
		console.log('🔍 Checking users table structure...')

		try {
			// Check if users table exists
			const tableExists = await this.sequelize.query(
				`SELECT EXISTS (
					SELECT FROM information_schema.tables 
					WHERE table_schema = 'public' 
					AND table_name = 'users'
				) as exists`,
				{ type: QueryTypes.SELECT }
			)

			if (!tableExists[0].exists) {
				this.issues.push('❌ Users table does not exist')
				return false
			}

			// Check table structure
			const columns = await this.sequelize.query(
				`SELECT column_name, data_type, is_nullable, column_default
				 FROM information_schema.columns 
				 WHERE table_schema = 'public' 
				 AND table_name = 'users'
				 ORDER BY ordinal_position`,
				{ type: QueryTypes.SELECT }
			)

			const columnNames = columns.map((col) => col.column_name)

			// Check required columns
			const requiredColumns = ['user_id', 'user_info', 'is_admin', 'created_at', 'updated_at', 'tenant_code']
			const missingColumns = requiredColumns.filter((col) => !columnNames.includes(col))

			if (missingColumns.length > 0) {
				this.issues.push(`❌ Missing columns in users table: ${missingColumns.join(', ')}`)
				return false
			}

			// Check if tenant_code column allows NULL
			const tenantCodeColumn = columns.find((col) => col.column_name === 'tenant_code')
			if (!tenantCodeColumn) {
				this.issues.push('❌ tenant_code column not found')
				return false
			}

			if (tenantCodeColumn.is_nullable !== 'YES') {
				this.warnings.push('⚠️  tenant_code column does not allow NULL - this is expected after migration')
			}

			this.passed.push('✅ Users table structure validated')

			// Get table statistics
			const stats = await this.sequelize.query(
				`SELECT 
					COUNT(*) as total_users,
					COUNT(tenant_code) as users_with_tenant_code,
					COUNT(*) - COUNT(tenant_code) as users_without_tenant_code
				 FROM users 
				 WHERE deleted_at IS NULL`,
				{ type: QueryTypes.SELECT }
			)

			this.tableInfo.users = stats[0]
			console.log(`📊 Users table stats:`)
			console.log(`   Total users: ${stats[0].total_users}`)
			console.log(`   Users with tenant_code: ${stats[0].users_with_tenant_code}`)
			console.log(`   Users without tenant_code: ${stats[0].users_without_tenant_code}`)

			return true
		} catch (error) {
			this.issues.push(`❌ Error checking users table: ${error.message}`)
			return false
		}
	}

	/**
	 * Check for NULL or invalid user_id values
	 */
	async checkUserIdIntegrity() {
		console.log('🔍 Checking user_id integrity...')

		try {
			// Check for NULL user_ids
			const nullUserIds = await this.sequelize.query(
				'SELECT COUNT(*) as count FROM users WHERE user_id IS NULL',
				{ type: QueryTypes.SELECT }
			)

			if (parseInt(nullUserIds[0].count) > 0) {
				this.issues.push(`❌ Found ${nullUserIds[0].count} users with NULL user_id`)
				return false
			}

			// Check for empty string user_ids
			const emptyUserIds = await this.sequelize.query(
				"SELECT COUNT(*) as count FROM users WHERE user_id = '' OR user_id = ' '",
				{ type: QueryTypes.SELECT }
			)

			if (parseInt(emptyUserIds[0].count) > 0) {
				this.issues.push(`❌ Found ${emptyUserIds[0].count} users with empty user_id`)
				return false
			}

			// Check for duplicate user_ids
			const duplicateUserIds = await this.sequelize.query(
				`SELECT user_id, COUNT(*) as count 
				 FROM users 
				 WHERE deleted_at IS NULL
				 GROUP BY user_id 
				 HAVING COUNT(*) > 1`,
				{ type: QueryTypes.SELECT }
			)

			if (duplicateUserIds.length > 0) {
				this.issues.push(`❌ Found ${duplicateUserIds.length} duplicate user_id values`)
				duplicateUserIds.slice(0, 5).forEach((dup) => {
					this.detailedIssues.push(`Duplicate user_id: ${dup.user_id} (${dup.count} occurrences)`)
				})
				return false
			}

			this.passed.push('✅ User ID integrity validated')
			return true
		} catch (error) {
			this.issues.push(`❌ Error checking user_id integrity: ${error.message}`)
			return false
		}
	}

	/**
	 * Check CSV file existence and format
	 */
	async checkCSVFile() {
		console.log('🔍 Checking CSV file...')

		try {
			// Check if CSV file exists
			if (!fs.existsSync(this.csvFilePath)) {
				this.issues.push(`❌ CSV file not found: ${this.csvFilePath}`)
				return false
			}

			// Check file size
			const stats = fs.statSync(this.csvFilePath)
			if (stats.size === 0) {
				this.issues.push('❌ CSV file is empty')
				return false
			}

			console.log(`📁 CSV file size: ${(stats.size / 1024).toFixed(2)} KB`)

			// Read and validate CSV format
			const csvContent = fs.readFileSync(this.csvFilePath, 'utf8')
			const lines = csvContent.trim().split('\n')

			if (lines.length < 2) {
				this.issues.push('❌ CSV file must have header and at least one data row')
				return false
			}

			// Check header - normalize quotes
			const header = lines[0].trim().replace(/['"]/g, '')
			const expectedHeader = 'user_id,tenant_code'

			if (header !== expectedHeader) {
				this.issues.push(`❌ Invalid CSV header. Expected: "${expectedHeader}", Found: "${lines[0].trim()}"`)
				return false
			}

			// Check first few data rows for format
			let validRows = 0
			let invalidRows = 0
			const sampleInvalidRows = []

			for (let i = 1; i < Math.min(lines.length, 11); i++) {
				const line = lines[i].trim()
				if (!line) continue

				const parts = line.split(',')
				if (parts.length !== 2) {
					invalidRows++
					sampleInvalidRows.push({ line: i + 1, content: line })
				} else {
					const userId = parts[0].trim().replace(/['"]/g, '')
					const tenantCode = parts[1].trim().replace(/['"]/g, '')

					if (!userId || !tenantCode) {
						invalidRows++
						sampleInvalidRows.push({ line: i + 1, content: line, reason: 'Empty user_id or tenant_code' })
					} else {
						validRows++
					}
				}
			}

			if (invalidRows > 0) {
				this.warnings.push(`⚠️  Found ${invalidRows} invalid rows in CSV sample (first 10 rows)`)
				sampleInvalidRows.forEach((row) => {
					this.detailedIssues.push(`Invalid CSV row ${row.line}: ${row.content} ${row.reason || ''}`)
				})
			}

			const totalDataRows = lines.length - 1
			console.log(`📊 CSV file stats:`)
			console.log(`   Total data rows: ${totalDataRows}`)
			console.log(`   Sample valid rows: ${validRows}`)
			console.log(`   Sample invalid rows: ${invalidRows}`)

			this.tableInfo.csv = {
				totalRows: totalDataRows,
				sampleValidRows: validRows,
				sampleInvalidRows: invalidRows,
			}

			this.passed.push('✅ CSV file format validated')
			return true
		} catch (error) {
			this.issues.push(`❌ Error checking CSV file: ${error.message}`)
			return false
		}
	}

	/**
	 * Check if all database users have corresponding CSV entries
	 */
	async checkCSVCoverage() {
		console.log('🔍 Checking CSV coverage against database users...')

		try {
			// This is a simplified check - we'll load a sample of CSV data
			// and check if some database users are covered
			const csvContent = fs.readFileSync(this.csvFilePath, 'utf8')
			const lines = csvContent.trim().split('\n').slice(1) // Skip header

			const csvUserIds = new Set()
			let processedLines = 0

			// Load CSV user IDs into a Set for quick lookup
			for (const line of lines) {
				if (!line.trim()) continue

				const parts = line.split(',')
				if (parts.length === 2) {
					const userId = parts[0].trim().replace(/['"]/g, '')
					if (userId) {
						csvUserIds.add(userId)
						processedLines++
					}
				}
			}

			// Get sample of database users
			const dbUsers = await this.sequelize.query(
				'SELECT user_id FROM users WHERE deleted_at IS NULL ORDER BY user_id LIMIT 100',
				{ type: QueryTypes.SELECT }
			)

			// Check coverage for sample
			let coveredUsers = 0
			let uncoveredUsers = 0
			const sampleUncoveredUsers = []

			for (const user of dbUsers) {
				if (csvUserIds.has(user.user_id)) {
					coveredUsers++
				} else {
					uncoveredUsers++
					if (sampleUncoveredUsers.length < 10) {
						sampleUncoveredUsers.push(user.user_id)
					}
				}
			}

			const coveragePercent = ((coveredUsers / dbUsers.length) * 100).toFixed(2)

			console.log(`📊 CSV coverage analysis (sample of ${dbUsers.length} users):`)
			console.log(`   CSV entries processed: ${processedLines}`)
			console.log(`   Database users covered: ${coveredUsers}/${dbUsers.length} (${coveragePercent}%)`)
			console.log(`   Database users not covered: ${uncoveredUsers}`)

			if (uncoveredUsers > 0) {
				this.warnings.push(
					`⚠️  ${uncoveredUsers} database users not found in CSV (from sample of ${dbUsers.length})`
				)
				if (sampleUncoveredUsers.length > 0) {
					this.detailedIssues.push(`Sample uncovered users: ${sampleUncoveredUsers.join(', ')}`)
				}
			}

			this.tableInfo.csvCoverage = {
				sampleSize: dbUsers.length,
				csvEntries: processedLines,
				covered: coveredUsers,
				uncovered: uncoveredUsers,
				coveragePercent: parseFloat(coveragePercent),
			}

			if (coveragePercent < 50) {
				this.issues.push(`❌ CSV coverage too low: ${coveragePercent}% (minimum 50% recommended)`)
				return false
			}

			this.passed.push('✅ CSV coverage validated')
			return true
		} catch (error) {
			this.issues.push(`❌ Error checking CSV coverage: ${error.message}`)
			return false
		}
	}

	/**
	 * Run all integrity checks
	 */
	async runAllChecks() {
		console.log('🚀 Starting database integrity checks for Chat Communications migration...')
		console.log('=' * 80)

		const checks = [
			{ name: 'Database Connection', func: this.checkConnection.bind(this) },
			{ name: 'Users Table Structure', func: this.checkUsersTable.bind(this) },
			{ name: 'User ID Integrity', func: this.checkUserIdIntegrity.bind(this) },
			{ name: 'CSV File Validation', func: this.checkCSVFile.bind(this) },
			{ name: 'CSV Coverage Analysis', func: this.checkCSVCoverage.bind(this) },
		]

		let allPassed = true

		for (const check of checks) {
			console.log(`\n🔄 Running: ${check.name}`)
			const result = await check.func()
			if (!result) {
				allPassed = false
				console.log(`❌ ${check.name} failed`)
			} else {
				console.log(`✅ ${check.name} passed`)
			}
		}

		return allPassed
	}

	/**
	 * Generate detailed report
	 */
	generateReport() {
		console.log('\n' + '=' * 80)
		console.log('📋 DATABASE INTEGRITY CHECK REPORT')
		console.log('=' * 80)

		console.log(`\n✅ PASSED CHECKS (${this.passed.length}):`)
		this.passed.forEach((check) => console.log(`   ${check}`))

		if (this.warnings.length > 0) {
			console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`)
			this.warnings.forEach((warning) => console.log(`   ${warning}`))
		}

		if (this.issues.length > 0) {
			console.log(`\n❌ ISSUES (${this.issues.length}):`)
			this.issues.forEach((issue) => console.log(`   ${issue}`))
		}

		if (this.detailedIssues.length > 0) {
			console.log(`\n🔍 DETAILED ISSUES:`)
			this.detailedIssues.forEach((detail) => console.log(`   ${detail}`))
		}

		console.log(`\n📊 SUMMARY:`)
		console.log(`   Total passed: ${this.passed.length}`)
		console.log(`   Total warnings: ${this.warnings.length}`)
		console.log(`   Total issues: ${this.issues.length}`)

		if (this.tableInfo.users) {
			console.log(`\n📋 TABLE INFORMATION:`)
			console.log(`   Users total: ${this.tableInfo.users.total_users}`)
			console.log(`   Users with tenant_code: ${this.tableInfo.users.users_with_tenant_code}`)
			console.log(`   Users without tenant_code: ${this.tableInfo.users.users_without_tenant_code}`)
		}

		if (this.tableInfo.csvCoverage) {
			console.log(`\n📄 CSV COVERAGE:`)
			console.log(`   Sample size: ${this.tableInfo.csvCoverage.sampleSize}`)
			console.log(`   Coverage: ${this.tableInfo.csvCoverage.coveragePercent}%`)
			console.log(`   CSV entries: ${this.tableInfo.csvCoverage.csvEntries}`)
		}

		const overallStatus = this.issues.length === 0 ? '✅ READY FOR MIGRATION' : '❌ NOT READY FOR MIGRATION'
		console.log(`\n🎯 OVERALL STATUS: ${overallStatus}`)

		if (this.issues.length > 0) {
			console.log('\n💡 RECOMMENDATIONS:')
			console.log('   1. Fix all reported issues before proceeding with migration')
			console.log('   2. Ensure CSV file covers all database users')
			console.log('   3. Verify CSV data format and content')
			console.log('   4. Create a database backup before migration')
		}

		console.log('\n' + '=' * 80)

		return this.issues.length === 0
	}

	/**
	 * Write detailed log file
	 */
	writeLogFile() {
		try {
			const logContent = [
				`Database Integrity Check Report - ${new Date().toISOString()}`,
				'=' * 60,
				'',
				'PASSED CHECKS:',
				...this.passed.map((check) => `✅ ${check}`),
				'',
				'WARNINGS:',
				...this.warnings.map((warning) => `⚠️ ${warning}`),
				'',
				'ISSUES:',
				...this.issues.map((issue) => `❌ ${issue}`),
				'',
				'DETAILED ISSUES:',
				...this.detailedIssues,
				'',
				'TABLE INFORMATION:',
				JSON.stringify(this.tableInfo, null, 2),
				'',
			].join('\n')

			fs.writeFileSync(this.logFilePath, logContent)
			console.log(`📝 Detailed log written to: ${this.logFilePath}`)
		} catch (error) {
			console.error(`❌ Error writing log file: ${error.message}`)
		}
	}

	async close() {
		await this.dbManager.close()
	}
}

// Main execution
async function main() {
	const checker = new DatabaseIntegrityChecker()

	try {
		const allChecksPassed = await checker.runAllChecks()
		const reportResult = checker.generateReport()
		checker.writeLogFile()

		process.exit(allChecksPassed && reportResult ? 0 : 1)
	} catch (error) {
		console.error('❌ Critical error during integrity check:', error)
		process.exit(1)
	} finally {
		await checker.close()
	}
}

// Run if called directly
if (require.main === module) {
	main()
}

module.exports = DatabaseIntegrityChecker
