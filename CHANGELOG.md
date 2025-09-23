# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-16

### Added
- Initial release of sqldef-preview-action
- Support for MySQL, PostgreSQL, SQLite3, and SQL Server databases
- Automatic sqldef binary download from GitHub releases
- Database migration preview using `--dry-run` mode
- Automatic PR commenting with migration plans
- Comprehensive input validation and error handling
- Support for all sqldef configuration options including:
  - Database connection parameters for all supported databases
  - `--enable-drop` for destructive operations
  - `--config` for YAML configuration files
- Example workflows and schema files for testing
- Full test suite with Jest
- Comprehensive documentation and usage examples

### Features
- 🔍 **Preview Migrations**: See exactly what DDL statements will be executed
- 🗃️ **Multi-Database Support**: Works with MySQL, PostgreSQL, SQLite3, and SQL Server
- 💬 **PR Comments**: Automatically comments migration plans on pull requests
- 🔄 **Idempotent**: Safe to run multiple times with consistent results
- ⚙️ **Configurable**: Supports all sqldef configuration options
- 🛡️ **Error Handling**: Robust error handling and validation
- 🧪 **Well Tested**: Comprehensive test suite ensuring reliability