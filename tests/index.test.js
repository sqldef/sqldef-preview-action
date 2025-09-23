const { buildSqldefArgs } = require('../src/index.js');

describe('sqldef-preview-action', () => {
  describe('buildSqldefArgs', () => {
    test('builds MySQL arguments correctly', () => {
      const inputs = {
        'mysql-host': '127.0.0.1',
        'mysql-port': '3306',
        'mysql-user': 'root',
        'mysql-password': 'password',
        'mysql-database': 'test_db',
        'schema-file': 'schema.sql',
        'enable-drop': 'false'
      };

      const args = buildSqldefArgs('mysql', inputs, { dryRun: true });
      
      expect(args).toContain('--host');
      expect(args).toContain('127.0.0.1');
      expect(args).toContain('--port');
      expect(args).toContain('3306');
      expect(args).toContain('--user');
      expect(args).toContain('root');
      expect(args).toContain('--password');
      expect(args).toContain('password');
      expect(args).toContain('test_db');
      expect(args).toContain('--dry-run');
      expect(args).toContain('--file');
      expect(args).toContain('schema.sql');
    });

    test('builds PostgreSQL arguments correctly', () => {
      const inputs = {
        'postgresql-host': 'localhost',
        'postgresql-port': '5432',
        'postgresql-user': 'postgres',
        'postgresql-database': 'mydb',
        'schema-file': 'schema.sql'
      };

      const args = buildSqldefArgs('postgresql', inputs);
      
      expect(args).toContain('--host');
      expect(args).toContain('localhost');
      expect(args).toContain('--port');
      expect(args).toContain('5432');
      expect(args).toContain('--user');
      expect(args).toContain('postgres');
      expect(args).toContain('mydb');
      expect(args).toContain('--file');
      expect(args).toContain('schema.sql');
      expect(args).not.toContain('--dry-run');
    });

    test('builds SQLite3 arguments correctly', () => {
      const inputs = {
        'sqlite3-file': 'test.db',
        'schema-file': 'schema.sql'
      };

      const args = buildSqldefArgs('sqlite3', inputs);
      
      expect(args).toContain('test.db');
      expect(args).toContain('--file');
      expect(args).toContain('schema.sql');
    });

    test('includes enable-drop when set to true', () => {
      const inputs = {
        'mysql-database': 'test_db',
        'schema-file': 'schema.sql',
        'enable-drop': 'true'
      };

      const args = buildSqldefArgs('mysql', inputs);
      
      expect(args).toContain('--enable-drop');
    });

    test('includes config file when provided', () => {
      const inputs = {
        'mysql-database': 'test_db',
        'schema-file': 'schema.sql',
        'config-file': 'config.yml'
      };

      const args = buildSqldefArgs('mysql', inputs);
      
      expect(args).toContain('--config');
      expect(args).toContain('config.yml');
    });

    test('throws error for unsupported database type', () => {
      const inputs = {
        'schema-file': 'schema.sql'
      };

      expect(() => {
        buildSqldefArgs('unsupported', inputs);
      }).toThrow('Unsupported database type: unsupported');
    });
  });
});